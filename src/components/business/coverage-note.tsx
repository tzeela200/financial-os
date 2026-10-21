import { dayLabel } from "@/features/picture/format";
import type { MetricCoverage } from "@/features/picture/coverage";
import { CoverageIndicator } from "@/components/ui/coverage-indicator";

// Coverage beside a material number (readiness ui-ux §2; 22B §1; 21B §30–§31): the canonical Coverage Indicator plus
// what the number rests on, up to when it is known, and — when partial — what is missing. Text, not colour alone.
// Presentation only: the read model decides.
// detail="short" (inside a metric card): indicator and known-until only. What is missing is said once per screen —
// in the Trust Bar or the screen's single basis line — never repeated in every card (design review 20.10.2026).
export function CoverageNote({ coverage, testId, detail = "full" }: { coverage: MetricCoverage; testId?: string; detail?: "plain" | "short" | "full" }) {
  const c = coverage;
  // plain (inside a metric card): coverage + as-of in quiet text beside the number (ui-ux-implementation §2 "ליד כל
  // מספר: as-of + coverage"); what is missing is said once per screen, in the status line
  if (detail === "plain") return (
    <span className="coverage-note" data-testid={testId}>
      {c.partial ? "חלקי · " : null}
      {c.knownUntil ? <>עד <span className="num">{dayLabel(c.knownUntil)}</span></> : "אין עדיין מקור לחודש הזה"}
    </span>
  );
  return (
    <span className="coverage-note" data-testid={testId}>
      <CoverageIndicator status={c.partial ? "partial" : "complete"} />{" "}
      {detail === "short"
        ? <>
            {c.knownUntil ? <>ידוע עד <span className="num">{dayLabel(c.knownUntil)}</span></> : !c.basis.length ? "אין מקור שמכסה את התקופה" : null}
          </>
        : <>
            {c.basis.length ? <>לפי {c.basis.join(", ")}{c.knownUntil ? <> · ידוע עד <span className="num">{dayLabel(c.knownUntil)}</span></> : null}</> : "אין מקור שמכסה את התקופה"}
            {c.missing.length ? <> · חסר: {c.missing.join(", ")}</> : null}
            {c.notCovering.length ? <> · לא מכסה את התקופה: {c.notCovering.join(", ")}</> : null}
          </>}
    </span>
  );
}
