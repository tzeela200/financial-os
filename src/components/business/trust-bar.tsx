import { Layers, Clock, BadgeCheck, ListChecks, TriangleAlert, Inbox } from "lucide-react";
import { CoverageIndicator, type CoverageStatus } from "@/components/ui/coverage-indicator";

// Trust Bar (21B §28; 20C §7; 19B §7): Coverage, Freshness, Verification, QA and Contradictions — each shown
// separately with text + icon (21B §83). Never an aggregate "trust score" (21B §28, 23B §27).
export type TrustBarProps = {
  coverage: { status: CoverageStatus; count: number }[];
  lastUpdatedAt: string | null;
  verification: { verified: number; total: number };
  qa: { status: string } | null;
  openContradictions: number;
  openReviewItems: number;
};

const QA_LABEL: Record<string, string> = {
  queued: "בתור",
  running: "רצה",
  passed: "עברה",
  passed_with_warnings: "עברה עם אזהרות",
  failed: "נכשלה",
};
const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jerusalem" });

export function TrustBar(p: TrustBarProps) {
  return (
    <section className="trust-bar" aria-label="סרגל אמינות">
      <span className="trust-item">
        <Layers aria-hidden="true" size={16} />
        <span className="trust-label">כיסוי</span>
        {p.coverage.length === 0 ? (
          <CoverageIndicator status="unknown" />
        ) : (
          p.coverage.map((c) => (
            <span key={c.status} className="trust-item">
              <CoverageIndicator status={c.status} />
              <span className="num">{c.count}</span>
            </span>
          ))
        )}
      </span>
      <span className="trust-item">
        <Clock aria-hidden="true" size={16} />
        <span className="trust-label">עדכון אחרון</span>
        {p.lastUpdatedAt ? <span className="num">{dateFmt.format(new Date(p.lastUpdatedAt))}</span> : "אין עדיין מקורות"}
      </span>
      <span className="trust-item">
        <BadgeCheck aria-hidden="true" size={16} />
        <span className="trust-label">אימות</span>
        {p.verification.total === 0 ? (
          "אין מקורות לאימות"
        ) : (
          <span>
            <span className="num">{p.verification.verified}</span> מאומתים מתוך <span className="num">{p.verification.total}</span>
          </span>
        )}
      </span>
      <span className="trust-item">
        <ListChecks aria-hidden="true" size={16} />
        <span className="trust-label">בקרת איכות</span>
        {p.qa ? (QA_LABEL[p.qa.status] ?? p.qa.status) : "עדיין לא רצה"}
      </span>
      <span className="trust-item">
        <Inbox aria-hidden="true" size={16} />
        <span className="trust-label">לבדיקה</span>
        <span className="num">{p.openReviewItems}</span>
      </span>
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
