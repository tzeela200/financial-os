"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// Expenses by type (Calm Finance dashboard): a donut + a legend that is the readable source of truth (name, share,
// amount). Expense types come from the expense-type dictionary; "לא מסווג" stays visible. Presentation only.
export type TypeSlice = { label: string; amount: number; amountText: string };

// categorical palette from tokens (brand / secondary / accent / expected / planned / neutral) — never red: an expense
// is not an error
const COLORS = ["var(--color-brand-600)", "var(--color-accent-500)", "var(--color-secondary-600)", "var(--color-financial-planned)", "var(--color-accent-700)", "var(--color-border-strong)"];

export function ExpenseTypeChart({ slices }: { slices: TypeSlice[] }) {
  const top = slices.slice(0, 5);
  const rest = slices.slice(5);
  const data = rest.length ? [...top, { label: "אחר", amount: rest.reduce((n, s) => n + s.amount, 0), amountText: "" }] : top;
  const total = data.reduce((n, s) => n + s.amount, 0) || 1;
  return (
    <div className="type-chart">
      <ul className="type-legend">
        {data.map((s, i) => (
          <li key={s.label} className="type-legend-row">
            <span className="type-swatch" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
            <span className="type-legend-name">{s.label}</span>
            <span className="num type-legend-share">{Math.round((s.amount / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      <div className="type-chart-canvas" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="amount" nameKey="label" innerRadius="58%" outerRadius="92%" paddingAngle={1} stroke="var(--color-neutral-surface)" isAnimationActive={false}>
              {data.map((s, i) => <Cell key={s.label} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
