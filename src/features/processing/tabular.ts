// Deterministic reading of delimited text files (chapter 5 §21; 18B §5.4: "CSV: parser דטרמיניסטי; שמירת
// delimiter/encoding/header"). Cells are kept as the raw strings of the file. XLSX / HTML-"XLS" / legacy XLS are read
// through the approved SheetJS dependency (Stage 3 decision D1) — not by an in-house parser; until it is installed they
// are reported as an explicit extraction error, never as "no data" (§21).

export type Sheet = { name: string; rows: string[][] };
export type ReadMeta = { format: "csv"; encoding: string; delimiter: string };
export type ReadResult =
  | { ok: true; meta: ReadMeta; sheets: Sheet[] }
  | { ok: false; reason: "spreadsheet_reader_pending" | "unsupported_format" | "empty" };

export function readTabular(bytes: Uint8Array, filename: string): ReadResult {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isBiff = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (isZip || isBiff || ["xlsx", "xlsm", "xls"].includes(ext)) return { ok: false, reason: "spreadsheet_reader_pending" };
  const { text, encoding } = decodeText(bytes);
  if (!["csv", "tsv", "txt"].includes(ext) && !looksDelimited(text)) return { ok: false, reason: "unsupported_format" };
  const delimiter = detectDelimiter(text);
  return { ok: true, meta: { format: "csv", encoding, delimiter }, sheets: [{ name: "", rows: parseDelimited(text, delimiter) }] };
}

/** UTF-16 when the file starts with a UTF-16 BOM; UTF-8 when the bytes are valid UTF-8 (BOM stripped); otherwise Windows-1255, the legacy Hebrew encoding of Israeli exports. */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ""), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1255").decode(bytes), encoding: "windows-1255" };
  }
}

function looksDelimited(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5);
  return lines.length > 0 && lines.every((l) => /[,;\t|]/.test(l));
}

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ",", bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = sample.map((l) => (parseDelimited(l, d)[0] ?? []).length);
    const rows = counts.filter((c) => c > 1).length;
    const score = rows * 10 + Math.max(0, ...counts);
    if (rows > 0 && score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

/** RFC 4180 parsing with quoted fields, escaped quotes and embedded newlines. Empty lines are skipped; cells trimmed. */
export function parseDelimited(text: string, delimiter = ","): string[][] {
  const d = delimiter;
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const endRow = () => {
    row.push(field); field = "";
    if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"' && field.trim() === "") { quoted = true; field = ""; }
    else if (ch === d) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; endRow(); }
    else field += ch;
  }
  endRow();
  return rows;
}
