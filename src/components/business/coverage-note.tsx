import { dayLabel } from "@/features/picture/format";
import type { MetricCoverage } from "@/features/picture/coverage";
import { CoverageIndicator } from "@/components/ui/coverage-indicator";

// Coverage beside a material number (readiness ui-ux §2; 22B §1; 21B §30–§31): the canonical Coverage Indicator plus
// what the number rests on, up to when it is known, and — when partial — what is missing. Text, not colour alone.
// Presentation only: the read model decides.
// detail="short" (inside a metric card): indicator, known-until and what is missing — the full basis is shown once
// beside the group of cards, so the same sentence is not repeated in every card (22A §6; heuristic: minimalism).
export function CoverageNote({ coverage, testId, detail = "full" }: { coverage: MetricCoverage; testId?: string; detail?: "short" | "full" }) {
  const c = coverage;
  return (
    <span className="coverage-note" data-testid={testId}>
      <CoverageIndicator status={c.partial ? "partial" : "complete"} />{" "}
      {detail === "short"
        ? (c.knownUntil ? <>ידוע עד <span className="num">{dayLabel(c.knownUntil)}</span></> : c.basis.length ? null : "אין מקור שמכסה את התקופה")
        : c.basis.length ? <>לפי {c.basis.join(", ")}{c.knownUntil ? <> · ידוע עד <span className="num">{dayLabel(c.knownUntil)}</span></> : null}</> : "אין מקור שמכסה את התקופה"}
      {c.missing.length ? <> · חסר: {c.missing.join(", ")}</> : null}
      {c.notCovering.length ? <> · לא מכסה את התקופה: {c.notCovering.join(", ")}</> : null}
    </span>
  );
}
