import { describe, expect, it } from "vitest";
import { buildToolRuns, reconciliationRun } from "./lineage";
import { RECONCILIATION_RULE_VERSION } from "@/features/reconciliation/engine";
import { EXTRACTOR_VERSION } from "./extract";
import { SEMANTIC_ENGINE_VERSION } from "./semantic";
import { VERIFICATION_RULE_VERSION } from "./validate";
import { CLASSIFIER_VERSION } from "./classify-document";
import { PROMOTION_RULE_VERSION } from "./promote";

// Stage D (DI-4 §4): every run of a code rule is recorded in tool_runs as a parser / rule_engine with the rule's own
// name and version — never as a Skill (MASTER_SPEC §22; route-a-completion §2ב).
const base = {
  format: "xlsx",
  rows: 40,
  classification: { family: "bank_documents", supported: true, mismatch: false },
  tables: [
    { sheet: "s1", via: "semantic", adapter: null },
    { sheet: "s2", via: "approved_adapter", adapter: { id: "a-1", version: 3 } },
    { sheet: "s3", via: "approved_adapter", adapter: { id: "a-1", version: 3 } },
  ],
  needsMapping: false,
  checks: [{ code: "required_fields", status: "passed" as const }],
  promotion: { planned: 12, notPromoted: 0, blocked: false },
};

describe("buildToolRuns", () => {
  it("records only parsers and rule engines, never a Skill", () => {
    const runs = buildToolRuns(base);
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      expect(["parser", "rule_engine"]).toContain(r.tool_type);
      expect(r.tool_name).not.toMatch(/^israeli-|skill/i);
    }
  });

  it("records the reader with the extractor version and the format it read", () => {
    const reader = buildToolRuns(base).find((r) => r.tool_name === "reader");
    expect(reader).toMatchObject({ tool_type: "parser", version: EXTRACTOR_VERSION, status: "success" });
    expect(reader?.output).toMatchObject({ format: "xlsx", rows: 40 });
  });

  it("records classification, semantic understanding, verification and promotion with their versions", () => {
    const byName = new Map(buildToolRuns(base).map((r) => [r.tool_name, r]));
    expect(byName.get("content-classifier")).toMatchObject({ tool_type: "rule_engine", version: CLASSIFIER_VERSION });
    expect(byName.get("semantic-engine")).toMatchObject({ tool_type: "rule_engine", version: SEMANTIC_ENGINE_VERSION });
    expect(byName.get("row-verification")).toMatchObject({ tool_type: "rule_engine", version: VERIFICATION_RULE_VERSION });
    expect(byName.get("promotion-planner")).toMatchObject({ tool_type: "rule_engine", version: PROMOTION_RULE_VERSION });
  });

  it("records each approved adapter once, with the adapter's own version", () => {
    const adapters = buildToolRuns(base).filter((r) => r.tool_name.startsWith("adapter:"));
    expect(adapters).toEqual([expect.objectContaining({ tool_type: "parser", tool_name: "adapter:a-1", version: "3" })]);
  });

  it("marks understanding partial when questions stay open, and verification partial when a check did not pass", () => {
    const runs = buildToolRuns({ ...base, needsMapping: true, checks: [{ code: "balance_continuity", status: "failed" }] });
    expect(runs.find((r) => r.tool_name === "semantic-engine")?.status).toBe("partial");
    expect(runs.find((r) => r.tool_name === "row-verification")?.status).toBe("partial");
  });

  it("records a reconciliation run with its rule version and the candidates it produced", () => {
    expect(reconciliationRun(3)).toEqual({ tool_type: "rule_engine", tool_name: "reconciliation-candidates", version: RECONCILIATION_RULE_VERSION, status: "success", output: { candidates: 3 } });
  });

  it("records a blocked promotion as partial, not as success", () => {
    const runs = buildToolRuns({ ...base, promotion: { planned: 0, notPromoted: 0, blocked: true } });
    expect(runs.find((r) => r.tool_name === "promotion-planner")).toMatchObject({ status: "partial", output: { blocked: true } });
  });
});
