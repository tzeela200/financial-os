import "server-only";
import { createClient } from "@/lib/supabase/server";

// Attention items from backend state only (22A §72; 21B Attention Area): open review items, files that need a mapping
// decision, files that failed, pending reconciliation decisions. Nothing here is inferred by the UI.

export type AttentionItem = { id: string; text: string; href: string; tone: "warn" | "err" | "info"; severity: number };

const REASON_TEXT: Record<string, string> = {
  required_fields: "שורות שחסר בהן שדה חובה ולכן לא נכנסו לתמונה",
  document_role: "יש סוגי מסמכים שעוד לא נקבעה משמעותם",
  net_plus_vat_equals_gross: "שורות שבהן נטו ועוד מע״מ אינו שווה לסכום הכולל",
  tax_id_structure: "מספרי עוסק במבנה לא תקין",
  balance_continuity: "רצף היתרות בדף הבנק אינו שלם — ייתכנו שורות חסרות",
  invoice_receipt_duplicate_candidates: "חשד לחשבונית וקבלה של אותה עסקה",
  visual_reading_required: "קובץ סרוק או תמונה ממתין לקריאה חזותית",
  format_readable: "קובץ שלא ניתן היה לקרוא",
};

export async function getAttentionItems(): Promise<AttentionItem[]> {
  const supabase = await createClient();
  const [items, docs, failed, checks] = await Promise.all([
    supabase.from("review_queue_items").select("id, item_type, entity_type, entity_id, reason_code, severity, origin_ref").in("status", ["open", "in_review"]).order("created_at", { ascending: false }).limit(200),
    supabase.from("documents").select("id, source_file_id").is("archived_at", null),
    supabase.from("source_files").select("id, original_filename").eq("pipeline_state", "failed").is("archived_at", null),
    supabase.from("qa_check_results").select("id, check_code"),
  ]);
  if (items.error) throw new Error(`attention read failed: ${items.error.code}`);
  const fileOfDoc = new Map(((docs.data ?? []) as { id: string; source_file_id: string }[]).map((d) => [d.id, d.source_file_id]));
  const checkCode = new Map(((checks.data ?? []) as { id: string; check_code: string }[]).map((c) => [c.id, c.check_code]));
  const out: AttentionItem[] = [];
  const rows = (items.data ?? []) as { id: string; item_type: string; entity_type: string; entity_id: string; reason_code: string; severity: string; origin_ref: { document_id?: string; qa_check_result_id?: string } | null }[];

  const candidates = rows.filter((r) => r.item_type === "reconciliation");
  if (candidates.length) out.push({ id: "reconciliation", text: `${candidates.length} התאמות בין מקורות ממתינות להחלטתך — עד אז הסכומים המעורבים מסומנים "בבדיקה"`, href: "/review", tone: "warn", severity: 3 });

  for (const r of rows.filter((x) => x.entity_type === "document" && x.reason_code === "needs_mapping")) {
    const file = fileOfDoc.get(r.entity_id);
    if (file) out.push({ id: r.id, text: "קובץ ממתין לאישור המיפוי שלך לפני שהנתונים ייכנסו לתמונה", href: `/sources/files/${file}/mapping`, tone: "warn", severity: 3 });
  }
  const byReason = new Map<string, { count: number; file: string | null }>();
  for (const r of rows.filter((x) => x.item_type === "exception")) {
    const code = checkCode.get(r.origin_ref?.qa_check_result_id ?? "") ?? r.reason_code;
    const file = r.origin_ref?.document_id ? fileOfDoc.get(r.origin_ref.document_id) ?? null : null;
    const prev = byReason.get(code);
    byReason.set(code, { count: (prev?.count ?? 0) + 1, file: prev?.file ?? file });
  }
  for (const [code, v] of byReason) out.push({ id: `exc-${code}`, text: `${REASON_TEXT[code] ?? code}${v.count > 1 ? ` (${v.count} קבצים)` : ""}`, href: v.file ? `/sources/files/${v.file}` : "/review", tone: "warn", severity: 2 });
  for (const f of (failed.data ?? []) as { id: string; original_filename: string }[]) out.push({ id: `failed-${f.id}`, text: `העיבוד של "${f.original_filename}" נכשל — אפשר לנסות שוב`, href: `/sources/files/${f.id}`, tone: "err", severity: 4 });
  return out.sort((a, b) => b.severity - a.severity);
}
