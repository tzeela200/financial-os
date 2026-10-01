import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadMovementLayer } from "./current-picture";
import { sum, signedOut, type Money, type Classified } from "./classify";

// Drill-down read model (task §10; 22B Explainability): the components of exactly the number shown on Home / B1 —
// same classification, same month filter, same sum. Each row opens its record → evidence → source row.

export type DetailRow = { kind: "transaction" | "income" | "expense"; id: string; date: string | null; description: string | null; account: string | null; amount: Money | null; direction: string | null; status: string; note: string | null };
export type MetricDetail = { metric: string; title: string; month: string | null; total: Money | null; mixedCurrency: boolean; rows: DetailRow[]; excluded: DetailRow[] };

const TITLES: Record<string, string> = {
  money_in: "נכנס — תנועות כסף בפועל",
  money_out: "יצא — תנועות כסף בפועל",
  money_out_pending: "תנועות בבדיקת כפילות",
  business: "עסק — הכנסות והוצאות לפי מסמכים",
  upcoming_card_charges: "חיובי כרטיס אשראי שטרם נגבו",
};
const EXCLUDED_NOTE: Record<string, string> = {
  card_settlement_in_bank: "חיוב כרטיס בבנק — העסקאות עצמן נספרות בכרטיס",
  payment_app_funding: "מימון תשלום ב־bit — התשלום נספר ב־bit",
  internal_transfer: "העברה בין חשבונות שלך — לא הכנסה ולא הוצאה",
  possible_internal_transfer: "חשד להעברה בין חשבונות שלך — ממתין להחלטתך",
};

export async function getMetricDetail(metric: string, month: string | null): Promise<MetricDetail> {
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("accounts").select("id, account_name");
  const accName = new Map(((accounts ?? []) as { id: string; account_name: string }[]).map((a) => [a.id, a.account_name]));
  const today = new Date().toISOString().slice(0, 10);

  if (metric === "business") {
    const [inc, exp] = await Promise.all([
      supabase.from("income").select("id, event_date, gross_minor, currency_code").is("archived_at", null).eq("status", "active"),
      supabase.from("expenses").select("id, expense_date, gross_minor, currency_code").is("archived_at", null).eq("status", "active"),
    ]);
    const ids = [...(inc.data ?? []), ...(exp.data ?? [])].map((r) => (r as { id: string }).id);
    const { data: ev } = ids.length ? await supabase.from("evidence_links").select("entity_id, evidence!inner(normalized_value)").in("entity_id", ids) : { data: [] };
    const party = new Map(((ev ?? []) as unknown as { entity_id: string; evidence: { normalized_value: { party?: string; document_number?: string; role?: string } | null } }[]).map((e) => [e.entity_id, e.evidence.normalized_value]));
    const rows: DetailRow[] = [
      ...((inc.data ?? []) as { id: string; event_date: string | null; gross_minor: number | null; currency_code: string | null }[]).filter((r) => month && r.event_date?.startsWith(month)).map((r) => ({
        kind: "income" as const, id: r.id, date: r.event_date, description: [party.get(r.id)?.party, party.get(r.id)?.document_number ? `מסמך ${party.get(r.id)?.document_number}` : null].filter(Boolean).join(" · ") || null,
        account: "חשבונית ירוקה — הכנסות", amount: r.gross_minor !== null && r.currency_code ? { minor: String(r.gross_minor), currency: r.currency_code } : null, direction: "credit", status: "לפי מסמך, טרם הותאם לתנועת כסף", note: null })),
      ...((exp.data ?? []) as { id: string; expense_date: string | null; gross_minor: number | null; currency_code: string | null }[]).filter((r) => month && r.expense_date?.startsWith(month)).map((r) => ({
        kind: "expense" as const, id: r.id, date: r.expense_date, description: [party.get(r.id)?.party, party.get(r.id)?.document_number ? `מסמך ${party.get(r.id)?.document_number}` : null].filter(Boolean).join(" · ") || null,
        account: "חשבונית ירוקה — הוצאות", amount: r.gross_minor !== null && r.currency_code ? { minor: String(r.gross_minor), currency: r.currency_code } : null, direction: "debit", status: "לפי מסמך, טרם הותאם לתנועת כסף", note: null })),
    ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const signed = rows.filter((r) => r.amount).map((r) => ({ amount: (r.kind === "income" ? 1n : -1n) * BigInt(r.amount!.minor), currency: r.amount!.currency }));
    const t = sum(signed);
    return { metric, title: TITLES.business, month, total: t.money, mixedCurrency: t.mixed, rows, excluded: [] };
  }

  const { all } = await loadMovementLayer(null);
  const toRow = (t: Classified, note: string | null = null): DetailRow => ({
    kind: "transaction", id: t.id, date: t.transaction_date, description: null, account: accName.get(t.account_id) ?? null,
    amount: { minor: String(t.amount_minor), currency: t.currency_code }, direction: t.direction,
    status: t.reconciliation_status === "matched" ? "הותאם" : t.reconciliation_status === "candidate" ? "התאמה מוצעת" : "ללא התאמה", note,
  });
  const inMonth = (t: Classified) => !month || t.transaction_date.startsWith(month);
  let pick: Classified[] = [];
  if (metric === "money_in") pick = all.filter((t) => inMonth(t) && t.layer === "in");
  else if (metric === "money_out") pick = all.filter((t) => inMonth(t) && t.layer === "out");
  else if (metric === "money_out_pending") pick = all.filter((t) => inMonth(t) && t.layer === "pending_out");
  else if (metric === "upcoming_card_charges") pick = all.filter((t) => t.accounts.account_type_code === "credit_card" && t.charge_date && t.charge_date > today);
  const amounts = pick.map((t) => ({ amount: metric === "money_in" || metric === "money_out_pending" ? BigInt(t.amount_minor) : signedOut(t), currency: t.currency_code }));
  const total = sum(amounts);
  const excluded = metric === "money_in" || metric === "money_out" ? all.filter((t) => inMonth(t) && t.layer === "excluded").map((t) => toRow(t, EXCLUDED_NOTE[t.reason] ?? null)) : [];

  // descriptions for the listed rows
  const ids = [...pick.map((t) => t.id), ...excluded.map((r) => r.id)];
  const desc = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase.from("transactions").select("id, description_original").in("id", ids.slice(i, i + 500));
    for (const r of (data ?? []) as { id: string; description_original: string | null }[]) desc.set(r.id, r.description_original);
  }
  const rows = pick.map((t) => ({ ...toRow(t, t.reason === "card_refund_reduces_spending" ? "זיכוי בכרטיס — מקטין את ההוצאות" : null), description: desc.get(t.id) ?? null }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return { metric, title: TITLES[metric] ?? metric, month, total: total.money, mixedCurrency: total.mixed, rows, excluded: excluded.map((r) => ({ ...r, description: desc.get(r.id) ?? null })) };
}
