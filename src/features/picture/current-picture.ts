import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ROUTE_A_SOURCES } from "@/features/sources/route-a-sources";
import { classifyMovements, sum, signedOut, type TxRow, type Money } from "./classify";
export type { Money, Classified } from "./classify";

// Read Model `current_financial_picture` (chapter 13; 22B B1; 18B §13 Read Models). ONE computation used by Home, B1
// and the drill-down lists — no screen recomputes a KPI differently (task §11). Reads canonical data through RLS only.
// Rules (chapter 7 §6–§7, chapter 9 §4–§10, chapter 13):
//  - money movements and business documents are separate layers and are never added together;
//  - card transactions are the economic expenses; an approved card settlement in the bank is not a second expense;
//  - an approved transfer between own accounts is neither income nor expense; an approved payment-app funding record is
//    not a second expense; pending candidates are shown as "awaiting your decision", never silently netted;
//  - unknown is null (never 0); current money is the balance REPORTED by the source, with its date.

export type MetricKey = "money_in" | "money_out" | "money_out_pending" | "business_income" | "business_expenses" | "upcoming_card_charges";
export type PictureAccount = { id: string; name: string; type: string; balance: Money | null; balanceAsOf: string | null; stale: boolean; firstDate: string | null; lastDate: string | null; transactions: number };
export type SourceCoverage = { kind: string; label: string; files: number; lastUploadAt: string | null; periodStart: string | null; periodEnd: string | null; needsReview: number; failed: number; processing: number };
export type CurrentPicture = {
  month: string | null; months: string[];
  hasAnyData: boolean;
  currentMoney: { total: Money | null; accounts: PictureAccount[]; asOf: string | null; partial: boolean; reason: string | null };
  flows: { moneyIn: Money | null; moneyOut: Money | null; net: Money | null; pendingOut: Money | null; pendingCount: number; currencyMixed: boolean };
  business: { income: Money | null; expenses: Money | null; net: Money | null; uncountedDocuments: number };
  upcoming: { cardCharges: Money | null; nextChargeDate: string | null };
  trust: { verifiedDocs: number; totalDocs: number; needsReviewDocs: number; openReview: number; openCandidates: number; openContradictions: number; failedFiles: number; processingFiles: number };
  sources: SourceCoverage[];
  missingSources: string[];
};

const STALE_DAYS = 31; // a monthly source older than one cycle is shown as not current (freshness, 18C §21) — implementation parameter

export async function loadMovementLayer(month: string | null) {
  const supabase = await createClient();
  const [txs, members] = await Promise.all([
    supabase.from("transactions").select("id, account_id, transaction_date, charge_date, direction, amount_minor, currency_code, reconciliation_status, internal_transfer_pair_id, transaction_type_code, accounts!inner(account_type_code)").is("archived_at", null).limit(20000),
    supabase.from("reconciliation_members").select("entity_id, member_role, reconciliations!inner(status)").eq("entity_type", "transaction"),
  ]);
  const candidates = await supabase.from("match_candidates").select("candidate_type, left_ref, right_ref, status").eq("status", "candidate");
  if (txs.error) throw new Error(`picture transactions read failed: ${txs.error.code}`);
  const roles = new Map<string, { role: string; status: "matched" | "candidate" }[]>();
  for (const m of (members.data ?? []) as unknown as { entity_id: string; member_role: string; reconciliations: { status: string } }[]) {
    if (m.reconciliations.status === "matched") roles.set(m.entity_id, [...(roles.get(m.entity_id) ?? []), { role: m.member_role, status: "matched" }]);
  }
  const leftRole: Record<string, string> = { card_settlement: "settlement", payment_app_funding: "funding", internal_transfer: "transfer_out" };
  const rightRole: Record<string, string> = { card_settlement: "cycle_record", payment_app_funding: "payment", internal_transfer: "transfer_in" };
  for (const c of (candidates.data ?? []) as { candidate_type: string; left_ref: { entity_id: string }; right_ref: { members?: string[] } }[]) {
    roles.set(c.left_ref.entity_id, [...(roles.get(c.left_ref.entity_id) ?? []), { role: leftRole[c.candidate_type], status: "candidate" }]);
    for (const id of c.right_ref.members ?? []) roles.set(id, [...(roles.get(id) ?? []), { role: rightRole[c.candidate_type], status: "candidate" }]);
  }
  const all = classifyMovements((txs.data ?? []) as unknown as TxRow[], roles);
  const months = [...new Set(all.map((t) => t.transaction_date.slice(0, 7)))].sort().reverse();
  const inMonth = month ? all.filter((t) => t.transaction_date.startsWith(month)) : all;
  return { all, inMonth, months, pendingCandidates: (candidates.data ?? []).length };
}

