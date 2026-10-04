import { describe, it, expect } from "vitest";
import { metricCoverage } from "./coverage";

// Coverage behind a number (readiness ui-ux §2: "ליד כל מספר: as-of + coverage"; 22B §1; chapter 13): which sources the
// number rests on, which are missing, which were uploaded but do not cover the period, and up to when it is known.
const src = (kind: string, label: string, files: number, periodStart: string | null, periodEnd: string | null) => ({ kind, label, files, periodStart, periodEnd });
const MOVEMENTS = ["bank", "credit-card", "bit"];

describe("metricCoverage", () => {
  it("complete when every relevant source covers the month; known up to the earliest source end", () => {
    const c = metricCoverage([src("bank", "בנק", 1, "2026-07-01", "2026-07-31"), src("credit-card", "כרטיס", 1, "2026-06-01", "2026-07-20"), src("bit", "bit", 1, "2026-07-02", "2026-08-03")], "2026-07", MOVEMENTS);
    expect(c).toEqual({ basis: ["בנק", "כרטיס", "bit"], missing: [], notCovering: [], knownUntil: "2026-07-20", partial: false });
  });
  it("a source that was never uploaded makes the number partial — never presented as the full picture", () => {
    const c = metricCoverage([src("bank", "בנק", 1, "2026-07-01", "2026-07-31"), src("credit-card", "כרטיס", 0, null, null), src("bit", "bit", 0, null, null)], "2026-07", MOVEMENTS);
    expect(c.missing).toEqual(["כרטיס", "bit"]);
    expect(c.partial).toBe(true);
  });
  it("an uploaded source whose data does not reach this month is named as not covering it", () => {
    const c = metricCoverage([src("bank", "בנק", 1, "2026-07-01", "2026-07-31"), src("credit-card", "כרטיס", 2, "2026-05-01", "2026-06-30"), src("bit", "bit", 1, "2026-07-01", "2026-07-31")], "2026-07", MOVEMENTS);
    expect(c.notCovering).toEqual(["כרטיס"]);
    expect(c.basis).toEqual(["בנק", "bit"]);
    expect(c.partial).toBe(true);
  });
  it("ignores sources that are not relevant to the number", () => {
    const c = metricCoverage([src("bank", "בנק", 1, "2026-07-01", "2026-07-31"), src("green-invoice-income", "הכנסות", 0, null, null)], "2026-07", ["bank"]);
    expect(c).toMatchObject({ basis: ["בנק"], missing: [], partial: false });
  });
  it("no period selected: nothing is claimed", () => {
    expect(metricCoverage([src("bank", "בנק", 0, null, null)], null, ["bank"])).toEqual({ basis: [], missing: ["בנק"], notCovering: [], knownUntil: null, partial: true });
  });
});
