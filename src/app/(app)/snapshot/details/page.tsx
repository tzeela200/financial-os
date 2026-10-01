import Link from "next/link";
import { getMetricDetail, type DetailRow } from "@/features/picture/details";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import { BackLink } from "@/components/workspace/back-link";
import "@/components/ui/ui.css";
import "@/components/business/business.css";

export const dynamic = "force-dynamic";

const METRICS = new Set(["money_in", "money_out", "money_out_pending", "business", "upcoming_card_charges"]);

// Drill-down: the components of exactly the number that was clicked (same read model, same month, same sum).
export default async function DetailsPage({ searchParams }: PageProps<"/snapshot/details">) {
  const sp = await searchParams;
  const metric = typeof sp.metric === "string" && METRICS.has(sp.metric) ? sp.metric : "money_out";
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : null;
  const d = await getMetricDetail(metric, month);

  return (
    <div className="ws">
      <BackLink href={`/snapshot${month ? `?month=${month}` : ""}`} label="חזרה לתמונת המצב" />
      <header className="ws-header">
        <div>
          <p className="ws-eyebrow">פירוט{month ? ` · ${monthLabel(month)}` : ""}</p>
          <h1 className="ws-title">{d.title}</h1>
        </div>
        <div className="detail-total">
          <span className="metric-label">סה״כ</span>
          <span className="metric-value metric-value--md" data-testid="detail-total"><Amount value={d.total} unknownText={d.mixedCurrency ? "מטבעות שונים" : "אין נתונים"} /></span>
          <span className="metric-foot">{d.rows.length} רשומות</span>
        </div>
      </header>
      <RowsTable rows={d.rows} />
      {d.excluded.length ? (
        <section className="file-section" aria-labelledby="excluded">
          <h2 id="excluded" className="section-title">לא נספרו בסכום הזה — ולמה</h2>
          <RowsTable rows={d.excluded} />
        </section>
      ) : null}
    </div>
  );
}

function RowsTable({ rows }: { rows: DetailRow[] }) {
  if (!rows.length) return <p className="card muted-note">אין רשומות.</p>;
  return (
    <div className="table-scroll card">
      <table className="data-table" data-testid="detail-rows">
        <thead><tr><th scope="col">תאריך</th><th scope="col">תיאור</th><th scope="col">מקור / חשבון</th><th scope="col">סכום</th><th scope="col">מצב</th><th scope="col">הערה</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.id}`}>
              <td className="num">{dayLabel(r.date)}</td>
              <td><Link href={`/records/${r.kind}/${r.id}`} className="file-link">{r.description || "ללא תיאור"}</Link></td>
              <td>{r.account}</td>
              <td className={r.direction === "credit" ? "fin-pos" : "fin-neg"}><Amount value={r.amount} /></td>
              <td>{r.status}</td>
              <td className="muted">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
