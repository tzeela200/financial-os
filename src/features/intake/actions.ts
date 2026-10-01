"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCorrelationId } from "@/lib/correlation";
import { log } from "@/lib/server/logger";
import { intakeMethodsFor } from "./intake-methods";
import { sha256Hex } from "./sha256";
import { sourceObjectPath, pastedTextFilename } from "./storage-path";
import { runDueJobs, PROCESSING_VERSION } from "@/features/processing/process-file";

// Intake commands (18D §16 POST /api/intake/upload, /manual-report) as thin Server Actions (18D §60).
// Files go straight to private Storage through a signed upload URL (DR-B); the server re-reads the stored object,
// computes sha256 itself and registers everything atomically through the intake RPC (migration 021).
const BUCKET = "financial-source-files";
const MAX_BYTES = 50 * 1024 * 1024; // bucket file_size_limit (migration 019)

export type IntakeResult =
  | { ok: true; status: "uploaded" | "duplicate"; message: string; fileId?: string }
  | { ok: false; message: string; correlationId: string };

const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "צריך להתחבר מחדש כדי לקלוט מקור.",
  AUTH_FORBIDDEN_PATH: "הקובץ לא נשמר במיקום המורשה. נסי שוב.",
  FILE_NOT_UPLOADED: "הקובץ לא הגיע לאחסון. נסי להעלות שוב.",
  VALIDATE_USER_REPORT_NOT_FILE: "דיווח ידני נקלט בטופס הדיווח, לא כקובץ.",
  VALIDATE_TEXT_NOT_ALLOWED: "לסוג מקור זה אפשר לקלוט קובץ בלבד.",
  VALIDATE_INTAKE_METHOD: "שיטת הקליטה אינה מתאימה לסוג המקור.",
  VALIDATE_ENUM: "יש לבחור נושא מהרשימה.",
  VALIDATE_REQUIRED_FIELD: "יש לכתוב את תוכן הדיווח.",
};

async function context() {
  const correlationId = getCorrelationId(await headers());
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub ?? null;
  return { correlationId, supabase, uid };
}

function fail(correlationId: string, code: string, fallback = "הקליטה לא הושלמה. המידע השמור לא נפגע. אפשר לנסות שוב."): IntakeResult {
  return { ok: false, message: MESSAGES[code] ?? fallback, correlationId };
}

function codeOf(error: { message?: string } | null): string {
  return (error?.message ?? "").split(/\s/)[0];
}

function done(status: "uploaded" | "duplicate"): IntakeResult {
  revalidatePath("/");
  revalidatePath("/sources", "layout");
  return {
    ok: true,
    status,
    message: status === "duplicate"
      ? "זוהה עותק זהה לקובץ שכבר נקלט. הוא נשמר ומסומן ככפילות, ולא ייספר פעמיים."
      : "הקובץ נקלט ונשמר כפי שהוא. הוא ממתין לעיבוד.", // Uploaded ≠ Processed (21D §9, 22F §13)
  };
}

const PrepareInput = z.object({
  sourceType: z.string().min(1),
  filename: z.string().min(1).max(255),
  mime: z.string().max(255),
  size: z.number().int().min(1).max(MAX_BYTES),
});

export type PreparedUpload = { ok: true; sourceId: string; fileId: string; path: string; token: string } | { ok: false; message: string; correlationId: string };

export async function prepareFileUpload(input: z.infer<typeof PrepareInput>): Promise<PreparedUpload> {
  const { correlationId, supabase, uid } = await context();
  if (!uid) return { ok: false, message: MESSAGES.AUTH_REQUIRED, correlationId };
  const parsed = PrepareInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "הקובץ ריק או גדול מ־50MB.", correlationId };
  if (!intakeMethodsFor(parsed.data.sourceType).includes("file")) return { ok: false, message: MESSAGES.VALIDATE_INTAKE_METHOD, correlationId };

  const sourceId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const path = sourceObjectPath(uid, sourceId, fileId, parsed.data.filename, parsed.data.mime);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    log("request_log", correlationId, { event: "intake_prepare_failed", reason: error?.message ?? "no_data" });
    return { ok: false, message: "לא ניתן היה להכין את ההעלאה. נסי שוב.", correlationId };
  }
  return { ok: true, sourceId, fileId, path, token: data.token };
}

const FinalizeInput = z.object({
  clientRequestId: z.string().min(8).max(100),
  sourceType: z.string().min(1),
  sourceId: z.string().uuid(),
  fileId: z.string().uuid(),
  path: z.string().min(1),
  filename: z.string().min(1).max(255),
  mime: z.string().max(255),
});

export async function finalizeFileUpload(input: z.infer<typeof FinalizeInput>): Promise<IntakeResult> {
  const { correlationId, supabase, uid } = await context();
  if (!uid) return fail(correlationId, "AUTH_REQUIRED");
  const parsed = FinalizeInput.safeParse(input);
  if (!parsed.success) return fail(correlationId, "VALIDATE_INTAKE_METHOD");
  const p = parsed.data;

  const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(p.path);
  if (dlError || !blob) return fail(correlationId, "FILE_NOT_UPLOADED");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const { data, error } = await supabase.rpc("intake_register_file", {
    p_client_request_id: p.clientRequestId,
    p_source_type: p.sourceType,
    p_source_name: p.filename,
    p_context: "unknown",
    p_source_id: p.sourceId,
    p_file_id: p.fileId,
    p_storage_path: p.path,
    p_original_filename: p.filename,
    p_mime_type: p.mime || "application/octet-stream",
    p_size_bytes: bytes.byteLength,
    p_sha256: await sha256Hex(bytes),
    p_intake_method: "file",
    p_correlation_id: correlationId,
  });
  if (error) {
    log("request_log", correlationId, { event: "intake_register_failed", code: codeOf(error) });
    return fail(correlationId, codeOf(error));
  }
  const status = (data as { status: "uploaded" | "duplicate" }).status;
  const result = done(status);
  if (!result.ok || status !== "uploaded") return result;
  // Upload = register + enqueue (18B §4; 18 V2 §44). Processing runs on the server after the response — not in this request.
  const queued = await enqueueAndRun(supabase, p.fileId, "process_source", correlationId);
  return { ...result, fileId: p.fileId, message: queued ? "הקובץ נשמר ונכנס לעיבוד. התוצאה תופיע במסך הקובץ ובתמונת המצב." : "הקובץ נשמר. העיבוד לא הופעל, ואפשר להפעיל אותו ממסך הקובץ." };
}

