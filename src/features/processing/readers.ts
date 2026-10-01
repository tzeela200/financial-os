import "server-only";
import * as XLSX from "xlsx";
import * as cptable from "xlsx/dist/cpexcel.full.mjs";
import { extractTextItems } from "unpdf";
import { readTabular, decodeText } from "./tabular";
import { buildLineCells } from "./pdf-lines";
import type { RowLocator, CellMeta, ReadSheet, SourceRead } from "./readers-types";

// File readers by format (chapter 5 §21; 18B §5.4). One output shape for every format: sheets of rows of raw strings,
// plus provenance per row (sheet / page) and per cell (type, formula). Nothing is interpreted here.
//  - CSV/TSV: deterministic parser (tabular.ts), delimiter + encoding kept.
//  - Excel (XLSX / XLS / HTML-"XLS"): SheetJS CE 0.20.3 (decision D1) — sheets, cells, types, formulas, headers.
//  - Digital PDF: unpdf text layer with positions (decision D2) — lines rebuilt from item coordinates, page kept.
//  - Scanned PDF / image: no text layer → reported as needing visual reading (Vision/OCR provider, separate path).

export type { RowLocator, CellMeta, ReadSheet, SourceRead } from "./readers-types";

// legacy .xls files store text in a code page (Hebrew: Windows-1255); SheetJS needs the code-page tables to decode it
XLSX.set_cptable(cptable);

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "heic", "tif", "tiff"]);

export async function readSource(bytes: Uint8Array, filename: string): Promise<SourceRead> {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.has(ext)) return { ok: false, reason: "visual_reading_required", detail: "image" };
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  if (isPdf || ext === "pdf") return readPdf(bytes);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isBiff = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  const head = isZip || isBiff ? "" : decodeText(bytes.subarray(0, 4096)).text.trimStart().toLowerCase();
  const isHtmlTable = head.startsWith("<") && /<table|<html/.test(head);
  if (isHtmlTable) return readExcel(bytes, decodeText(bytes).text); // "XLS" that is an HTML table: decode its text first (UTF-8 or Windows-1255)
  if (isZip || isBiff || ["xlsx", "xlsm", "xls", "xlsb", "ods"].includes(ext)) return readExcel(bytes);
  const t = readTabular(bytes, filename);
  if (!t.ok) return { ok: false, reason: t.reason === "empty" ? "empty" : "unsupported_format" };
  return { ok: true, format: "csv", meta: t.meta, sheets: t.sheets };
}

function readExcel(bytes: Uint8Array, htmlText?: string): SourceRead {
  let wb: XLSX.WorkBook;
  try {
    wb = htmlText !== undefined
      ? XLSX.read(htmlText, { type: "string", cellFormula: true, cellNF: true, cellText: true, cellDates: false })
      : XLSX.read(bytes, { type: "array", cellFormula: true, cellNF: true, cellText: true, cellDates: false });
  } catch (e) {
    return { ok: false, reason: "corrupt", detail: (e as Error).message.slice(0, 200) };
  }
  const sheets: ReadSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) { sheets.push({ name, rows: [], cellMeta: [] }); continue; }
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const rows: string[][] = [];
    const cellMeta: (CellMeta | null)[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: string[] = [];
      const meta: (CellMeta | null)[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
        if (!cell || cell.v === undefined || cell.v === null) { row.push(""); meta.push(null); continue; }
        row.push(cellText(cell));
        meta.push({ type: cell.t, ...(cell.f ? { formula: cell.f } : {}) });
      }
      if (row.some((v) => v.trim() !== "")) { rows.push(row.map((v) => v.trim())); cellMeta.push(meta); }
    }
    sheets.push({ name, rows, cellMeta });
  }
  return { ok: true, format: "excel", meta: { sheets: wb.SheetNames.length, bookType: (wb as { bookType?: string }).bookType ?? null }, sheets };
}

/** Cell → raw text. Dates (number with a date format) become ISO dates; other values keep the text Excel displays,
 *  which is what the person saw in the source (chapter 5 §22 "הטקסט או הערך המקורי"). */
function cellText(cell: XLSX.CellObject): string {
  if (cell.t === "d" && cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (cell.t === "n" && typeof cell.v === "number" && cell.z && XLSX.SSF.is_date(String(cell.z))) {
    const d = XLSX.SSF.parse_date_code(cell.v);
    if (d) return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (cell.t === "n" && typeof cell.v === "number") return Number.isInteger(cell.v) ? String(cell.v) : (cell.w ?? String(cell.v));
  if (cell.t === "b") return cell.v ? "TRUE" : "FALSE";
  return String(cell.w ?? cell.v ?? "");
}

async function readPdf(bytes: Uint8Array): Promise<SourceRead> {
  let pages: { str: string; x: number; y: number; width: number; height: number; fontSize: number }[][];
  try {
    const out = await extractTextItems(new Uint8Array(bytes));
    pages = out.items;
  } catch (e) {
    return { ok: false, reason: "corrupt", detail: (e as Error).message.slice(0, 200) };
  }
  const chars = pages.reduce((n, p) => n + p.reduce((m, i) => m + i.str.trim().length, 0), 0);
  if (chars < 20 * Math.max(1, pages.length)) return { ok: false, reason: "visual_reading_required", detail: "pdf_without_text_layer" };

  const rows: string[][] = [];
  const locators: RowLocator[] = [];
  const positions: { str: string; x: number; width: number; fontSize: number }[][] = [];
  pages.forEach((items, p) => {
    const lines = new Map<number, typeof items>();
    for (const it of items) {
      if (it.str === "") continue;
      const tol = Math.max(1.5, it.fontSize * 0.3);
      let key = [...lines.keys()].find((k) => Math.abs(k - it.y) <= tol);
      if (key === undefined) { key = it.y; lines.set(key, []); }
      lines.get(key)!.push(it);
    }
    // top to bottom; each line rebuilt in reading order (pdf-lines.ts), cells split on visible gaps
    for (const y of [...lines.keys()].sort((a, b) => b - a)) {
      const cells = buildLineCells(lines.get(y)!);
      if (cells.length) {
        rows.push(cells); locators.push({ page: p + 1, y: Math.round(y) });
        positions.push(lines.get(y)!.map((i) => ({ str: i.str, x: i.x, width: i.width, fontSize: i.fontSize })));
      }
    }
  });
  return { ok: true, format: "pdf", meta: { pages: pages.length }, sheets: [{ name: "", rows, locators, positions }] };
}
