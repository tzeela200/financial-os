import "server-only";
import { createClient } from "@/lib/supabase/server";

// Record → Evidence → Source row read model (chapter 5 §22 "ללחוץ על נתון ולהגיע חזרה למקום שממנו נקרא"; 18C).
export type RecordView = {
  kind: "transaction" | "income" | "expense"; id: string;
  fields: { label: string; value: string | null; money?: { minor: string; currency: string } | null }[];
  reconciliation: { status: string; type: string | null } | null;
  evidence: { id: string; sheet: string | null; row: number | null; capturedAt: string; method: string; version: string | null }[];
  sourceRow: { cells: string[]; observations: { header: string; concept: string; original: string | null; normalized: unknown }[] } | null;
  file: { id: string; name: string; sourceType: string; uploadedAt: string } | null;
};

const DIRECTION: Record<string, string> = { debit: "יציאה (חובה)", credit: "כניסה (זכות)" };

export async function getRecord(kind: string, id: string): Promise<RecordView | null> {
  if (!["transaction", "income", "expense"].includes(kind)) return null;
  const supabase = await createClient();
  let fields: RecordView["fields"] = [];
  let sourceId: string | null = null;
  let sourceRecordId: string | null = null;
  let reconciliation: RecordView["reconciliation"] = null;

  if (kind === "transaction") {
    const { data: t } = await supabase.from("transactions").select("id, transaction_date, value_date, charge_date, direction, amount_minor, currency_code, description_original, reference, balance_after_minor, reconciliation_status, source_id, source_record_id, accounts!inner(account_name)").eq("id", id).maybeSingle();
    if (!t) return null;
    sourceId = t.source_id as string | null; sourceRecordId = t.source_record_id as string | null;
    fields = [
      { label: "תאריך", value: t.transaction_date as string },
      { label: "תאריך ערך", value: (t.value_date as string | null) ?? null },
      { label: "תאריך חיוב", value: (t.charge_date as string | null) ?? null },
      { label: "חשבון", value: (t.accounts as unknown as { account_name: string }).account_name },
      { label: "תיאור", value: (t.description_original as string | null) ?? null },
      { label: "כיוון", value: DIRECTION[t.direction as string] ?? (t.direction as string) },
      { label: "סכום", value: null, money: { minor: String(t.amount_minor), currency: t.currency_code as string } },
      { label: "אסמכתא", value: (t.reference as string | null) ?? null },
      { label: "יתרה אחרי הפעולה (לפי המקור)", value: null, money: t.balance_after_minor === null ? null : { minor: String(t.balance_after_minor), currency: t.currency_code as string } },
    ];
    const { data: m } = await supabase.from("reconciliation_members").select("member_role, reconciliations!inner(status, reconciliation_type)").eq("entity_type", "transaction").eq("entity_id", id).limit(1).maybeSingle();
    const rec = m ? (m.reconciliations as unknown as { status: string; reconciliation_type: string }) : null;
    reconciliation = { status: (t.reconciliation_status as string), type: rec?.reconciliation_type ?? null };
  } else {
    const table = kind === "income" ? "income" : "expenses";
    const dateCol = kind === "income" ? "event_date" : "expense_date";
    const { data: r } = await supabase.from(table).select(`id, ${dateCol}, gross_minor, net_minor, vat_minor, currency_code, actuality_status, reconciliation_status, primary_source_id`).eq("id", id).maybeSingle();
    if (!r) return null;
    const row = r as unknown as Record<string, string | number | null>;
    sourceId = row.primary_source_id as string | null;
    const cur = row.currency_code as string | null;
    const money = (v: string | number | null) => (v === null || !cur ? null : { minor: String(v), currency: cur });
    fields = [
      { label: kind === "income" ? "תאריך המסמך" : "תאריך ההוצאה", value: row[dateCol] as string | null },
      { label: "סכום כולל", value: null, money: money(row.gross_minor) },
      { label: "לפני מע״מ", value: null, money: money(row.net_minor) },
      { label: "מע״מ", value: null, money: money(row.vat_minor) },
      { label: "מעמד", value: "לפי מסמך עסקי · טרם הותאם לתנועת כסף" },
    ];
    reconciliation = { status: row.reconciliation_status as string, type: null };
  }

  const { data: links } = await supabase.from("evidence_links").select("evidence!inner(id, sheet_name, row_number, captured_at, capture_method, extractor_version, source_record_id)").eq("entity_type", kind).eq("entity_id", id);
  const evidence = ((links ?? []) as unknown as { evidence: { id: string; sheet_name: string | null; row_number: number | null; captured_at: string; capture_method: string; extractor_version: string | null; source_record_id: string | null } }[]).map((l) => l.evidence);
  sourceRecordId = sourceRecordId ?? evidence[0]?.source_record_id ?? null;

  let sourceRow: RecordView["sourceRow"] = null;
  if (sourceRecordId) {
    const [{ data: sr }, { data: obs }] = await Promise.all([
      supabase.from("source_records").select("raw_json").eq("id", sourceRecordId).maybeSingle(),
      supabase.from("observations").select("concept_code, value_original, value_normalized_json, locator_json").eq("source_record_id", sourceRecordId),
    ]);
    sourceRow = {
      cells: ((sr?.raw_json as { cells?: string[] } | undefined)?.cells) ?? [],
      observations: ((obs ?? []) as { concept_code: string; value_original: string | null; value_normalized_json: unknown; locator_json: { header?: string; col?: number } | null }[])
        .sort((a, b) => (a.locator_json?.col ?? 0) - (b.locator_json?.col ?? 0))
        .map((o) => ({ header: o.locator_json?.header ?? "", concept: o.concept_code, original: o.value_original, normalized: o.value_normalized_json })),
    };
  }
  let file: RecordView["file"] = null;
  if (sourceId) {
    const { data: f } = await supabase.from("source_files").select("id, original_filename, uploaded_at, sources!inner(source_type)").eq("source_id", sourceId).limit(1).maybeSingle();
    if (f) file = { id: f.id as string, name: f.original_filename as string, sourceType: (f.sources as unknown as { source_type: string }).source_type, uploadedAt: f.uploaded_at as string };
  }
  return { kind: kind as RecordView["kind"], id, fields, reconciliation, evidence: evidence.map((e) => ({ id: e.id, sheet: e.sheet_name, row: e.row_number, capturedAt: e.captured_at, method: e.capture_method, version: e.extractor_version })), sourceRow, file };
}
