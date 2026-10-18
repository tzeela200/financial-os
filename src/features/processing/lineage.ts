import { EXTRACTOR_VERSION } from "./extract";
import { SEMANTIC_ENGINE_VERSION } from "./semantic";
import { VERIFICATION_RULE_VERSION } from "./validate";
import { CLASSIFIER_VERSION } from "./classify-document";
import { PROMOTION_RULE_VERSION } from "./promote";
import { RECONCILIATION_RULE_VERSION } from "@/features/reconciliation/engine";

// Run lineage (18C §5–§7; 23D §132–133; MASTER_SPEC 19.09 §19; route-a-completion §2א DI-4 §4). Each code rule that
// touched a document is recorded in tool_runs as a parser or rule_engine, with the rule's own name and version, so that
// every canonical record can be traced to the run that produced it. Skills guide development only and are never recorded
// as runs (§2ב; MASTER_SPEC §22). Inputs (file, hash) are attached server-side by processing_record_tool_runs.

export type ToolRun = {
  tool_type: "parser" | "rule_engine";
  tool_name: string;
  version: string;
  status: "success" | "partial" | "failed";
  output: Record<string, unknown>;
};

export type RunFacts = {
  format: string;
  rows: number;
  classification: { family: string; supported: boolean; mismatch: boolean } | null;
  tables: { sheet: string; via: string; adapter: { id: string; version: number | string } | null }[];
  needsMapping: boolean;
  checks: { code: string; status: "passed" | "warned" | "failed" }[];
  promotion: { planned: number; notPromoted: number; blocked: boolean };
};

export function buildToolRuns(f: RunFacts): ToolRun[] {
  const runs: ToolRun[] = [
    { tool_type: "parser", tool_name: "reader", version: EXTRACTOR_VERSION, status: "success", output: { format: f.format, rows: f.rows } },
  ];
  if (f.classification) {
    runs.push({ tool_type: "rule_engine", tool_name: "content-classifier", version: CLASSIFIER_VERSION, status: "success", output: { ...f.classification } });
  }
  const adapters = new Map<string, string>();
  for (const t of f.tables) if (t.adapter) adapters.set(t.adapter.id, String(t.adapter.version));
  for (const [id, version] of adapters) {
    runs.push({ tool_type: "parser", tool_name: `adapter:${id}`, version, status: "success", output: { sheets: f.tables.filter((t) => t.adapter?.id === id).map((t) => t.sheet) } });
  }
  runs.push({
    tool_type: "rule_engine", tool_name: "semantic-engine", version: SEMANTIC_ENGINE_VERSION,
    status: f.needsMapping ? "partial" : "success",
    output: { tables: f.tables.map((t) => ({ sheet: t.sheet, via: t.via })), needsMapping: f.needsMapping },
  });
  const notPassed = f.checks.filter((c) => c.status !== "passed");
  runs.push({
    tool_type: "rule_engine", tool_name: "row-verification", version: VERIFICATION_RULE_VERSION,
    status: notPassed.length ? "partial" : "success",
    output: { checks: f.checks.length, notPassed: notPassed.map((c) => c.code) },
  });
  runs.push({
    tool_type: "rule_engine", tool_name: "promotion-planner", version: PROMOTION_RULE_VERSION,
    status: f.promotion.blocked ? "partial" : "success",
    output: { ...f.promotion },
  });
  return runs;
}

/** The cross-source reconciliation pass (chapter 7): candidates only, never an approval. */
export function reconciliationRun(candidates: number): ToolRun {
  return { tool_type: "rule_engine", tool_name: "reconciliation-candidates", version: RECONCILIATION_RULE_VERSION, status: "success", output: { candidates } };
}

/** A file the deterministic readers could not read (chapter 5 §21: not "no data") — recorded as a failed reader run. */
export function readerFailedRun(reason: string, detail: string | null): ToolRun {
  return { tool_type: "parser", tool_name: "reader", version: EXTRACTOR_VERSION, status: "failed", output: { reason, detail } };
}
