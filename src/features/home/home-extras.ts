import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Money } from "@/features/picture/classify";
import { monthBounds } from "./month-bounds";

// Home read model additions (Calm Finance dashboard). Reads only through the user's session + RLS; no calculation
// beyond grouping and summing stored amounts.
// - recent: the latest movements, the same rows the transactions screen shows (no category — not classified yet).
// - expenseTypes: business expenses of the month by expense type, named from the expense-type dictionary
//   (green_invoice_expense_types). An expense without a type is "לא מסווג" — never hidden. If the dictionary is not
//   available in this environment the section says so instead of failing the page.
export type RecentTx = { id: string; date: string; description: string | null; account: string; direction: "debit" | "credit"; amount: Money; reconciliation: string };
export type ExpenseTypeSlice = { code: string | null; label: string; amount: Money };
/** month = the month shown: the picture's month, or — when it has no expenses — the latest month that has (labelled) */
export type ExpenseTypes = { status: "ok" | "unavailable"; month: string | null; slices: ExpenseTypeSlice[] };

export async function getRecentTransactions(limit = 5): Promise<RecentTx[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, transaction_date, description_original, direction, amount_minor, currency_code, reconciliation_status, accounts!inner(account_name)")
    .is("archived_at", null)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`recent transactions read failed: ${error.code}`);
  return ((data ?? []) as unknown as { id: string; transaction_date: string; description_original: string | null; direction: "debit" | "credit"; amount_minor: number; currency_code: string; reconciliation_status: string; accounts: { account_name: string } }[])
    .map((r) => ({ id: r.id, date: r.transaction_date, description: r.description_original, account: r.accounts.account_name, direction: r.direction,
      amount: { minor: String(r.amount_minor), currency: r.currency_code }, reconciliation: r.reconciliation_status }));
}

export async function getExpenseTypes(month: string | null): Promise<ExpenseTypes> {
  const supabase = await createClient();
  // the picture's month (bank movements) and the expense documents' dates often differ — a Morning export arrives by
  // reporting month. When the picture's month has no expense, the latest month that has one is shown, with its name.
  const latest = await supabase.from("expenses").select("expense_date").is("archived_at", null).eq("status", "active")
    .order("expense_date", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) return { status: "unavailable", month: null, slices: [] };
  if (!latest.data) return { status: "ok", month, slices: [] };
  const latestMonth = (latest.data as { expense_date: string }).expense_date.slice(0, 7);
  const read = async (m: string) => {
    const { start, endExclusive } = monthBounds(m);
    return supabase.from("expenses").select("category_code, gross_minor, currency_code").is("archived_at", null).eq("status", "active").gte("expense_date", start).lt("expense_date", endExclusive);
  };
  let shown = month ?? latestMonth;
  const [first, dict] = await Promise.all([read(shown), supabase.from("green_invoice_expense_types").select("code, name_he")]);
  let exp = first;
  if (!exp.error && !(exp.data ?? []).length && shown !== latestMonth) { shown = latestMonth; exp = await read(shown); }
  // a secondary section never takes the page down: on a read failure it says it is unavailable
  if (exp.error || dict.error) return { status: "unavailable", month: shown, slices: [] };
  const names = new Map(((dict.data ?? []) as { code: string; name_he: string }[]).map((d) => [d.code, d.name_he]));
  const groups = new Map<string, { code: string | null; label: string; currency: string; minor: bigint }>();
  for (const r of (exp.data ?? []) as { category_code: string | null; gross_minor: number | null; currency_code: string | null }[]) {
    if (r.gross_minor === null || !r.currency_code) continue;
    const code = r.category_code && names.has(r.category_code) ? r.category_code : null;
    const key = `${code ?? "-"}|${r.currency_code}`;
    const g = groups.get(key) ?? { code, label: code ? names.get(code)! : "לא מסווג", currency: r.currency_code, minor: 0n };
    g.minor += BigInt(r.gross_minor);
    groups.set(key, g);
  }
  const slices = [...groups.values()].sort((a, b) => (b.minor > a.minor ? 1 : b.minor < a.minor ? -1 : 0))
    .map((g) => ({ code: g.code, label: g.label, amount: { minor: g.minor.toString(), currency: g.currency } }));
  return { status: "ok", month: shown, slices };
}

/** "מה השתנה" (19D §3): the latest file the owner uploaded and what processing produced from it. */
export type LatestChange = { file: string; uploadedAt: string; state: string; promoted: number | null } | null;
export async function getLatestChange(): Promise<LatestChange> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("source_files").select("id, original_filename, uploaded_at, pipeline_state")
    .is("archived_at", null).order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const f = data as { id: string; original_filename: string; uploaded_at: string; pipeline_state: string };
  const doc = await supabase.from("documents").select("metadata_json").eq("source_file_id", f.id).is("archived_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const ex = (doc.data as { metadata_json: { extraction?: { promotedTransactions?: number; promotedDocuments?: number } } | null } | null)?.metadata_json?.extraction;
  const promoted = ex ? (ex.promotedTransactions ?? 0) + (ex.promotedDocuments ?? 0) : null;
  return { file: f.original_filename, uploadedAt: f.uploaded_at, state: f.pipeline_state, promoted };
}
