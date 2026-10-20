import { sum, signedOut, type Classified, type Money } from "./classify";

// Monthly money in / out for the home chart (Calm Finance dashboard). Pure: the same classification and the same sums
// as the month numbers in the current picture, grouped by month. A month with no counted movement in a direction, or
// with mixed currencies, has null there — unknown, never 0.
export type MonthFlow = { month: string; moneyIn: Money | null; moneyOut: Money | null };

export function monthlyFlows(all: Classified[], lastMonths: number): MonthFlow[] {
  const months = [...new Set(all.map((t) => t.transaction_date.slice(0, 7)))].sort().slice(-lastMonths);
  return months.map((month) => {
    const rows = all.filter((t) => t.transaction_date.startsWith(month));
    const ins = sum(rows.filter((t) => t.layer === "in").map((t) => ({ amount: BigInt(t.amount_minor), currency: t.currency_code })));
    const outs = sum(rows.filter((t) => t.layer === "out").map((t) => ({ amount: signedOut(t), currency: t.currency_code })));
    return { month, moneyIn: ins.money, moneyOut: outs.money };
  });
}
