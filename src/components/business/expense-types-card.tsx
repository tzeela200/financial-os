import { PieChart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpenseTypeChart } from "@/components/business/expense-type-chart";
import { formatMoney } from "@/components/ui/money-amount";
import { monthLabel } from "@/features/picture/format";
import type { ExpenseTypes } from "@/features/home/home-extras";

// Business expenses by type (expense-type dictionary). Shares are computed within one currency only — foreign-currency
// documents are listed beside it and never added to shekels. When the selected month has no expense, the latest month
// that has one is shown and named.
export function ExpenseTypesCard({ types, month }: { types: ExpenseTypes; month: string | null }) {
  const mainCur = types.slices.some((s) => s.amount.currency === "ILS") ? "ILS" : types.slices[0]?.amount.currency;
  const slices = types.slices.filter((s) => s.amount.currency === mainCur).map((s) => ({ label: s.label, amount: Number(BigInt(s.amount.minor)) / 100, amountText: formatMoney(BigInt(s.amount.minor), s.amount.currency) }));
  const other = [...types.slices.filter((s) => s.amount.currency !== mainCur).reduce((m, s) => m.set(s.amount.currency, (m.get(s.amount.currency) ?? 0n) + BigInt(s.amount.minor)), new Map<string, bigint>())].map(([c, v]) => formatMoney(v, c));
  return (
    <section aria-labelledby="types" className="card dash-card" data-testid="expense-types">
      <div className="dash-card-head">
        <h2 id="types" className="card-title">הוצאות העסק לפי סוג{types.month ? <span className="card-sub"> · {monthLabel(types.month)}</span> : null}</h2>
      </div>
      {types.month && month && types.month !== month && slices.length ? <p className="dash-note" data-testid="expense-types-month">אין הוצאות ב{monthLabel(month)} — מוצג החודש האחרון שיש בו הוצאות</p> : null}
      {other.length ? <p className="dash-note" data-testid="expense-types-other-currency">בנוסף במטבע זר (לא נכלל באחוזים): {other.join(" · ")}</p> : null}
      {slices.length ? <ExpenseTypeChart slices={slices} />
        : <EmptyState icon={PieChart} size="compact" title={types.status === "unavailable" ? "מילון סוגי ההוצאות עדיין לא זמין בסביבה הזו" : "יופיע אחרי קליטת הוצאות מחשבונית ירוקה"} />}
    </section>
  );
}
