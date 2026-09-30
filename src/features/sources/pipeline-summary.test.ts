import { describe, expect, it } from "vitest";
import { summarizePipeline, routeAStep } from "./pipeline-summary";

describe("summarizePipeline", () => {
  it("returns all zeros for no files (never invents progress)", () => {
    expect(summarizePipeline([])).toEqual({ total: 0, processing: 0, attention: 0, failed: 0, done: 0, excluded: 0 });
  });

  it("groups canonical pipeline_state values without computing anything else", () => {
    const s = summarizePipeline(["uploaded", "extraction_pending", "needs_review", "ready_for_review", "failed", "ready", "duplicate", "rejected", "archived"]);
    expect(s).toEqual({ total: 9, processing: 2, attention: 2, failed: 1, done: 1, excluded: 3 });
  });
});

describe("routeAStep", () => {
  it("not_uploaded when there are no files", () => {
    expect(routeAStep(summarizePipeline([]))).toBe("not_uploaded");
  });
  it("attention wins over processing (failed or needs review must be seen)", () => {
    expect(routeAStep(summarizePipeline(["uploaded", "failed"]))).toBe("attention");
    expect(routeAStep(summarizePipeline(["uploaded", "needs_review"]))).toBe("attention");
  });
  it("processing while any file is still in the pipeline", () => {
    expect(routeAStep(summarizePipeline(["ready", "uploaded"]))).toBe("processing");
  });
  it("processed only when files reached ready", () => {
    expect(routeAStep(summarizePipeline(["ready", "duplicate"]))).toBe("processed");
  });
  it("only excluded files (duplicate/rejected) is not progress", () => {
    expect(routeAStep(summarizePipeline(["duplicate", "rejected"]))).toBe("not_uploaded");
  });
});

describe("mergeSummaries", () => {
  it("adds counts of several sources (e.g. Green Invoice income + expenses)", async () => {
    const { mergeSummaries } = await import("./pipeline-summary");
    expect(mergeSummaries([summarizePipeline(["ready"]), summarizePipeline(["uploaded", "failed"])])).toEqual({
      total: 3, processing: 1, attention: 0, failed: 1, done: 1, excluded: 0,
    });
  });
  it("merging nothing gives zeros", async () => {
    const { mergeSummaries } = await import("./pipeline-summary");
    expect(mergeSummaries([])).toEqual(summarizePipeline([]));
  });
});
