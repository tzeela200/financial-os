import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CoverageStatus } from "@/components/ui/coverage-indicator";
import { ROUTE_A_SOURCES, type RouteASource } from "./route-a-sources";
import { summarizePipeline, type PipelineSummary } from "./pipeline-summary";

// Read model for B5 (22B §59–69) and Home Source Cards (21B §35): per known source — sources, files, canonical
// pipeline states, last intake and the latest coverage period of its domain. RLS-bound; no calculation.
export type SourceSummary = {
  kind: RouteASource["kind"];
  sourcesCount: number;
  filesCount: number;
  files: PipelineSummary;
  lastAcquiredAt: string | null;
  coverage: CoverageStatus; // latest coverage_periods row of the domain; "unknown" when none exists (never assumed)
};

type Row = { id: string; source_type: string; acquired_at: string; source_files: { pipeline_state: string }[] };
type CoverageRow = { status: CoverageStatus; expected_to: string; coverage_scopes: { domain: string } | null };

export async function getSourcesOverview(): Promise<SourceSummary[]> {
  const supabase = await createClient();
  const [sources, coverage] = await Promise.all([
    supabase.from("sources").select("id, source_type, acquired_at, source_files(pipeline_state)").is("archived_at", null),
    supabase.from("coverage_periods").select("status, expected_to, coverage_scopes(domain)").order("expected_to", { ascending: false }),
  ]);
  const err = sources.error ?? coverage.error;
  if (err) throw new Error(`sources overview read failed: ${err.code ?? err.message}`);

  const rows = (sources.data ?? []) as Row[];
  const latestByDomain = new Map<string, CoverageStatus>();
  for (const c of (coverage.data ?? []) as unknown as CoverageRow[]) {
    const d = c.coverage_scopes?.domain;
    if (d && !latestByDomain.has(d)) latestByDomain.set(d, c.status); // rows arrive newest first
  }

  return ROUTE_A_SOURCES.map((s) => {
    const mine = rows.filter((r) => s.sourceTypes.includes(r.source_type));
    const states = mine.flatMap((r) => r.source_files.map((f) => f.pipeline_state));
    return {
      kind: s.kind,
      sourcesCount: mine.length,
      filesCount: states.length,
      files: summarizePipeline(states),
      lastAcquiredAt: mine.map((r) => r.acquired_at).sort().at(-1) ?? null,
      coverage: latestByDomain.get(s.coverageDomain) ?? "unknown",
    };
  });
}
