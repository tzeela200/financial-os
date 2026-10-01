import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Question } from "./semantic";
import { familyForSource } from "./families";
import type { PdfFact } from "./pdf-tables";

// Read models for the File screen (22B §68 Source Detail, §70 Document Viewer) and the Import Mapping screen (21D §12).
// RLS-bound reads only. Show what was read, the processing path, checks, and what still needs a decision.

export type FileRecord = { rowNumber: number; sheet: string; kind: string; cells: string[]; page: number | null };
export type EntityRow = { row: number; page: number | null; values: Record<string, string> };
export type StatementSummary = { issuer: string; cardLast4: string | null; statementDate: string | null; asOf: string | null; creditLimit: { minor: string; currency: string } | null; nextChargeDate: string | null; limitValidUntil: string | null; transactions: number; totals: { chargeDate: string; total: { minor: string; currency: string } }[] };
export type FileSummary = { statement?: StatementSummary | null; format?: string; rows?: number; dataRows?: number; promotedTransactions?: number; promotedDocuments?: number; reconciliationCandidates?: number; notPromoted?: number; notPromotedReasons?: Record<string, number>; checks?: { code: string; status: string; detail: string; rows: number[] }[]; needsMapping?: boolean; understanding?: { tables: UnderstoodTable[]; facts: PdfFact[]; factsAsOf: string | null; bankBalance: { minor: string; currency: string; asOf: string; line: number; label: string; value: string } | null }; reason?: string; detail?: string | null };
export type FileDetail = {
  id: string; name: string; uploadedAt: string; state: string; sourceType: string; isDuplicate: boolean;
  document: { id: string; state: string; version: string | null; summary: FileSummary | null } | null;
  runs: { at: string; from: string | null; to: string; reason: string | null }[];
  job: { status: string; attempts: number; error: string | null; availableAt: string | null } | null;
  records: FileRecord[]; recordsTruncated: boolean;
  headerLabels: Map<string, string[]>;
  entities: EntityRow[]; entityConcepts: string[];
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
  // what was understood: mapped observations of the data rows, one row per source record (chapter 5 §22)
  let entities: EntityRow[] = [];
  const conceptsSeen = new Set<string>();
  if (doc) {
    const { data: obs } = await supabase.from("observations").select("source_record_id, concept_code, value_original, locator_json")
      .eq("document_id", doc.id as string).eq("unmapped", false).limit(8000);
    const byRec = new Map<string, EntityRow>();
    for (const o of (obs ?? []) as { source_record_id: string | null; concept_code: string; value_original: string | null; locator_json: { row?: number; page?: number | null } | null }[]) {
      if (!o.source_record_id || o.concept_code === "document_text" || o.concept_code === "needs_mapping") continue;
      const e = byRec.get(o.source_record_id) ?? { row: o.locator_json?.row ?? 0, page: o.locator_json?.page ?? null, values: {} };
      e.values[o.concept_code] = o.value_original ?? "";
      conceptsSeen.add(o.concept_code);
      byRec.set(o.source_record_id, e);
    }
    entities = [...byRec.values()].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.row - b.row);
  }
  const headerLabels = new Map<string, string[]>();
  for (const r of records) if (r.kind === "header" && !headerLabels.has(r.sheet)) headerLabels.set(r.sheet, r.cells);
  return {
    id: f.id as string, name: f.original_filename as string, uploadedAt: f.uploaded_at as string, state: f.pipeline_state as string,
    sourceType: (f.sources as unknown as { source_type: string }).source_type, isDuplicate: f.duplicate_of_file_id != null,
    document: doc ? { id: doc.id as string, state: doc.pipeline_state as string, version: doc.processing_version as string | null, summary } : null,
    runs: ((runs ?? []) as { created_at: string; from_state: string | null; to_state: string; reason: string | null }[]).map((r) => ({ at: r.created_at, from: r.from_state, to: r.to_state, reason: r.reason })),
    job: job ? { status: job.status as string, attempts: job.attempt_count as number, error: (job.error_code as string | null) ?? null, availableAt: (job.available_at as string | null) ?? null } : null,
    records, recordsTruncated: count > MAX_ROWS, headerLabels,
    entities, entityConcepts: [...conceptsSeen],
  };
}

export type UnderstoodColumn = { index: number; header: string; concept: string | null; score: number; basis: string; alternatives?: { concept: string; score: number }[]; sample?: string[] };
export type UnderstoodTable = { sheet: string; headerRow: number | null; via: "document_adapter" | "approved_mapping" | "semantic" | "unresolved"; dataRows: number; adapterId: string | null; decisions: UnderstoodColumn[]; questions: Question[]; assumptions: string[] };
export type MappingContext = {
  fileId: string; fileName: string; sourceType: string; familyLabel: string; expected: string[];
  /** processed before the understanding engine existed — must be read again before questions can be shown */
  legacy: boolean;
  table: UnderstoodTable | null; openTables: number;
};

/** What the mapping screen needs: ONLY the open questions of the first table the engine could not fully understand,
 *  with the automatic decisions shown read-only beside them (chapter 5 §21; 21D §12). */
export async function getMappingContext(fileId: string): Promise<MappingContext | null> {
  const d = await getFileDetail(fileId);
  if (!d || !d.document) return null;
  const family = familyForSource(d.sourceType);
  if (!family) return null;
  const tables = d.document.summary?.understanding?.tables ?? null;
  const open = (tables ?? []).filter((t) => t.via === "unresolved");
  return {
    fileId: d.id, fileName: d.name, sourceType: d.sourceType, familyLabel: family.label, expected: family.expected,
    legacy: tables === null, table: open[0] ?? null, openTables: open.length,
  };
}
