import Link from "next/link";
import { CoverageIndicator, type CoverageStatus } from "@/components/ui/coverage-indicator";
import type { PipelineSummary } from "@/features/sources/pipeline-summary";

// Source Card (21B §35) inside the Home KPI strip (21C §12, 3–5 cards): source type, intake date, files,
// processing status (canonical pipeline groups from the backend), coverage. Upload is per source — no generic upload.
export type SourceCardProps = {
  title: string;
  files: PipelineSummary;
  lastAcquiredAt: string | null;
  coverage: CoverageStatus | null; // null = the source has no coverage domain (documents)
  uploads: { href: string; label: string }[];
  note?: string;
  testId: string;
};

const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jerusalem" });

export function SourceCard(p: SourceCardProps) {
  const active = p.files.total - p.files.excluded;
  return (
    <article className="card metric source-kpi" data-testid={p.testId} aria-label={p.title}>
      <h3 className="metric-label">{p.title}</h3>
      <div className="metric-value">
        <span className="num">{active}</span> <span className="metric-unit">קבצים</span>
      </div>
      <ul className="source-kpi-status">
        {active === 0 ? <li>עדיין לא נקלט</li> : null}
        {p.files.processing > 0 ? <li className="tone-info">ממתינים לעיבוד: <span className="num">{p.files.processing}</span></li> : null}
        {p.files.attention > 0 ? <li className="tone-warn">דורשים בדיקה: <span className="num">{p.files.attention}</span></li> : null}
        {p.files.failed > 0 ? <li className="tone-err">נכשלו בעיבוד: <span className="num">{p.files.failed}</span></li> : null}
        {p.files.done > 0 ? <li>עובדו: <span className="num">{p.files.done}</span></li> : null}
        {p.files.excluded > 0 ? <li>כפילויות או נדחו: <span className="num">{p.files.excluded}</span></li> : null}
      </ul>
      <div className="metric-foot">
        קליטה אחרונה: {p.lastAcquiredAt ? <span className="num">{dateFmt.format(new Date(p.lastAcquiredAt))}</span> : "—"}
      </div>
      {p.coverage ? <CoverageIndicator status={p.coverage} /> : null}
      {p.note ? <p className="metric-foot">{p.note}</p> : null}
      {p.uploads.length > 0 ? (
        <div className="source-kpi-actions">
          {p.uploads.map((u) => (
            <Link key={u.href} href={u.href} className="btn-secondary">{u.label}</Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}
