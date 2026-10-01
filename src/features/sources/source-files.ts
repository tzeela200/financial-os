import "server-only";
import { createClient } from "@/lib/supabase/server";

// Source Detail files list (22B §68): the files received for given source types, newest first. RLS-bound.
export type SourceFileRow = { id: string; name: string; uploadedAt: string; state: string; sizeBytes: number; isDuplicate: boolean };

export async function getSourceFiles(sourceTypes: string[], limit = 30): Promise<SourceFileRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_files")
    .select("id, original_filename, uploaded_at, pipeline_state, size_bytes, duplicate_of_file_id, sources!inner(source_type)")
    .in("sources.source_type", sourceTypes)
    .is("archived_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`source files read failed: ${error.code ?? error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.original_filename as string,
    uploadedAt: r.uploaded_at as string,
    state: r.pipeline_state as string,
    sizeBytes: r.size_bytes as number,
    isDuplicate: r.duplicate_of_file_id != null,
  }));
}

// Display text for canonical pipeline_state values (18D §5) — the UI shows the backend state, never infers it (21A §54).
export function pipelineStateLabel(state: string): string {
  if (state === "uploaded") return "נקלט — ממתין לעיבוד";
  if (state === "duplicate") return "כפילות — נשמר ומסומן";
  if (state === "failed") return "העיבוד נכשל";
  if (state === "needs_review" || state === "ready_for_review") return "דורש בדיקה";
  if (state === "rejected") return "נדחה";
  if (state === "ready") return "עובד";
  if (state === "extracted") return "נקרא — טרם אומת";
  if (state === "extraction_pending") return "בקריאה";
  if (state === "archived") return "בארכיון";
  return "בעיבוד";
}
