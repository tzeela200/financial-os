"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// Monthly money in / out (Calm Finance §4 Charts): Heebo, token colours, RTL time axis (newest at the inline end),
// readable shekel ticks, an accessible data table beside it. Presentation only — the series comes from the read model
// (same rules as the month numbers). A month without a value has no bar; it is never drawn as 0.
export type FlowPoint = { month: string; label: string; moneyIn: number | null; moneyOut: number | null };

const ils = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("he-IL", { notation: "compact", maximumFractionDigits: 1 });

export function MonthlyFlowChart({ points, currency }: { points: FlowPoint[]; currency: string }) {
  if (!points.length) return null;
  const fmt = (v: number | null) => (v === null ? "אין נתון" : currency === "ILS" ? ils.format(v) : `${compact.format(v)} ${currency}`);
  return (
    <figure className="flow-chart" aria-label="הכנסות והוצאות לפי חודש">
      <div className="flow-chart-canvas" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={4} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
            <XAxis dataKey="label" reversed tickLine={false} axisLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12, fontFamily: "var(--font-heebo)" }} />
            <YAxis orientation="right" tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => compact.format(v)} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12, fontFamily: "var(--font-heebo)" }} />
            <Tooltip cursor={{ fill: "var(--color-interaction-hover-overlay)" }} formatter={(v) => fmt(typeof v === "number" ? v : null)}
              contentStyle={{ fontFamily: "var(--font-heebo)", borderRadius: 10, border: "1px solid var(--color-border-default)", direction: "rtl", textAlign: "right" }} />
            <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontFamily: "var(--font-heebo)", fontSize: 13, paddingBottom: 8 }} />
            <Bar dataKey="moneyIn" name="נכנס" fill="var(--color-financial-positive)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="moneyOut" name="יצא" fill="var(--color-financial-negative)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="visually-hidden">
        <caption>הכנסות והוצאות לפי חודש</caption>
        <thead><tr><th scope="col">חודש</th><th scope="col">נכנס</th><th scope="col">יצא</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.month}><th scope="row">{p.label}</th><td>{fmt(p.moneyIn)}</td><td>{fmt(p.moneyOut)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
