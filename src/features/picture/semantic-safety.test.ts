import { describe, it, expect } from "vitest";
import { classifyMovements, computeCurrentMoney, sum, signedOut, type TxRow } from "./classify";

// Semantic safety (readiness acceptance-checklist §D; chapter 7 §6–§7, chapter 13). Synthetic rows only.
const row = (id: string, type: string, direction: "debit" | "credit", amount: number): TxRow => ({
  id, account_id: `acc-${type}`, transaction_date: "2026-09-10", charge_date: null, direction, amount_minor: amount, currency_code: "ILS",
  reconciliation_status: "unmatched", internal_transfer_pair_id: null, transaction_type_code: null, accounts: { account_type_code: type },
});
const acc = (id: string, type: string, balance: number | null, asOf: string | null = "2026-09-30") => ({
  id, name: id, type, balance: balance === null ? null : { minor: String(balance), currency: "ILS" }, balanceAsOf: balance === null ? null : asOf,
  stale: false, firstDate: null, lastDate: null, transactions: 0,
});

describe("semantic safety — movements", () => {
  it("a card refund is not a normal charge: it reduces spending", () => {
    const [r] = classifyMovements([row("c1", "credit_card", "credit", 5000)], new Map());
    expect(r.layer).toBe("out");
    expect(signedOut(r)).toBe(-5000n);
  });
  it("an approved payment-app funding is not counted twice with the bank movement", () => {
    const out = classifyMovements([row("b1", "checking", "debit", 10000), row("p1", "payment_app", "debit", 10000)],
      new Map([["b1", [{ role: "funding", status: "matched" as const }]]]));
    expect(out.find((t) => t.id === "b1")?.layer).toBe("excluded");
    expect(out.find((t) => t.id === "p1")?.layer).toBe("out");
  });
  it("no movements is unknown (null), never 0", () => {
    expect(sum([]).money).toBeNull();
  });
});

describe("semantic safety — current money (chapter 13: reported balances only)", () => {
  it("a credit card limit / balance is never counted as cash", () => {
    const m = computeCurrentMoney([acc("bank", "checking", 100000), acc("card", "credit_card", 300000)]);
    expect(m.total).toEqual({ minor: "100000", currency: "ILS" });
  });
  it("a bank without a reported balance makes the total unknown and partial, never 0", () => {
    const m = computeCurrentMoney([acc("bank1", "checking", 100000), acc("bank2", "checking", null)]);
    expect(m.total).toBeNull();
    expect(m.partial).toBe(true);
    expect(m.reason).toBe("bank_without_balance");
  });
  it("no bank source at all is unknown with its reason, never 0", () => {
    const m = computeCurrentMoney([acc("card", "credit_card", 300000)]);
    expect(m.total).toBeNull();
    expect(m.reason).toBe("no_bank_source");
  });
  it("a negative reported balance stays negative", () => {
    expect(computeCurrentMoney([acc("bank", "checking", -79762)]).total).toEqual({ minor: "-79762", currency: "ILS" });
  });
});
