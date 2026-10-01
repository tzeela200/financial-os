import { headerSignature, type Adapter } from "./adapter";
import { parseAmount, parseDate } from "./normalize";
import type { ReadSheet, RowLocator, CellMeta } from "./readers-types";

// Extraction (chapter 5 §4–§5, §21–§22; 18B §5): reads the WHOLE file. Every non-empty row becomes a record; every
// non-empty cell of a table row becomes an observation with its locator (sheet / page / row / column / header).
// Column meaning comes only from an approved Source Adapter whose header signature matches (D5). Without one, every
// column is needs_mapping — no guessing. Extraction does not normalize, calculate or interpret signs.

export const EXTRACTOR_VERSION = "structured-extract-v4";

export type RecordKind = "metadata" | "header" | "data" | "note";
export type ExtractedObservation = { col: number; header: string; concept: string | null; original: string; cell?: CellMeta | null };
export type ExtractedRecord = { sheet: string; rowNumber: number; kind: RecordKind; cells: string[]; locator: RowLocator | null; observations: ExtractedObservation[] };
export type TableShape = { sheet: string; headerRow: number | null; headers: string[]; signature: string | null; adapterId: string | null };
export type Extraction = { tables: TableShape[]; records: ExtractedRecord[]; adapterId: string | null; needsMapping: boolean };

/** Proposed header row: the first row (within 40) with ≥2 non-empty cells that are all labels (not dates or amounts)
 *  and is followed by a row with ≥2 non-empty cells. A proposal only — confirmed by Tzeela in the mapping screen. */
export function proposeHeaderRow(rows: string[][]): number | null {
  for (let r = 0; r < Math.min(rows.length - 1, 40); r++) {
    const cells = rows[r].filter((c) => c.trim() !== "");
    if (cells.length < 2) continue;
    const allLabels = cells.every((c) => parseDate(c, "dmy_two_digit_year_20") === null && parseAmount(c) === null);
    const next = rows[r + 1].filter((c) => c.trim() !== "");
    if (allLabels && next.length >= 2) return r + 1;
  }
  return null;
}

export function extractStructured(sheets: ReadSheet[], adapters: Adapter[]): Extraction {
  const tables: TableShape[] = [];
  const records: ExtractedRecord[] = [];
  let adapterId: string | null = null;
  let needsMapping = false;

  for (const sheet of sheets) {
    if (sheet.rows.length === 0) continue;
    // an approved adapter wins when its header row carries the same signature (structural hint, chapter 5 §20)
    let adapter: Adapter | null = null;
    for (const a of adapters) {
      const row = sheet.rows[a.headerRow - 1];
      if (row && headerSignature(row) === a.signature) { adapter = a; break; }
    }
    const headerRow = adapter ? adapter.headerRow : proposeHeaderRow(sheet.rows);
    const headers = headerRow ? sheet.rows[headerRow - 1] : [];
    const signature = headerRow ? headerSignature(headers) : null;
    tables.push({ sheet: sheet.name, headerRow, headers, signature, adapterId: adapter?.id ?? null });
    if (adapter) adapterId = adapterId ?? adapter.id;
    else needsMapping = true;

    sheet.rows.forEach((cells, i) => {
      const rowNumber = i + 1;
      let kind: RecordKind;
      if (headerRow === null || rowNumber < headerRow) kind = "metadata";
      else if (rowNumber === headerRow || (signature && headerSignature(cells) === signature)) kind = "header"; // repeated page headers
      else kind = cells.slice(0, Math.max(headers.length, 1)).filter((c) => c.trim() !== "").length >= 2 ? "data" : "note";

      const observations: ExtractedObservation[] = [];
      if (kind !== "header") {
        cells.forEach((original, col) => {
          if (!original) return;
          const concept = kind === "data" && adapter ? adapter.columns.find((c) => c.index === col)?.concept ?? null : null;
          observations.push({ col, header: kind === "data" ? headers[col] ?? "" : "", concept, original, cell: sheet.cellMeta?.[i]?.[col] ?? null });
        });
      }
      records.push({ sheet: sheet.name, rowNumber, kind, cells, locator: sheet.locators?.[i] ?? null, observations });
    });
  }
  return { tables, records, adapterId, needsMapping };
}

/** Distinct raw values of a column in the data rows (for value mapping in the mapping screen). */
export function distinctValues(records: ExtractedRecord[], sheet: string, col: number, limit = 40): string[] {
  const seen = new Set<string>();
  for (const r of records) {
    if (r.kind !== "data" || r.sheet !== sheet) continue;
    const v = (r.cells[col] ?? "").trim();
    if (v) seen.add(v);
    if (seen.size >= limit) break;
  }
  return [...seen];
}
