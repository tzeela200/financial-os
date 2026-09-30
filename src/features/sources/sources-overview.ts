import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ROUTE_A_SOURCES } from "./route-a-sources";

// Read model for B5 (22B §59–69): per known source — how many sources, files, last intake. RLS-bound.
export type SourceSummary = { kind: string; sourcesCount: number; filesCount: number; lastAcquiredAt: string | null };

type Row = { id: string; source_type: string; acquired_at: string; source_files: { id: string }[] };

export async function getSourcesOverview(): Promise<SourceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sources")
    .select("id, source_type, acquired_at, source_files(id)")
    .is("archived_at", null);
  if (error) throw new Error(`sources overview read failed: ${error.code ?? error.message}`);
  const rows = (data ?? []) as Row[];
  return ROUTE_A_SOURCES.map((s) => {
    const mine = rows.filter((r) => s.sourceTypes.includes(r.source_type));
    const last = mine.map((r) => r.acquired_at).sort().at(-1) ?? null;
    return {
      kind: s.kind,
      sourcesCount: mine.length,
      filesCount: mine.reduce((n, r) => n + r.source_files.length, 0),
      lastAcquiredAt: last,
    };
  });
}