export async function getCurrentPicture(requestedMonth?: string | null): Promise<CurrentPicture> {
  const supabase = await createClient();
  const [accountsQ, incomeQ, expensesQ, docsQ, reviewQ, contradictionsQ, filesQ] = await Promise.all([
    supabase.from("accounts").select("id, account_name, account_type_code, currency_code, reported_balance_minor, balance_as_of").is("archived_at", null),
    supabase.from("income").select("id, event_date, gross_minor, currency_code, actuality_status").is("archived_at", null).eq("status", "active"),
    supabase.from("expenses").select("id, expense_date, gross_minor, currency_code, actuality_status").is("archived_at", null).eq("status", "active"),
    supabase.from("documents").select("id, pipeline_state, metadata_json").is("archived_at", null),
    supabase.from("review_queue_items").select("id, item_type").in("status", ["open", "in_review"]),
    supabase.from("contradictions").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]),
    supabase.from("source_files").select("id, uploaded_at, pipeline_state, sources!inner(source_type)").is("archived_at", null),
  ]);
  for (const q of [accountsQ, incomeQ, expensesQ, docsQ, reviewQ, filesQ]) if (q.error) throw new Error(`picture read failed: ${q.error.code}`);

  const docMonths = [
    ...((incomeQ.data ?? []) as { event_date: string | null }[]).map((r) => r.event_date?.slice(0, 7)),
    ...((expensesQ.data ?? []) as { expense_date: string | null }[]).map((r) => r.expense_date?.slice(0, 7)),
  ].filter(Boolean) as string[];
  const movement = await loadMovementLayer(null);
  const months = [...new Set([...movement.months, ...docMonths])].sort().reverse();
  const month = requestedMonth && months.includes(requestedMonth) ? requestedMonth : months[0] ?? null;
  const inMonth = month ? movement.all.filter((t) => t.transaction_date.startsWith(month)) : [];

  // ---- current money: reported balances of bank accounts, with dates (chapter 13; never computed from movements)
  const today = new Date().toISOString().slice(0, 10);
  const accounts: PictureAccount[] = ((accountsQ.data ?? []) as { id: string; account_name: string; account_type_code: string; currency_code: string; reported_balance_minor: number | null; balance_as_of: string | null }[]).map((a) => {
    const own = movement.all.filter((t) => t.account_id === a.id).map((t) => t.transaction_date).sort();
    const stale = a.balance_as_of ? (Date.parse(today) - Date.parse(a.balance_as_of)) / 86400000 > STALE_DAYS : false;
    return { id: a.id, name: a.account_name, type: a.account_type_code, balance: a.reported_balance_minor === null ? null : { minor: String(a.reported_balance_minor), currency: a.currency_code },
      balanceAsOf: a.balance_as_of, stale, firstDate: own[0] ?? null, lastDate: own[own.length - 1] ?? null, transactions: own.length };
  });
  const banks = accounts.filter((a) => a.type === "checking" || a.type === "savings");
  const withBalance = banks.filter((a) => a.balance);
  const bal = sum(withBalance.map((a) => ({ amount: BigInt(a.balance!.minor), currency: a.balance!.currency })));
  const currentMoney = {
    total: banks.length && withBalance.length === banks.length ? bal.money : null,
    accounts, asOf: withBalance.map((a) => a.balanceAsOf!).sort()[0] ?? null,
    partial: banks.length > 0 && withBalance.length < banks.length,
    reason: !banks.length ? "no_bank_source" : withBalance.length < banks.length ? "bank_without_balance" : bal.mixed ? "mixed_currency" : null,
  };

  // ---- money movements for the month
  const ins = inMonth.filter((t) => t.layer === "in").map((t) => ({ amount: BigInt(t.amount_minor), currency: t.currency_code }));
  const outs = inMonth.filter((t) => t.layer === "out").map((t) => ({ amount: signedOut(t), currency: t.currency_code }));
  const pend = inMonth.filter((t) => t.layer === "pending_out").map((t) => ({ amount: BigInt(t.amount_minor), currency: t.currency_code }));
  const mIn = sum(ins), mOut = sum(outs), mPend = sum(pend);
  const net = mIn.money && mOut.money && mIn.money.currency === mOut.money.currency ? { minor: (BigInt(mIn.money.minor) - BigInt(mOut.money.minor)).toString(), currency: mIn.money.currency } : null;

  // ---- business documents layer (chapter 9): counted documents only, separate from movements
  const docIn = ((incomeQ.data ?? []) as { event_date: string | null; gross_minor: number | null; currency_code: string | null }[]).filter((r) => month && r.event_date?.startsWith(month) && r.gross_minor !== null && r.currency_code);
  const docOut = ((expensesQ.data ?? []) as { expense_date: string | null; gross_minor: number | null; currency_code: string | null }[]).filter((r) => month && r.expense_date?.startsWith(month) && r.gross_minor !== null && r.currency_code);
  const bIn = sum(docIn.map((r) => ({ amount: BigInt(r.gross_minor!), currency: r.currency_code! })));
  const bOut = sum(docOut.map((r) => ({ amount: BigInt(r.gross_minor!), currency: r.currency_code! })));
  const bNet = bIn.money && bOut.money && bIn.money.currency === bOut.money.currency ? { minor: (BigInt(bIn.money.minor) - BigInt(bOut.money.minor)).toString(), currency: bIn.money.currency } : null;
  const docsMeta = (docsQ.data ?? []) as { pipeline_state: string; metadata_json: { extraction?: { notPromotedReasons?: Record<string, number> } } }[];
  const uncounted = docsMeta.reduce((n, d) => n + Object.entries(d.metadata_json?.extraction?.notPromotedReasons ?? {}).filter(([k]) => k.startsWith("role_not_counted")).reduce((m, [, v]) => m + v, 0), 0);

  // ---- upcoming: card records whose charge date is still ahead (stated by the card source; not current money)
  const upcomingRows = movement.all.filter((t) => t.accounts.account_type_code === "credit_card" && t.charge_date && t.charge_date > today);
  const up = sum(upcomingRows.map((t) => ({ amount: signedOut(t), currency: t.currency_code })));

  // ---- trust / coverage
  const files = (filesQ.data ?? []) as unknown as { id: string; uploaded_at: string; pipeline_state: string; sources: { source_type: string } }[];
  const docs = docsMeta;
  const sources: SourceCoverage[] = ROUTE_A_SOURCES.map((s) => {
    const f = files.filter((x) => s.sourceTypes.includes(x.sources.source_type));
    const accountType = s.kind === "bank" ? "checking" : s.kind === "credit-card" ? "credit_card" : s.kind === "bit" ? "payment_app" : null;
    const acc = accountType ? accounts.filter((a) => a.type === accountType) : [];
    const dates = acc.flatMap((a) => [a.firstDate, a.lastDate]).filter(Boolean).sort() as string[];
    return { kind: s.kind, label: s.label, files: f.length, lastUploadAt: f.map((x) => x.uploaded_at).sort().reverse()[0] ?? null,
      periodStart: dates[0] ?? null, periodEnd: dates[dates.length - 1] ?? null,
      needsReview: f.filter((x) => x.pipeline_state === "needs_review").length, failed: f.filter((x) => x.pipeline_state === "failed").length,
      processing: f.filter((x) => !["needs_review", "failed", "verified", "duplicate", "ready", "uploaded"].includes(x.pipeline_state)).length };
  });
  const review = (reviewQ.data ?? []) as { item_type: string }[];

  return {
    month, months,
    hasAnyData: movement.all.length > 0 || docIn.length + docOut.length > 0 || (incomeQ.data ?? []).length + (expensesQ.data ?? []).length > 0,
    currentMoney,
    flows: { moneyIn: mIn.money, moneyOut: mOut.money, net, pendingOut: mPend.money, pendingCount: inMonth.filter((t) => t.layer === "pending_out").length, currencyMixed: mIn.mixed || mOut.mixed },
    business: { income: bIn.money, expenses: bOut.money, net: bNet, uncountedDocuments: uncounted },
    upcoming: { cardCharges: up.money, nextChargeDate: upcomingRows.map((t) => t.charge_date!).sort()[0] ?? null },
    trust: {
      verifiedDocs: docs.filter((d) => d.pipeline_state === "verified").length, totalDocs: docs.length,
      needsReviewDocs: docs.filter((d) => d.pipeline_state === "needs_review").length,
      openReview: review.length, openCandidates: review.filter((r) => r.item_type === "reconciliation").length,
      openContradictions: contradictionsQ.count ?? 0,
      failedFiles: files.filter((f) => f.pipeline_state === "failed").length,
      processingFiles: sources.reduce((n, s) => n + s.processing, 0),
    },
    sources,
    missingSources: sources.filter((s) => s.files === 0).map((s) => s.label),
  };
}
