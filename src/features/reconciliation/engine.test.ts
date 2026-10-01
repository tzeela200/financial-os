import { describe, it, expect } from "vitest";
import { generateCandidates, type Tx } from "./engine";
import { classifyMovements } from "@/features/picture/classify";

// Synthetic fixtures. Chapter 7 §3: amount alone is never enough; candidates are never auto-approved.
const tx = (id: string, accountType: Tx["accountType"], date: string, direction: Tx["direction"], amount: number, extra: Partial<Tx> = {}): Tx => ({
  id, accountId: `acc-${accountType}`, accountType, date, chargeDate: null, direction, amountMinor: BigInt(amount), currency: "ILS", typeCode: null, reconciliationStatus: "unmatched", ...extra,
});

describe("reconciliation candidates (chapter 7 §6–§7)", () => {
  it("card billing cycle total ↔ bank debit within the window", () => {
    const c = generateCandidates([
      tx("c1", "credit_card", "2026-08-05", "debit", 30000, { chargeDate: "2026-09-10" }),
      tx("c2", "credit_card", "2026-08-20", "debit", 4900, { chargeDate: "2026-09-10" }),
      tx("c3", "credit_card", "2026-08-21", "credit", 900, { chargeDate: "2026-09-10" }),
      tx("b1", "checking", "2026-09-11", "debit", 34000),
      tx("b2", "checking", "2026-09-11", "debit", 34000), // same amount, second debit: not used twice
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ type: "card_settlement", left: "b1", amountMinor: 34000n });
    expect(c[0].right.sort()).toEqual(["c1", "c2", "c3"]);
  });
  it("no candidate outside the date window or with a different amount", () => {
    expect(generateCandidates([tx("c1", "credit_card", "2026-08-05", "debit", 30000, { chargeDate: "2026-09-10" }), tx("b1", "checking", "2026-09-20", "debit", 30000)])).toHaveLength(0);
    expect(generateCandidates([tx("c1", "credit_card", "2026-08-05", "debit", 30000, { chargeDate: "2026-09-10" }), tx("b1", "checking", "2026-09-10", "debit", 30001)])).toHaveLength(0);
  });
  it("payment-app payment funded by card ↔ card debit; transfer between own accounts", () => {
    const c = generateCandidates([
      tx("p1", "payment_app", "2026-09-01", "debit", 10000, { typeCode: "funded_by:credit_card" }),
      tx("c1", "credit_card", "2026-09-02", "debit", 10000),
      tx("b1", "checking", "2026-09-05", "debit", 5000),
      tx("p2", "payment_app", "2026-09-05", "credit", 5000),
    ]);
    expect(c.map((x) => [x.type, x.left, x.right[0]])).toEqual([["payment_app_funding", "c1", "p1"], ["internal_transfer", "b1", "p2"]]);
  });
  it("is deterministic: same input → same keys", () => {
    const input = [tx("p1", "payment_app", "2026-09-01", "debit", 10000, { typeCode: "funded_by:credit_card" }), tx("c1", "credit_card", "2026-09-02", "debit", 10000)];
    expect(generateCandidates(input)[0].key).toBe(generateCandidates(input)[0].key);
  });
});

describe("movement classification behind every flow number", () => {
  const rows = [
    { id: "b1", account_id: "a", transaction_date: "2026-09-11", charge_date: null, direction: "debit" as const, amount_minor: 34000, currency_code: "ILS", reconciliation_status: "matched", internal_transfer_pair_id: null, transaction_type_code: null, accounts: { account_type_code: "checking" } },
    { id: "c1", account_id: "c", transaction_date: "2026-09-05", charge_date: "2026-09-10", direction: "debit" as const, amount_minor: 34000, currency_code: "ILS", reconciliation_status: "matched", internal_transfer_pair_id: null, transaction_type_code: null, accounts: { account_type_code: "credit_card" } },
    { id: "b2", account_id: "a", transaction_date: "2026-09-12", charge_date: null, direction: "debit" as const, amount_minor: 5000, currency_code: "ILS", reconciliation_status: "candidate", internal_transfer_pair_id: null, transaction_type_code: null, accounts: { account_type_code: "checking" } },
    { id: "b3", account_id: "a", transaction_date: "2026-09-01", charge_date: null, direction: "credit" as const, amount_minor: 100000, currency_code: "ILS", reconciliation_status: "unmatched", internal_transfer_pair_id: null, transaction_type_code: null, accounts: { account_type_code: "checking" } },
  ];
  const roles = new Map([["b1", [{ role: "settlement", status: "matched" as const }]], ["c1", [{ role: "cycle_record", status: "matched" as const }]], ["b2", [{ role: "transfer_out", status: "candidate" as const }]]]);
  const out = classifyMovements(rows, roles);
  it("an approved card settlement is not a second expense; the card record is the expense", () => {
    expect(out.find((t) => t.id === "b1")?.layer).toBe("excluded");
    expect(out.find((t) => t.id === "c1")?.layer).toBe("out");
  });
  it("a pending candidate is shown as pending, never silently netted", () => {
    expect(out.find((t) => t.id === "b2")?.layer).toBe("pending_out");
    expect(out.find((t) => t.id === "b3")?.layer).toBe("in");
  });
});
