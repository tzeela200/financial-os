import { describe, it, expect } from "vitest";
import { classifyMovements, type TxRow } from "./classify";
import { monthlyFlows } from "./monthly-flows";

// Monthly in/out series for the home chart (Calm Finance): the same classification and the same sums as the month
// numbers — grouped by month. Synthetic rows only.
const row = (id: string, date: string, type: string, direction: "debit" | "credit", amount: number, currency = "ILS"): TxRow => ({
  id, account_id: `acc-${type}`, transaction_date: date, charge_date: null, direction, amount_minor: amount, currency_code: currency,
  reconciliation_status: "unmatched", internal_transfer_pair_id: null, transaction_type_code: null, accounts: { account_type_code: type },
});

describe("monthlyFlows", () => {
  it("sums in and out per month with the same rules as the month numbers (card refund reduces spending)", () => {
    const all = classifyMovements([
      row("a", "2026-08-03", "checking", "credit", 100000),
      row("b", "2026-08-05", "credit_card", "debit", 30000),
      row("c", "2026-08-09", "credit_card", "credit", 5000),
      row("d", "2026-09-01", "checking", "debit", 20000),
    ], new Map());
    expect(monthlyFlows(all, 12)).toEqual([
      { month: "2026-08", moneyIn: { minor: "100000", currency: "ILS" }, moneyOut: { minor: "25000", currency: "ILS" } },
      { month: "2026-09", moneyIn: null, moneyOut: { minor: "20000", currency: "ILS" } },
    ]);
  });

  it("never counts excluded movements (matched card settlement in the bank)", () => {
    const all = classifyMovements([row("s", "2026-09-10", "checking", "debit", 30000)], new Map([["s", [{ role: "settlement", status: "matched" as const }]]]));
    expect(monthlyFlows(all, 12)).toEqual([{ month: "2026-09", moneyIn: null, moneyOut: null }]);
  });

  it("keeps only the last N months, oldest first", () => {
    const all = classifyMovements(["2026-01", "2026-02", "2026-03"].map((m, i) => row(`r${i}`, `${m}-10`, "checking", "debit", 100)), new Map());
    expect(monthlyFlows(all, 2).map((m) => m.month)).toEqual(["2026-02", "2026-03"]);
  });

  it("a month with mixed currencies has no single total (unknown, not 0)", () => {
    const all = classifyMovements([row("x", "2026-09-01", "checking", "debit", 100, "ILS"), row("y", "2026-09-02", "checking", "debit", 100, "USD")], new Map());
    expect(monthlyFlows(all, 12)[0]).toMatchObject({ moneyOut: null });
  });
});
