// Coverage Indicator (21B §30, ADR-001): exactly five canonical states; text + color, never color alone.
export type CoverageStatus = "unknown" | "none" | "partial" | "complete" | "stale";

const LABEL: Record<CoverageStatus, string> = {
  complete: "כיסוי מלא",
  partial: "כיסוי חלקי",
  none: "אין כיסוי",
  unknown: "כיסוי לא ידוע",
  stale: "לא עדכני",
};
const TONE: Record<CoverageStatus, string> = { complete: "ok", partial: "warn", none: "err", unknown: "neutral", stale: "neutral" };

export function CoverageIndicator({ status }: { status: CoverageStatus }) {
  return (
    <span className={`badge badge--${TONE[status]}`}>
      <span className="badge-dot" aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}
