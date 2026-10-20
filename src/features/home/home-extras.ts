import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Money } from "@/features/picture/classify";

// Home read model additions (Calm Finance dashboard). Reads only through the user's session + RLS; no calculation
// beyond grouping and summing stored amounts.
// - recent: the latest movements, the same rows the transactions screen shows (no category — not classified yet).
// - expenseTypes: business expenses of the month by expense type, named from the expense-type dictionary
//   (green_invoice_expense_types). An expense without a type is "לא מסווג" — never hidden. If the dictionary is not
//   available in this environment the section says so instead of failing the page.
export type RecentTx = { id: string; date: string; description: string | null; account: string; direction: "debit" | "credit"; amount: Money; reconciliation: string };
export type ExpenseTypeSlice = { code: string | null; label: string; amount: Money };
export type ExpenseTypes = { status: "ok" | "unavailable"; slices: ExpenseTypeSlice[] };

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
  if (!month) return { status: "ok", slices: [] };
  const supabase = await createClient();
  const [exp, dict] = await Promise.all([
    supabase.from("expenses").select("category_code, gross_minor, currency_code, expense_date").is("archived_at", null).eq("status", "active").gte("expense_date", `${month}-01`).lte("expense_date", `${month}-31`),
    supabase.from("green_invoice_expense_types").select("code, name_he"),
  ]);
  if (exp.error) throw new Error(`expenses read failed: ${exp.error.code}`);
  if (dict.error) return { status: "unavailable", slices: [] };
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
  return { status: "ok", slices };
}