async function enqueueAndRun(supabase: Awaited<ReturnType<typeof createClient>>, fileId: string, jobType: "process_source" | "reprocess_source", correlationId: string): Promise<boolean> {
  const { data: jobId, error } = await supabase.rpc("processing_enqueue", { p_file_id: fileId, p_job_type: jobType, p_processing_version: PROCESSING_VERSION, p_correlation_id: correlationId });
  if (error || !jobId) {
    log("request_log", correlationId, { event: "processing_enqueue_failed", code: codeOf(error) });
    return false;
  }
  after(async () => {
    await runDueJobs(supabase, { jobId: jobId as string });
    revalidatePath("/");
    revalidatePath("/sources", "layout");
  });
  return true;
}

/** Manual, safe retry / start for a stored file (D3: a manual retry is enough for this slice). Idempotent per version. */
export async function processFile(fileId: string): Promise<IntakeResult> {
  const { correlationId, supabase, uid } = await context();
  if (!uid) return fail(correlationId, "AUTH_REQUIRED");
  if (!z.string().uuid().safeParse(fileId).success) return fail(correlationId, "VALIDATE_INTAKE_METHOD");
  const queued = await enqueueAndRun(supabase, fileId, "process_source", correlationId);
  if (!queued) return { ok: false, message: "לא ניתן היה להפעיל את העיבוד. המידע השמור לא נפגע.", correlationId };
  return { ok: true, status: "uploaded", fileId, message: "העיבוד הופעל. רענני את המסך בעוד כמה שניות." };
}

const TextInput = z.object({
  clientRequestId: z.string().min(8).max(100),
  sourceType: z.string().min(1),
  title: z.string().max(200).optional(),
  text: z.string().trim().min(1).max(200_000),
});

export async function submitPastedText(input: z.infer<typeof TextInput>): Promise<IntakeResult> {
  const { correlationId, supabase, uid } = await context();
  if (!uid) return fail(correlationId, "AUTH_REQUIRED");
  const parsed = TextInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "יש להדביק או לכתוב את טקסט המקור.", correlationId };
  const p = parsed.data;
  if (!intakeMethodsFor(p.sourceType).includes("text")) return fail(correlationId, "VALIDATE_TEXT_NOT_ALLOWED");

  const sourceId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const filename = pastedTextFilename(new Date());
  const path = sourceObjectPath(uid, sourceId, fileId, filename, "text/plain");
  const bytes = new TextEncoder().encode(p.text);
  // the text is stored unchanged as an immutable source object (18A §43, 23 §23)
  const { error: upError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "text/plain; charset=utf-8", upsert: false });
  if (upError) return fail(correlationId, "FILE_NOT_UPLOADED");

  const { data, error } = await supabase.rpc("intake_register_file", {
    p_client_request_id: p.clientRequestId,
    p_source_type: p.sourceType,
    p_source_name: p.title?.trim() || filename,
    p_context: "unknown",
    p_source_id: sourceId,
    p_file_id: fileId,
    p_storage_path: path,
    p_original_filename: filename,
    p_mime_type: "text/plain",
    p_size_bytes: bytes.byteLength,
    p_sha256: await sha256Hex(bytes),
    p_intake_method: "text",
    p_correlation_id: correlationId,
  });
  if (error) return fail(correlationId, codeOf(error));
  const status = (data as { status: "uploaded" | "duplicate" }).status;
  const result = done(status);
  return result.ok && status === "uploaded" ? { ...result, message: "הטקסט נקלט ונשמר כמקור כפי שהוא. הוא ממתין לעיבוד." } : result;
}

const ReportInput = z.object({
  clientRequestId: z.string().min(8).max(100),
  subjectType: z.string().min(1),
  statement: z.string().trim().min(1).max(20_000),
});

export async function submitManualReport(input: z.infer<typeof ReportInput>): Promise<IntakeResult> {
  const { correlationId, supabase, uid } = await context();
  if (!uid) return fail(correlationId, "AUTH_REQUIRED");
  const parsed = ReportInput.safeParse(input);
  if (!parsed.success) return fail(correlationId, "VALIDATE_REQUIRED_FIELD");
  const { error } = await supabase.rpc("intake_register_manual_report", {
    p_client_request_id: parsed.data.clientRequestId,
    p_subject_type: parsed.data.subjectType,
    p_statement: parsed.data.statement,
    p_context: "unknown",
    p_correlation_id: correlationId,
  });
  if (error) return fail(correlationId, codeOf(error));
  revalidatePath("/");
  revalidatePath("/sources", "layout");
  // 22B §86, 21B §92.10: a manual report is never shown as verified
  return { ok: true, status: "uploaded", message: "הדיווח נשמר כדיווח ידני. הוא טרם אומת ולא יוצג כעובדה מאומתת." };
}
