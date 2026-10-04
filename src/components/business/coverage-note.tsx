import { dayLabel } from "@/features/picture/format";
import type { MetricCoverage } from "@/features/picture/coverage";
import { CoverageIndicator } from "@/components/ui/coverage-indicator";

// Coverage beside a material number (readiness ui-ux §2; 22B §1; 21B §30–§31): the canonical Coverage Indicator plus
// what the number rests on, up to when it is known, and — when partial — what is missing. Text, not colour alone.
// Presentation only: the read model decides.
export function CoverageNote({ coverage, testId }: { coverage: MetricCoverage; testId?: string }) {
  const c = coverage;
  return (
    <span className="coverage-note" data-testid={testId}>
      <CoverageIndicator status={c.partial ? "partial" : "complete"} />{" "}
      {c.basis.length ? <>לפי {c.basis.join(", ")}{c.knownUntil ? <> · ידוע עד <span className="num">{dayLabel(c.knownUntil)}</span></> : null}</> : "אין מקור שמכסה את התקופה"}
      {c.missing.length ? <> · חסר: {c.missing.join(", ")}</> : null}
      {c.notCovering.length ? <> · לא מכסה את התקופה: {c.notCovering.join(", ")}</> : null}
    </span>
  );
}
