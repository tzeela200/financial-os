// Pure movement classification behind every flow number and its drill-down (chapter 7 §6–§7). No I/O.

export type Money = { minor: string; currency: string };

export type TxRow = { id: string; account_id: string; transaction_date: string; charge_date: string | null; direction: "debit" | "credit"; amount_minor: number; currency_code: string; reconciliation_status: string; internal_transfer_pair_id: string | null; transaction_type_code: string | null; accounts: { account_type_code: string } };

export type Classified = TxRow & { layer: "in" | "out" | "excluded" | "pending_out"; reason: string };

/** Classifies every movement once — the single rule set behind every flow number and its drill-down. */
export function classifyMovements(rows: TxRow[], memberRoles: Map<string, { role: string; status: "matched" | "candidate" }[]>): Classified[] {
  return rows.map((t) => {
    const roles = memberRoles.get(t.id) ?? [];
    const matched = roles.filter((r) => r.status === "matched").map((r) => r.role);
    const pending = roles.filter((r) => r.status === "candidate").map((r) => r.role);
    const type = t.accounts.account_type_code;
    if (matched.includes("settlement")) return { ...t, layer: "excluded", reason: "card_settlement_in_bank" };
    if (matched.includes("funding")) return { ...t, layer: "excluded", reason: "payment_app_funding" };
    if (matched.includes("transfer_out") || matched.includes("transfer_in")) return { ...t, layer: "excluded", reason: "internal_transfer" };
    if (t.direction === "debit" && (pending.includes("settlement") || pending.includes("funding") || pending.includes("transfer_out"))) return { ...t, layer: "pending_out", reason: "possible_duplicate" };
    if (t.direction === "credit" && pending.includes("transfer_in")) return { ...t, layer: "excluded", reason: "possible_internal_transfer" };
    if (type === "credit_card" && t.direction === "credit") return { ...t, layer: "out", reason: "card_refund_reduces_spending" };
    return { ...t, layer: t.direction === "credit" ? "in" : "out", reason: "movement" };
  });
}

export function sum(rows: { amount: bigint; currency: string }[]): { money: Money | null; mixed: boolean } {
  if (!rows.length) return { money: null, mixed: false };
  const currencies = new Set(rows.map((r) => r.currency));
  if (currencies.size > 1) return { money: null, mixed: true };
  return { money: { minor: rows.reduce((s, r) => s + r.amount, 0n).toString(), currency: rows[0].currency }, mixed: false };
}
export const signedOut = (t: Classified) => (t.accounts.account_type_code === "credit_card" && t.direction === "credit" ? -BigInt(t.amount_minor) : BigInt(t.amount_minor));

