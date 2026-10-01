// Rebuilds the reading order of one PDF text line (chapter 5 §21–§22: use the original text layer, keep page/location).
// Hebrew PDFs often store each glyph as its own text item in visual order. Read right to left, Hebrew letters come out
// in logical order, but runs of Latin letters and digits (dates, amounts, English names) come out reversed. Those runs
// are restored; multi-character items are already logical and are kept as they are. Nothing else is changed.

export type PdfItem = { str: string; x: number; width: number; fontSize: number };

const LTR_RUN = /[A-Za-z0-9](?:[A-Za-z0-9 .,:/\-*%+#&_'@]*[A-Za-z0-9])?/g;

/** Reverses every left-to-right run inside text that was assembled glyph by glyph from right to left. */
export function restoreLtrRuns(text: string): string {
  return text.replace(LTR_RUN, (run) => [...run].reverse().join(""));
}

/** Items of one line → cells. Gaps decide: tight = same word, small = space, wide = new cell. */
export function buildLineCells(items: PdfItem[]): string[] {
  const line = [...items].filter((i) => i.str.trim() !== "").sort((a, b) => b.x - a.x);
  const cells: string[] = [];
  let parts: string[] = [];
  let glyphs = "";
  let prevLeft: number | null = null;
  const flushGlyphs = () => { if (glyphs) { parts.push(restoreLtrRuns(glyphs)); glyphs = ""; } };
  const flushCell = () => { flushGlyphs(); const c = parts.join("").replace(/\s+/g, " ").trim(); if (c) cells.push(c); parts = []; };

  for (const it of line) {
    const right = it.x + it.width;
    const gap = prevLeft === null ? 0 : prevLeft - right;
    const size = it.fontSize || 10;
    if (prevLeft !== null && gap > Math.max(6, size * 1.2)) flushCell();
    else if (prevLeft !== null && gap > size * 0.22) { if (glyphs) glyphs += " "; else parts.push(" "); }
    if ([...it.str].length === 1) glyphs += it.str;
    else { flushGlyphs(); parts.push(it.str); }
    prevLeft = it.x;
  }
  flushCell();
  return cells;
}
