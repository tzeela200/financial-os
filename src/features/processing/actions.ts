"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCorrelationId } from "@/lib/correlation";
import { log } from "@/lib/server/logger";
import { readSource } from "./readers";
import { familyForSource } from "./families";
import { CONCEPTS } from "./concepts";
import { understandDocument } from "./understand";
import { applyAnswers, unanswered, type MappingAnswer } from "./mapping-answers";
import { runDueJobs, loadAdapters, PROCESSING_VERSION } from "./process-file";

// Mapping answers command (21D §12; chapter 5 §21; D5). The server re-reads the stored original and re-runs the same
// document understanding (the client is never trusted), applies Tzeela's answers to the open questions only, checks
// that the table is now fully understood, stores the approved adapter (versioned, audited) and queues a reprocess run.
// The previous run is kept (18B §5.8). Next files of the same structure are understood without asking again.

const BUCKET = "financial-source-files";
const CONCEPT_CODES = new Set(CONCEPTS.map((c) => c.code));
const ROLE = z.enum(["tax_invoice", "invoice_receipt", "receipt", "transaction_invoice", "credit_note", "other"]);

const Answer = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("column"), column: z.number().int().min(0).max(500).nullable(), concept: z.string().max(60).nullable() }),
  z.object({ kind: z.literal("values"), map: z.record(z.string().max(200), z.string().max(40)) }),
  z.object({ kind: z.literal("currency"), currency: z.string().regex(/^[A-Z]{3}$/).nullable() }),
  z.object({ kind: z.literal("sign"), sign: z.enum(["signed_negative_is_debit", "signed_positive_is_debit", "unsigned_use_direction", "all_debit", "all_credit"]) }),
  z.object({ kind: z.literal("document_role_all"), role: ROLE }),
]);
const MappingInput = z.object({ fileId: z.string().uuid(), sheet: z.string().max(200), answers: z.record(z.string().regex(/^\d{1,3}$/), Answer) });
const VALUE_OPTIONS: Record<string, Set<string>> = {
  direction: new Set(["debit", "credit"]), status: new Set(["executed", "not_executed"]),
  document_type: new Set(ROLE.options), payment_method: new Set(["balance", "credit_card", "bank_account", "cash", "other"]),
};

export type MappingResult = { ok: true; message: string } | { ok: false; message: string };

export async function saveMapping(input: z.infer<typeof MappingInput>): Promise<MappingResult> {
  const correlationId = getCorrelationId(await headers());
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, message: "צריך להתחבר מחדש." };
  const parsed = MappingInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "התשובות אינן שלמות. בדקי ונסי שוב." };
  const p = parsed.data;

  const { data: file } = await supabase.from("source_files").select("id, storage_path, original_filename, sources!inner(source_type)").eq("id", p.fileId).maybeSingle();
  if (!file) return { ok: false, message: "הקובץ לא נמצא." };
  const sourceType = (file.sources as unknown as { source_type: string }).source_type;
  const family = familyForSource(sourceType);
  if (!family) return { ok: false, message: "לסוג המקור הזה עדיין אין משפחת מסמכים מוגדרת." };

  const { data: blob } = await supabase.storage.from(BUCKET).download(file.storage_path as string);
  if (!blob) return { ok: false, message: "לא ניתן היה לקרוא את הקובץ המקורי." };
  const read = await readSource(new Uint8Array(await blob.arrayBuffer()), file.original_filename as string);
  if (!read.ok) return { ok: false, message: "את הקובץ הזה אי אפשר לקרוא בקריאה דטרמיניסטית, ולכן אין מה למפות." };
  const approved = await loadAdapters(supabase, sourceType);
  const u = understandDocument(read, sourceType, approved);
  const table = u.tables.find((t) => t.sheet === p.sheet && t.via === "unresolved");
  if (!table || !table.proposed) return { ok: false, message: "הטבלה הזו כבר מובנת למערכת — אין שאלות פתוחות." };

  const answers: Record<number, MappingAnswer> = Object.fromEntries(Object.entries(p.answers).map(([k, v]) => [Number(k), v as MappingAnswer]));
  const allowed = new Set(family.expected);
  for (const [i, a] of Object.entries(answers)) {
    const q = table.questions[Number(i)];
    if (!q) return { ok: false, message: "התקבלה תשובה לשאלה שאינה קיימת." };
    if (a.kind === "column" && a.concept && (!CONCEPT_CODES.has(a.concept) || !allowed.has(a.concept))) return { ok: false, message: "נבחר מושג שאינו מתאים למשפחת המסמך." };
    if (a.kind === "values" && q.kind === "values" && Object.values(a.map).some((v) => !VALUE_OPTIONS[q.concept].has(v))) return { ok: false, message: "נבחרה משמעות ערך שאינה מוכרת." };
  }
  if (unanswered(table.questions, answers).length) return { ok: false, message: "יש עוד שאלות פתוחות. יש לענות על כולן." };
  const adapter = applyAnswers(table.proposed, table.questions, answers);

  // the answers must make the table understood — otherwise nothing is saved (no silent partial mapping)
  const check = understandDocument(read, sourceType, [...approved, { ...adapter, id: "candidate", version: "0" }]);
  const after1 = check.tables.find((t) => t.sheet === p.sheet);
  if (!after1 || after1.via !== "approved_mapping") return { ok: false, message: "גם עם התשובות האלה הטבלה לא מובנת עד הסוף. לא נשמר דבר." };

  const { data: adapterId, error } = await supabase.rpc("processing_save_adapter", {
    p_source_type: sourceType, p_signature: adapter.signature,
    p_adapter: { headerRow: adapter.headerRow, columns: adapter.columns, dateFormat: adapter.dateFormat, amountSign: adapter.amountSign, currencyDefault: adapter.currencyDefault, currencyFromSymbols: adapter.currencyFromSymbols ?? false, values: adapter.values, basis: "semantic proposal + answers" },
    p_correlation_id: correlationId,
  });
  if (error || !adapterId) {
    log("request_log", correlationId, { event: "adapter_save_failed", code: error?.message.split(/\s/)[0] });
    return { ok: false, message: "שמירת התשובות נכשלה. לא בוצע שינוי." };
  }
  const { data: jobId, error: qError } = await supabase.rpc("processing_enqueue", {
    p_file_id: p.fileId, p_job_type: "reprocess_source", p_processing_version: `${PROCESSING_VERSION}+adapter:${(adapterId as string).slice(0, 8)}`, p_correlation_id: correlationId,
  });
  if (qError || !jobId) return { ok: false, message: "התשובות נשמרו, אבל העיבוד מחדש לא הופעל. אפשר להפעיל ממסך הקובץ." };
  after(async () => {
    await runDueJobs(supabase, { jobId: jobId as string });
    revalidatePath("/");
    revalidatePath("/sources", "layout");
  });
  return { ok: true, message: "התשובות נשמרו. הקובץ נקרא מחדש, וקבצים הבאים באותו מבנה ייקראו בלי לשאול שוב." };
}
