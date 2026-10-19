import { Layers, Clock, BadgeCheck, Inbox, TriangleAlert, FileWarning } from "lucide-react";
import { CoverageIndicator } from "@/components/ui/coverage-indicator";
import type { MetricCoverage } from "@/features/picture/coverage";
import { dayLabel } from "@/features/picture/format";

// Trust Bar (21B §28; 20C §7; 19B §7): coverage, freshness, verification and contradictions — each shown separately
// with text + icon (21B §83), never an aggregate "trust score" (21B §28, 23B §27). One shared component fed by the
// current_financial_picture read model, so Home and the snapshot always say the same thing (design review 20.10.2026).
export type TrustBarProps = {
  coverage: MetricCoverage;
  lastFileAt: string | null;
  docs: { passed: number; total: number; needsReview: number; failed: number };
  openReview: number;
  openContradictions: number;
};

export function TrustBar(p: TrustBarProps) {
  const c = p.coverage;
  return (
    <section className="trust-bar" aria-label="סרגל אמינות">
      <span className="trust-item">
        <Layers aria-hidden="true" size={16} />
        <span className="trust-label">כיסוי</span>
        <CoverageIndicator status={c.partial ? "partial" : "complete"} />
        {c.missing.length ? <span className="trust-detail">חסר: {c.missing.join(", ")}</span> : null}
      </span>
      <span className="trust-item">
        <Clock aria-hidden="true" size={16} />
        <span className="trust-label">עדכניות</span>
        {c.knownUntil ? <span>נתונים עד <span className="num">{dayLabel(c.knownUntil)}</span></span> : "אין עדיין נתונים"}
        {p.lastFileAt ? <span className="trust-detail">קובץ אחרון <span className="num">{dayLabel(p.lastFileAt.slice(0, 10))}</span></span> : null}
      </span>
      <span className="trust-item">
        <BadgeCheck aria-hidden="true" size={16} />
        <span className="trust-label">קבצים</span>
        {p.docs.total === 0 ? "עדיין לא נקלטו" : <span><span className="num">{p.docs.passed}</span> מתוך <span className="num">{p.docs.total}</span> עברו בדיקה</span>}
      </span>
      <span className={`trust-item${p.openReview ? " trust-item--warn" : ""}`}>
        <Inbox aria-hidden="true" size={16} />
        <span className="trust-label">לטיפול</span>
        <span className="num">{p.openReview}</span>
      </span>
      {p.docs.failed > 0 ? (
        <span className="trust-item trust-item--warn">
          <FileWarning aria-hidden="true" size={16} />
          <span className="trust-label">עיבוד נכשל</span>
          <span className="num">{p.docs.failed}</span>
        </span>
      ) : null}
      {p.openContradictions > 0 ? (
        <span className="trust-item trust-item--warn">
          <TriangleAlert aria-hidden="true" size={16} />
          <span className="trust-label">סתירות פתוחות</span>
          <span className="num">{p.openContradictions}</span>
        </span>
      ) : null}
    </section>
  );
}

/** The read model → Trust Bar props (presentation mapping only). */
export function trustFromPicture(p: { flows: { coverage: MetricCoverage }; sources: { lastUploadAt: string | null }[]; trust: { verifiedDocs: number; totalDocs: number; needsReviewDocs: number; failedFiles: number; openReview: number; openContradictions: number } }): TrustBarProps {
  return {
    coverage: p.flows.coverage,
    lastFileAt: p.sources.map((s) => s.lastUploadAt).filter(Boolean).sort().reverse()[0] ?? null,
    docs: { passed: p.trust.verifiedDocs, total: p.trust.totalDocs, needsReview: p.trust.needsReviewDocs, failed: p.trust.failedFiles },
    openReview: p.trust.openReview,
    openContradictions: p.trust.openContradictions,
  };
}
