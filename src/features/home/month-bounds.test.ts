import { describe, it, expect } from "vitest";
import { monthBounds } from "./month-bounds";

// Production incident 21.10.2026: "YYYY-MM-31" is not a date for 30-day months — the expenses query failed and the
// whole home page with it. A month is [first day, first day of the next month).
describe("monthBounds", () => {
  it("a 30-day month ends before the first of the next month (never a non-existent 31st)", () => {
    expect(monthBounds("2026-09")).toEqual({ start: "2026-09-01", endExclusive: "2026-10-01" });
  });
  it("February and December roll over correctly", () => {
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", endExclusive: "2026-03-01" });
    expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
  });
});
