// Groups canonical pipeline_state values (18D §5) coming from the backend for display only (23D §12 "UI grouping
// of information that already arrived"). No state is inferred or invented: each group is a fixed set of canonical values.
export type PipelineSummary = { total: number; processing: number; attention: number; failed: number; done: number; excluded: number };
export type RouteAStep = "not_uploaded" | "processing" | "attention" | "processed";

const ATTENTION = new Set(["needs_review", "ready_for_review"]);
const EXCLUDED = new Set(["duplicate", "rejected", "archived"]);

export function summarizePipeline(states: readonly string[]): PipelineSummary {
  const s: PipelineSummary = { total: states.length, processing: 0, attention: 0, failed: 0, done: 0, excluded: 0 };
  for (const state of states) {
    if (state === "ready") s.done++;
    else if (state === "failed") s.failed++;
    else if (ATTENTION.has(state)) s.attention++;
    else if (EXCLUDED.has(state)) s.excluded++;
    else s.processing++; // uploaded, accepted, *_pending, classified … canonical_promoted
  }
  return s;
}

export function routeAStep(s: PipelineSummary): RouteAStep {
  if (s.total - s.excluded === 0) return "not_uploaded";
  if (s.failed + s.attention > 0) return "attention";
  if (s.processing > 0) return "processing";
  return "processed";
}

// Adds the counts of several sources shown as one card (e.g. Green Invoice income + expenses). Pure addition of
// counts that came from the backend — no financial meaning.
export function mergeSummaries(list: readonly PipelineSummary[]): PipelineSummary {
  const out = summarizePipeline([]);
  for (const s of list) {
    out.total += s.total; out.processing += s.processing; out.attention += s.attention;
    out.failed += s.failed; out.done += s.done; out.excluded += s.excluded;
  }
  return out;
}
