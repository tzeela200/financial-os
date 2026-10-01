import { createHash } from "node:crypto";

// Reconciliation engine — deterministic candidate generation (chapter 7 §3–§7, §17–§19; 18B §8; Stage 4 core needed so
// Route A never double counts). Rules and windows are code settings, versioned (chapter 7 §5: "הספים הם חלק מהקוד").
// Amounts must match to the agora — "פער נשאר פער" (§3). Amount alone is never enough (§3): every rule also requires the
// right account kinds, a date window, and a structural link (card billing cycle / stated funding source / opposite
// directions between two of the user's accounts). Every result is a CANDIDATE; nothing is matched without approval
// (§3 "התאמה לא ודאית אינה הופכת אוטומטית"; 23A §45).

export const RECONCILIATION_RULE_VERSION = "recon-v1";
const DAY = 86400000;

export type Tx = {
  id: string; accountId: string; accountType: "checking" | "savings" | "credit_card" | "payment_app" | "other";
  date: string; chargeDate: string | null; direction: "debit" | "credit"; amountMinor: bigint; currency: string;
  typeCode: string | null; reconciliationStatus: string;
};
export type Candidate = {
  key: string;
  type: "card_settlement" | "payment_app_funding" | "internal_transfer";
  left: string; // the record that is NOT the economic event (settlement / funding / transfer side)
  right: string[]; // the economic record(s)
  amountMinor: bigint; currency: string;
  basis: Record<string, unknown>;
};

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;
const key = (type: string, ids: string[]) => createHash("sha256").update(`${type}|${[...ids].sort().join("|")}`).digest("hex").slice(0, 32);

export function generateCandidates(txs: Tx[]): Candidate[] {
  const open = txs.filter((t) => t.reconciliationStatus !== "matched" && t.reconciliationStatus !== "rejected");
  const used = new Set<string>();
  const out: Candidate[] = [];
  const bankDebits = open.filter((t) => t.accountType === "checking" && t.direction === "debit");
  const bankCredits = open.filter((t) => t.accountType === "checking" && t.direction === "credit");

  // 1. card billing cycle ↔ bank settlement (chapter 7 §7): cycle = card records with the same charge date;
  //    total = debits − credits; bank debit of exactly that total within 5 days of the charge date.
  const cycles = new Map<string, Tx[]>();
  for (const t of open) if (t.accountType === "credit_card" && t.chargeDate) cycles.set(`${t.accountId}|${t.chargeDate}|${t.currency}`, [...(cycles.get(`${t.accountId}|${t.chargeDate}|${t.currency}`) ?? []), t]);
  for (const [k, members] of cycles) {
    const [, chargeDate, currency] = k.split("|");
    const total = members.reduce((s, t) => s + (t.direction === "debit" ? t.amountMinor : -t.amountMinor), 0n);
    if (total <= 0n) continue;
    const bank = bankDebits.filter((b) => !used.has(b.id) && b.currency === currency && b.amountMinor === total && days(b.date, chargeDate) <= 5)
      .sort((a, b) => days(a.date, chargeDate) - days(b.date, chargeDate))[0];
    if (!bank) continue;
    used.add(bank.id);
    out.push({ key: key("card_settlement", [bank.id, ...members.map((m) => m.id)]), type: "card_settlement", left: bank.id, right: members.map((m) => m.id), amountMinor: total, currency,
      basis: { rule: "card_cycle_total_equals_bank_debit", charge_date: chargeDate, window_days: 5, cycle_records: members.length } });
  }

  // 2. payment-app payment funded by a stated source (chapter 7 §9; the funding source is the approved meaning of the
  //    payment-method column): the card / bank record of the same amount within 3 days is the funding, not a second expense.
  for (const p of open.filter((t) => t.accountType === "payment_app" && t.direction === "debit" && t.typeCode?.startsWith("funded_by:"))) {
    const via = p.typeCode!.slice("funded_by:".length);
    const pool = via === "credit_card" ? open.filter((t) => t.accountType === "credit_card" && t.direction === "debit")
      : via === "bank_account" ? bankDebits : [];
    const f = pool.filter((t) => !used.has(t.id) && t.currency === p.currency && t.amountMinor === p.amountMinor && days(t.date, p.date) <= 3)
      .sort((a, b) => days(a.date, p.date) - days(b.date, p.date))[0];
    if (!f) continue;
    used.add(f.id);
    out.push({ key: key("payment_app_funding", [f.id, p.id]), type: "payment_app_funding", left: f.id, right: [p.id], amountMinor: p.amountMinor, currency: p.currency,
      basis: { rule: "stated_funding_source_same_amount", funded_by: via, window_days: 3 } });
  }

  // 3. transfer between two of the user's accounts (chapter 7 §6): opposite directions, same amount and currency,
  //    within 3 days, different accounts, neither side a card. Ownership must be confirmed → candidate only.
  const appCredits = open.filter((t) => t.accountType === "payment_app" && t.direction === "credit");
  const appDebits = open.filter((t) => t.accountType === "payment_app" && t.direction === "debit" && !t.typeCode?.startsWith("funded_by:"));
  const pairs: [Tx[], Tx[]][] = [[bankDebits, appCredits], [appDebits, bankCredits]];
  for (const [outs, ins] of pairs) {
    for (const o of outs) {
      if (used.has(o.id)) continue;
      const i = ins.filter((t) => !used.has(t.id) && t.accountId !== o.accountId && t.currency === o.currency && t.amountMinor === o.amountMinor && days(t.date, o.date) <= 3)
        .sort((a, b) => days(a.date, o.date) - days(b.date, o.date))[0];
      if (!i) continue;
      used.add(o.id); used.add(i.id);
      out.push({ key: key("internal_transfer", [o.id, i.id]), type: "internal_transfer", left: o.id, right: [i.id], amountMinor: o.amountMinor, currency: o.currency,
        basis: { rule: "opposite_directions_same_amount_own_accounts", window_days: 3, ownership: "to_confirm" } });
    }
  }
  return out;
}
