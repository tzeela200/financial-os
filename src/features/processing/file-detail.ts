import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Adapter } from "./adapter";
import { familyForSource } from "./families";
import { proposeHeaderRow, type TableShape } from "./extract";
import { hasTwoDigitYear } from "./normalize";

// Read models for the File screen (22B §68 Source Detail, §70 Document Viewer) and the Import Mapping screen (21D §12).
// RLS-bound reads only. Show what was read, the processing path, checks, and what still needs a decision.

export type FileRecord = { rowNumber: number; sheet: string; kind: string; cells: string[]; page: number | null };
export type FileSummary = { format?: string; rows?: number; dataRows?: number; promotedTransactions?: number; promotedDocuments?: number; reconciliationCandidates?: number; notPromoted?: number; notPromotedReasons?: Record<string, number>; checks?: { code: string; status: string; detail: string; rows: number[] }[]; tables?: TableShape[]; needsMapping?: boolean; reason?: string; detail?: string | null };
export type FileDetail = {
  id: string; name: string; uploadedAt: string; state: string; sourceType: string; isDuplicate: boolean;
  document: { id: string; state: string; version: string | null; summary: FileSummary | null } | null;
  runs: { at: string; from: string | null; to: string; reason: string | null }[];
  job: { status: string; attempts: number; error: string | null; availableAt: string | null } | null;
  records: FileRecord[]; recordsTruncated: boolean;
  headerLabels: Map<string, string[]>;
};

const MAX_ROWS = 1500;

export async function getFileDetail(fileId: string): Promise<FileDetail | null> {
  const supabase = await createClient();
  const { data: f } = await supabase.from("source_files").select("id, source_id, original_filename, uploaded_at, pipeline_state, duplicate_of_file_id, sources!inner(source_type)").eq("id", fileId).maybeSingle();
  if (!f) return null;
  const [{ data: doc }, { data: runs }, { data: job }] = await Promise.all([
    supabase.from("documents").select("id, pipeline_state, processing_version, metadata_json").eq("source_file_id", fileId).is("archived_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("processing_runs").select("created_at, from_state, to_state, reason").eq("entity_type", "source_file").eq("entity_id", fileId).order("created_at", { ascending: true }).limit(200),
    supabase.from("jobs").select("status, attempt_count, error_code, available_at").eq("scope_type", "source_file").eq("scope_id", fileId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  let records: FileRecord[] = [];
  let count = 0;
  if (doc) {
    const { data: recs, count: c } = await supabase.from("source_records").select("row_number, raw_json", { count: "exact" })
      .eq("source_id", f.source_id as string).eq("raw_json->>run", doc.processing_version as string).order("row_number").limit(MAX_ROWS);
    count = c ?? 0;
    records = ((recs ?? []) as { row_number: number; raw_json: { sheet?: string; kind?: string; cells?: string[]; page?: number | null } }[])
      .map((r) => ({ rowNumber: r.row_number, sheet: r.raw_json.sheet ?? "", kind: r.raw_json.kind ?? "data", cells: r.raw_json.cells ?? [], page: r.raw_json.page ?? null }));
  }
  const summary = ((doc?.metadata_json ?? {}) as { extraction?: FileSummary }).extraction ?? null;
  const headerLabels = new Map<string, string[]>();
  for (const r of records) if (r.kind === "header" && !headerLabels.has(r.sheet)) headerLabels.set(r.sheet, r.cells);
  return {
    id: f.id as string, name: f.original_filename as string, uploadedAt: f.uploaded_at as string, state: f.pipeline_state as string,
    sourceType: (f.sources as unknown as { source_type: string }).source_type, isDuplicate: f.duplicate_of_file_id != null,
    document: doc ? { id: doc.id as string, state: doc.pipeline_state as string, version: doc.processing_version as string | null, summary } : null,
    runs: ((runs ?? []) as { created_at: string; from_state: string | null; to_state: string; reason: string | null }[]).map((r) => ({ at: r.created_at, from: r.from_state, to: r.to_state, reason: r.reason })),
    job: job ? { status: job.status as string, attempts: job.attempt_count as number, error: (job.error_code as string | null) ?? null, availableAt: (job.available_at as string | null) ?? null } : null,
    records, recordsTruncated: count > MAX_ROWS, headerLabels,
  };
}

export type MappingColumn = { index: number; header: string; samples: string[]; distinct: string[]; suggested: string | null; suggestedFrom: string | null; twoDigitYear: boolean };
export type MappingContext = {
  fileId: string; fileName: string; sourceType: string; familyLabel: string; expected: string[]; side: string | null;
  sheet: string; headerRow: number; rowsTotal: number; columns: MappingColumn[]; hasCurrencyColumnHint: boolean;
};

/** What the mapping screen needs: the proposed header row, sample values and distinct values per column, and
 *  suggestions ONLY from Tzeela's own previously approved adapters for this source (exact same header text). */
export async function getMappingContext(fileId: string, headerRowOverride?: number): Promise<MappingContext | null> {
  const d = await getFileDetail(fileId);
  if (!d || !d.document) return null;
  const family = familyForSource(d.sourceType);
  if (!family) return null;
  const sheets = [...new Set(d.records.map((r) => r.sheet))];
  const table = d.document.summary?.tables?.find((t) => !t.adapterId) ?? null;
  const sheet = table?.sheet ?? sheets[0] ?? "";
  const rows = d.records.filter((r) => r.sheet === sheet).sort((a, b) => a.rowNumber - b.rowNumber);
  const grid: string[][] = [];
  for (const r of rows) grid[r.rowNumber - 1] = r.cells;
  const dense = Array.from({ length: grid.length }, (_, i) => grid[i] ?? []);
  const headerRow = headerRowOverride ?? table?.headerRow ?? proposeHeaderRow(dense) ?? 1;
  const headers = dense[headerRow - 1] ?? [];
  const body = dense.slice(headerRow).filter((r) => r.filter((c) => c.trim()).length >= 2);

  const supabase = await createClient();
  const { data: adapters } = await supabase.from("rule_versions").select("logic_json, created_at").eq("domain", "source_adapter").order("created_at", { ascending: false });
  const own = ((adapters ?? []) as { logic_json: Adapter }[]).map((a) => a.logic_json).filter((a) => a.sourceType === d.sourceType);
  const columns: MappingColumn[] = headers.map((h, index) => {
    const values = body.map((r) => (r[index] ?? "").trim()).filter(Boolean);
    const prev = own.flatMap((a) => a.columns).find((c) => c.header.trim() === h.trim() && c.concept);
    return { index, header: h, samples: values.slice(0, 3), distinct: [...new Set(values)].slice(0, 40), suggested: prev?.concept ?? null, suggestedFrom: prev ? "מיפוי שאישרת בעבר" : null, twoDigitYear: values.slice(0, 20).some(hasTwoDigitYear) };
  }).filter((c) => c.header.trim() || c.samples.length);
  return {
    fileId: d.id, fileName: d.name, sourceType: d.sourceType, familyLabel: family.label, expected: family.expected,
    side: d.sourceType === "business_income_export" ? "income" : d.sourceType === "business_expense_export" ? "expense" : null,
    sheet, headerRow, rowsTotal: body.length, columns, hasCurrencyColumnHint: false,
  };
}
