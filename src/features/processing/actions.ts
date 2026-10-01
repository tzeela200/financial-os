"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCorrelationId } from "@/lib/correlation";
import { log } from "@/lib/server/logger";
import { readSource } from "./readers";
import { headerSignature } from "./adapter";
import { familyForSource } from "./families";
import { CONCEPTS } from "./concepts";
import { runDueJobs, PROCESSING_VERSION } from "./process-file";

// Import Mapping command (21D §12; chapter 5 §20; D5): Tzeela approves what each column of a file she uploaded means.
// The server re-reads the stored original to compute the header signature (the client is never trusted), stores the
// approved adapter (versioned, audited) and queues a reprocess run. The previous run is kept (18B §5.8).

const BUCKET = "financial-source-files";
const CONCEPT_CODES = new Set(CONCEPTS.map((c) => c.code));

const MappingInput = z.object({
  fileId: z.string().uuid(),
  sheet: z.string().max(200),
  headerRow: z.number().int().min(1).max(200),
  columns: z.array(z.object({ index: z.number().int().min(0).max(500), concept: z.string().nullable() })).max(500),
  dateFormat: z.enum(["dmy", "dmy_two_digit_year_20", "iso"]),
  amountSign: z.enum(["signed_negative_is_debit", "signed_positive_is_debit", "unsigned_use_direction"]),
  currencyDefault: z.string().regex(/^[A-Z]{3}$/).nullable(),
  values: z.object({
    direction: z.record(z.string(), z.enum(["debit", "credit"])).optional(),
    status: z.record(z.string(), z.enum(["executed", "not_executed"])).optional(),
    documentRole: z.record(z.string(), z.enum(["tax_invoice", "invoice_receipt", "receipt", "transaction_invoice", "credit_note", "other"])).optional(),
    paymentMethod: z.record(z.string(), z.enum(["balance", "credit_card", "bank_account", "cash", "other"])).optional(),
  }),
});

export type MappingResult = { ok: true; message: string } | { ok: false; message: string };

export async function saveMapping(input: z.infer<typeof MappingInput>): Promise<MappingResult> {
  const correlationId = getCorrelationId(await headers());
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, message: "צריך להתחבר מחדש." };
  const parsed = MappingInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "המיפוי אינו שלם. בדקי את הבחירות ונסי שוב." };
  const p = parsed.data;

  const { data: file } = await supabase.from("source_files").select("id, storage_path, original_filename, sources!inner(source_type)").eq("id", p.fileId).maybeSingle();
  if (!file) return { ok: false, message: "הקובץ לא נמצא." };
  const sourceType = (file.sources as unknown as { source_type: string }).source_type;
  const family = familyForSource(sourceType);
  if (!family) return { ok: false, message: "לסוג המקור הזה עדיין אין משפחת מסמכים מוגדרת." };
  const allowed = new Set(family.expected);
  for (const c of p.columns) {
    if (c.concept && (!CONCEPT_CODES.has(c.concept) || !allowed.has(c.concept))) return { ok: false, message: "נבחר מושג שאינו מתאים למשפחת המסמך." };
  }
  const chosen = p.columns.filter((c) => c.concept).map((c) => c.concept);
  if (new Set(chosen).size !== chosen.length) return { ok: false, message: "כל מושג יכול להיות משויך לעמודה אחת בלבד." };

  const { data: blob } = await supabase.storage.from(BUCKET).download(file.storage_path as string);
  if (!blob) return { ok: false, message: "לא ניתן היה לקרוא את הקובץ המקורי." };
  const read = await readSource(new Uint8Array(await blob.arrayBuffer()), file.original_filename as string);
  if (!read.ok) return { ok: false, message: "את הקובץ הזה אי אפשר לקרוא בקריאה דטרמיניסטית, ולכן אין מה למפות." };
  const sheet = read.sheets.find((x) => x.name === p.sheet) ?? read.sheets[0];
  const headerCells = sheet?.rows[p.headerRow - 1];
  if (!headerCells) return { ok: false, message: "שורת הכותרת שנבחרה אינה קיימת בקובץ." };
  const signature = headerSignature(headerCells);

  const adapter = {
    headerRow: p.headerRow,
    columns: p.columns.map((c) => ({ index: c.index, header: headerCells[c.index] ?? "", concept: c.concept })),
    dateFormat: p.dateFormat, amountSign: p.amountSign, currencyDefault: p.currencyDefault, values: p.values,
  };
  const { data: adapterId, error } = await supabase.rpc("processing_save_adapter", { p_source_type: sourceType, p_signature: signature, p_adapter: adapter, p_correlation_id: correlationId });
  if (error || !adapterId) {
    log("request_log", correlationId, { event: "adapter_save_failed", code: error?.message.split(/\s/)[0] });
    return { ok: false, message: "שמירת המיפוי נכשלה. לא בוצע שינוי." };
  }
  const { data: jobId, error: qError } = await supabase.rpc("processing_enqueue", {
    p_file_id: p.fileId, p_job_type: "reprocess_source", p_processing_version: `${PROCESSING_VERSION}+adapter:${(adapterId as string).slice(0, 8)}`, p_correlation_id: correlationId,
  });
  if (qError || !jobId) return { ok: false, message: "המיפוי נשמר, אבל העיבוד מחדש לא הופעל. אפשר להפעיל ממסך הקובץ." };
  after(async () => {
    await runDueJobs(supabase, { jobId: jobId as string });
    revalidatePath("/");
    revalidatePath("/sources", "layout");
  });
  return { ok: true, message: "המיפוי נשמר. הקובץ נקרא מחדש, וקבצים הבאים באותו מבנה ייקראו לפיו." };
}
