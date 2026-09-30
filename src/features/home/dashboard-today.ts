import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CoverageStatus } from "@/components/ui/coverage-indicator";
import { summarizePipeline, type PipelineSummary } from "@/features/sources/pipeline-summary";

// Read Model `dashboard_today` (18B §13.2, glossary) — Route A Home (ADR-007). Reads only through the user's
// session + RLS. No calculations here: money totals appear only once the deterministic calculation engine
// (Stage 6) provides them; until then the model returns null (never 0).
export type DashboardToday = {
  sourcesCount: number;
  accountsCount: number;
  lastSourceAt: string | null;
  coverage: { status: CoverageStatus; count: number }[];
  verification: { verified: number; total: number }; // sources.verification_status (18A §13) — counts only
  openReviewItems: number;
  openContradictions: number; // 18C §12 status open/in_review
  documents: { count: number; files: PipelineSummary };
  lastQa: { status: string; completedAt: string | null } | null;
  availableMoneyMinor: number | null;
  availableMoneyCurrency: string | null;
};

export async function getDashboardToday(): Promise<DashboardToday> {
  const supabase = await createClient();
  // independent reads in parallel (async-parallel)
  const [sources, accounts, lastSource, coverage, review, contradictions, documents, qa] = await Promise.all([
    supabase.from("sources").select("verification_status").is("archived_at", null),
    supabase.from("accounts").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("sources").select("acquired_at").is("archived_at", null).order("acquired_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("coverage_periods").select("status"),
    supabase.from("review_queue_items").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]),
    supabase.from("contradictions").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]),
    supabase.from("documents").select("pipeline_state").is("archived_at", null),
    supabase.from("qa_runs").select("status, completed_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const firstError = [sources, accounts, lastSource, coverage, review, contradictions, documents, qa].find((r) => r.error)?.error;
  if (firstError) throw new Error(`dashboard_today read failed: ${firstError.code ?? firstError.message}`);

  // UI grouping of server data only (23D §12) — no coverage computation in the frontend.
  const counts = new Map<CoverageStatus, number>();
  for (const row of (coverage.data ?? []) as { status: CoverageStatus }[]) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const sourceRows = (sources.data ?? []) as { verification_status: string }[];
  const docStates = ((documents.data ?? []) as { pipeline_state: string }[]).map((d) => d.pipeline_state);

  return {
    sourcesCount: sourceRows.length,
    accountsCount: accounts.count ?? 0,
    lastSourceAt: (lastSource.data as { acquired_at: string } | null)?.acquired_at ?? null,
    coverage: [...counts.entries()].map(([status, count]) => ({ status, count })),
    verification: { verified: sourceRows.filter((r) => r.verification_status === "verified").length, total: sourceRows.length },
    openReviewItems: review.count ?? 0,
    openContradictions: contradictions.count ?? 0,
    documents: { count: docStates.length, files: summarizePipeline(docStates) },
    lastQa: qa.data ? { status: (qa.data as { status: string }).status, completedAt: (qa.data as { completed_at: string | null }).completed_at } : null,
    availableMoneyMinor: null,
    availableMoneyCurrency: null,
  };
}
