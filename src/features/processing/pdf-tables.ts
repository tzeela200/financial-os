import { buildLineCells, type PdfItem } from "./pdf-lines";
import { headerCandidates } from "./semantic";
import { conceptByCode } from "./concepts";
import { parseAmount, parseDate } from "./normalize";
import type { ReadSheet } from "./readers-types";

// Layout / table understanding for digital PDFs (chapter 5 §21: "שימוש בטקסט ובטבלאות המקוריים ככל שניתן; שמירת עמוד
// ומיקום"). Generic, not per issuer: a table header is a line whose cells read as ≥3 chapter 5 concepts including a date
// and an amount. Columns come from the header cells' positions (Hebrew tables are right-aligned); every following line
// with a date in the date column is a row, lines in between are continuation notes, a total line or a new header ends
// the table. The result is a virtual table sheet that goes through the same semantic engine as CSV / Excel.

export type PdfTable = { sheet: ReadSheet; startLine: number; header: string[] };
export type PdfFact = { line: number; page: number | null; label: string; value: string; minor: string; currency: string | null; /** a date stated on the same line ("נכון ל - 28/09/2026") */ asOf?: string | null };

const isDateCell = (s: string) => /^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(s.trim());
const firstDate = (s: string) => /\d{1,2}[./]\d{1,2}[./]\d{2,4}/.exec(s)?.[0] ?? null;

/** The statement period stated in the document ("לתקופה מ- 20/01/26 ועד 30/01/26", "התקופה שבין 01/01/26 - 30/01/26"):
 *  the widest range found. It is what makes a day-month date ("01.01") complete — never a guess of the year. */
function statedPeriod(sheet: ReadSheet): { start: string; end: string } | null {
  let start: string | null = null, end: string | null = null;
  const re = /(\d{1,2}[./]\d{1,2}[./]\d{2,4})\s*(?:-|–|עד|ועד)\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/g;
  const iso = (t: string) => parseDate(t)?.iso ?? parseDate(t, "dmy_two_digit_year_20")?.iso ?? null;
  for (const row of sheet.rows) {
    for (const m of row.join(" ").matchAll(re)) {
      const a = iso(m[1]), b = iso(m[2]);
      if (!a || !b || b < a) continue;
      if (!start || a < start) start = a;
      if (!end || b > end) end = b;
    }
  }
  return start && end ? { start, end } : null;
}
const DM = /^(\d{1,2})\.(\d{1,2})$/;
const GLUED_DM = /^(\d{1,2}\.\d{1,2})(\d{1,2}\.\d{1,2})$/;
/** "01.01" → "01/01/2026" using the stated period (the year whose date falls within the period ± 35 days); else null. */
function resolveDayMonth(tok: string, period: { start: string; end: string } | null): string | null {
  const m = DM.exec(tok.trim());
  if (!m || !period) return null;
  const dd = m[1].padStart(2, "0"), mm = m[2].padStart(2, "0");
  const lo = new Date(Date.parse(period.start) - 35 * 86400000).toISOString().slice(0, 10);
  const hi = new Date(Date.parse(period.end) + 35 * 86400000).toISOString().slice(0, 10);
  for (const y of new Set([period.start.slice(0, 4), period.end.slice(0, 4)])) {
    const iso = `${y}-${mm}-${dd}`;
    if (iso >= lo && iso <= hi && !Number.isNaN(Date.parse(iso))) return `${dd}/${mm}/${y}`;
  }
  return null;
}
const toIso = (dmy: string) => { const [d, m, y] = dmy.split("/"); return `${y}-${m}-${d}`; };

function headerScore(cells: string[]) {
  const concepts = cells.map((c) => headerCandidates(c)[0]).filter((c) => c && c.score >= 0.6).map((c) => c!.concept);
  const types = new Set(concepts.map((c) => conceptByCode(c)?.dataType));
  return { n: new Set(concepts).size, ok: new Set(concepts).size >= 3 && types.has("date") && types.has("money") };
}

/** Column right edges from the header line items (cell-level clusters). */
function columnsFrom(items: PdfItem[]): { right: number; left: number; label: string }[] {
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => b.x - a.x);
  const cols: { right: number; left: number; items: PdfItem[] }[] = [];
  let prevLeft: number | null = null;
  for (const it of sorted) {
    const gap = prevLeft === null ? Infinity : prevLeft - (it.x + it.width);
    // distinct header cells sit ~1× font apart, a word gap inside one header is ~0.3× — 0.6× separates them
    if (gap > Math.max(6, (it.fontSize || 10) * 0.6)) cols.push({ right: it.x + it.width, left: it.x, items: [it] });
    else { const c = cols[cols.length - 1]; c.items.push(it); c.left = Math.min(c.left, it.x); }
    prevLeft = it.x;
  }
  return cols.map((c) => ({ right: c.right, left: c.left, label: buildLineCells(c.items).join(" ") }));
}

/** Items -> columns by the space between headers: column i owns everything between the midpoints to its neighbours
 *  (Hebrew tables mix right-aligned text with left-aligned numbers, so a single edge is not enough). */
function split(items: PdfItem[], cols: { right: number; left: number }[]): string[] {
  const bounds = cols.map((c, i) => {
    const rightNeighbour = cols[i - 1], leftNeighbour = cols[i + 1];
    return { hi: rightNeighbour ? (c.right + rightNeighbour.left) / 2 : Infinity, lo: leftNeighbour ? (leftNeighbour.right + c.left) / 2 : c.left - 40 };
  });
  const buckets: PdfItem[][] = cols.map(() => []);
  for (const it of items) {
    if (!it.str.trim()) continue;
    const mid = it.x + it.width / 2;
    const i = bounds.findIndex((bd) => mid <= bd.hi && mid > bd.lo);
    if (i >= 0) buckets[i].push(it);
  }
  return buckets.map((bk) => buildLineCells(bk).join(" ").trim());
}

export function pdfTables(sheet: ReadSheet): PdfTable[] {
  if (!sheet.positions) return [];
  const tables: PdfTable[] = [];
  const period = statedPeriod(sheet);
  let i = 0;
  while (i < sheet.rows.length) {
    if (!headerScore(sheet.rows[i]).ok) { i++; continue; }
    let cols = columnsFrom(sheet.positions[i]);
    if (cols.length < 3) { i++; continue; }
    const header = cols.map((c) => c.label);
    const dateCol = header.findIndex((h) => conceptByCode(headerCandidates(h)[0]?.concept ?? "")?.dataType === "date");
    // a continuation fills an empty cell only when it fits the column's type (a date column takes a date, an amount column
    // an amount); anything else — e.g. a printed page footer — becomes a note, never a value
    const colType = header.map((h) => conceptByCode(headerCandidates(h)[0]?.concept ?? "")?.dataType ?? "text");
    const fits = (k: number, c: string) => colType[k] === "date" ? !!firstDate(c) : colType[k] === "money" ? !!parseAmount(c.replace(/[₪$€]/g, "").trim())?.ok : true;
    const colConcept = header.map((h) => headerCandidates(h)[0]?.concept ?? null);
    const amountCols = colConcept.map((c, k) => (colType[k] === "money" && c !== "balance" ? k : -1)).filter((k) => k >= 0);
    const valueDates: (string | null)[] = [null]; // per row: from a glued "date + value date" cell or a value date alone
    const assumptions = new Set<string>();
    const rows: string[][] = [header];
    const locators = [sheet.locators?.[i] ?? {}];
    // vertically centred rows: a wrapped cell may start on the line ABOVE its row's date line and end on the line below.
    // A line without a date belongs to the dated line nearest to it on the page (by y); without positions, to the row above.
    // a date cell that also caught one neighbouring token (a long number printed close to the date) gives it back to
    // the empty neighbouring column; returns whether the line is a dated row
    const fixDate = (c: string[], out?: { value: string | null }) => {
      if (dateCol < 0) return false;
      const raw = (c[dateCol] ?? "").trim();
      // day-month dates are completed from the stated period; a glued cell is "transaction date + value date" (in that order)
      const glued = GLUED_DM.exec(raw);
      if (glued && period) {
        const d1 = resolveDayMonth(glued[1], period), d2 = resolveDayMonth(glued[2], period);
        if (d1 && d2) {
          c[dateCol] = d1; if (out) out.value = d2;
          assumptions.add(`year from the stated period ${period.start} – ${period.end}`); assumptions.add("a cell with two dates = transaction date + value date");
          return true;
        }
      }
      const dm = resolveDayMonth(raw, period);
      if (dm) {
        const lastDate = rows.length > 1 ? rows[rows.length - 1][dateCol] : null;
        const ascending = rows.slice(2).every((r, k) => toIso(r[dateCol]) >= toIso(rows[k + 1][dateCol]));
        // in an ascending statement a date earlier than the day's date is that line's value date; the day carries on
        if (lastDate && ascending && toIso(dm) < toIso(lastDate)) {
          c[dateCol] = lastDate; if (out) out.value = dm;
          assumptions.add("a date earlier than the day's date in an ascending statement = value date");
          return true;
        }
        c[dateCol] = dm; assumptions.add(`year from the stated period ${period!.start} – ${period!.end}`);
        return true;
      }
      const cell = raw, d = firstDate(cell);
      if (!d) return false;
      if (isDateCell(cell)) return true;
      const rest = cell.replace(d, "").trim();
      const nb = [dateCol - 1, dateCol + 1].find((k) => k >= 0 && k < c.length && !c[k]);
      if (rest && !/\s/.test(rest) && nb !== undefined) { c[nb] = rest; c[dateCol] = d; return true; }
      if (cell.length <= 12) { c[dateCol] = d; return true; }
      return false;
    };
    const dated = (k: number) => fixDate(split(sheet.positions![k], cols));
    const yOf = (k: number) => sheet.locators?.[k]?.y;
    const pageOf = (k: number) => sheet.locators?.[k]?.page;
    const joinParts = (a: string, b: string) => (/^\d+$/.test(a) && /^\d+$/.test(b) ? `${a}${b}` : `${a} ${b}`);
    let pending: string[] | null = null; // pre-lines of the next row
    let wrapped = new Set<number>(); // columns of the last row that started on a pre-line (their tail follows below)
    let lastRowLine = -1;
    let j = i + 1;
    for (; j < sheet.rows.length; j++) {
      const text = sheet.rows[j].join(" ");
      if (/^(סה"?כ|סה״כ|total)/i.test(text.trim())) break;
      if (/(עמוד|page)\s*\d+\s*(מתוך|of|\/)\s*\d+/i.test(text)) continue; // page furniture — kept in the raw lines only
      // a stated balance line ("יתרה קודמת / יתרה נוכחית / יתרת פתיחה … נכון ל-") is a document fact (pdfFacts), never
      // part of a transaction row (chapter 5 §6 "יתרת פתיחה ויתרת סגירה")
      if (/^(יתרה|יתרת)\s*(קודמת|נוכחית|פתיחה|סגירה|לסוף|בתחילת)/.test(text.trim())) continue;
      if (headerScore(sheet.rows[j]).ok) { // a repeated identical header (next page / next block) continues the same table
        // same labels on a new page: the columns are re-measured there (each page has its own x positions)
        const again = columnsFrom(sheet.positions[j]);
        if (again.map((c) => c.label).join("|") === header.join("|")) { cols = again; pending = null; continue; }
        break;
      }
      const cells = split(sheet.positions[j], cols);
      const out = { value: null as string | null };
      if (fixDate(cells, out)) {
        wrapped = new Set();
        if (pending) pending.forEach((pre, k) => { if (!pre) return; cells[k] = cells[k] ? joinParts(pre, cells[k]) : pre; wrapped.add(k); });
        pending = null;
        rows.push([...cells, ""]); valueDates.push(out.value); locators.push(sheet.locators?.[j] ?? {}); lastRowLine = j;
        continue;
      }
      if (!cells.some(Boolean)) continue;
      // the date is printed once per day: a line with its own amount and its own text is another movement of that day
      // (a wrapped cell never repeats an amount the row above already has)
      const last0 = rows.length > 1 ? rows[rows.length - 1] : null;
      const ownAmount = amountCols.some((k) => !!cells[k] && fits(k, cells[k]) && !!last0 && !!last0[k]);
      const ownText = cells.some((c, k) => !!c && colType[k] === "text");
      if (last0 && dateCol >= 0 && ownAmount && ownText && !cells[dateCol]) {
        cells[dateCol] = last0[dateCol];
        assumptions.add("the date is printed once per day — following movements carry it");
        rows.push([...cells, ""]); valueDates.push(null); locators.push(sheet.locators?.[j] ?? {}); lastRowLine = j; wrapped = new Set();
        continue;
      }
      // nearer to the next dated line than to the previous one → a pre-line of the next row
      let next = -1;
      for (let k = j + 1; k < Math.min(sheet.rows.length, j + 4); k++) if (dated(k)) { next = k; break; }
      const y = yOf(j), yPrev = lastRowLine >= 0 ? yOf(lastRowLine) : undefined, yNext = next >= 0 ? yOf(next) : undefined;
      // a wrapped cell sits within about one line-height of its dated line; a section heading or a stated balance further
      // away is never glued onto the next row
      const size = Math.max(...sheet.positions[j].map((it) => it.fontSize || 10));
      const toNext = next >= 0 && y !== undefined && yNext !== undefined && pageOf(next) === pageOf(j)
        && Math.abs(yNext - y) <= Math.max(10, size * 1.2)
        && (yPrev === undefined || pageOf(lastRowLine) !== pageOf(j) || Math.abs(yNext - y) < Math.abs(y - yPrev));
      if (toNext) { pending = pending ? pending.map((p0, k) => [p0, cells[k]].filter(Boolean).join(" ")) : cells; continue; }
      if (rows.length > 1) {
        // the row above: a wrapped cell completes its own column, anything else is a continuation note
        const last = rows[rows.length - 1];
        const extra: string[] = [];
        cells.forEach((c, k) => {
          if (!c) return;
          if (!last[k] && fits(k, c)) last[k] = c;
          // a wrapped text cell ("חשבונית מס /") continues on the next line; an amount ("583.65-") or a date never does
          else if (colType[k] === "text" && (wrapped.has(k) || /[/\-]$/.test(last[k].trim()))) last[k] = joinParts(last[k].trim(), c);
          else if (colType[k] !== "text" && wrapped.has(k) && fits(k, joinParts(last[k].trim(), c))) last[k] = joinParts(last[k].trim(), c);
          else extra.push(c);
        });
        wrapped = new Set();
        if (extra.length) last[last.length - 1] = [last[last.length - 1], extra.join(" ")].filter(Boolean).join(" · ");
      }
    }
    if (rows.length > 1) {
      rows[0] = [...header, "הערות"];
      if (valueDates.some(Boolean)) {
        // the combined "date / value date" column is split into two: the date stays, the value date gets its own column
        rows[0][dateCol] = "תאריך";
        rows.forEach((r, k) => r.splice(r.length - 1, 0, k === 0 ? "תאריך ערך" : valueDates[k] ?? ""));
      }
      // the section title printed right above the table (e.g. "חשבונית מס (9 מסמכים)") is part of its meaning
      // (a counted section title "… (N מסמכים)" within the 3 lines above wins; otherwise the line right above)
      const above = [1, 2, 3].map((k) => sheet.rows[i - k]).filter((r): r is string[] => !!r && !headerScore(r).ok).map((r) => r.join(" ").trim());
      const title = above.find((t) => /[()]\s*\d+\s*מסמכ/.test(t)) ?? above[0];
      tables.push({ startLine: i + 1, header, sheet: { name: `טבלה ${tables.length + 1}`, rows, locators, title, assumptions: [...assumptions] } });
    }
    i = Math.max(j, i + 1);
  }
  return tables;
}

/** Document facts: "label | amount" lines (e.g. "יתרת עו״ש … | -797.62 ש״ח") with their page, kept as evidence. */
export function pdfFacts(sheet: ReadSheet): { facts: PdfFact[]; asOf: string | null } {
  const facts: PdfFact[] = [];
  let asOf: string | null = null;
  sheet.rows.forEach((cells, i) => {
    const text = cells.join(" ");
    const m = /(?:נכונים|נכון)\s+(?:ליום|לתאריך)\s+(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text);
    if (m && !asOf) asOf = parseDate(m[1])?.iso ?? null;
    if (cells.length < 2) return;
    const label = cells[0];
    if (!/[א-ת]/.test(label) || parseAmount(label)?.ok) return;
    const valueCell = cells.slice(1).find((c) => { if (firstDate(c)) return false; const a = parseAmount(c.replace(/₪|ש"ח|ש״ח|\$|€/g, "").trim()); return !!(a && a.ok) && /\d/.test(c); });
    const own = /נכון\s*(?:ל|ליום|לתאריך)/.test(text) ? firstDate(text) : null;
    if (!valueCell) return;
    const a = parseAmount(valueCell.replace(/₪|ש"ח|ש״ח|\$|€/g, "").trim());
    if (!a || !a.ok) return;
    facts.push({ line: i + 1, page: sheet.locators?.[i]?.page ?? null, label, value: valueCell, minor: a.minor, asOf: own ? parseDate(own)?.iso ?? null : null, currency: /₪|ש"ח|ש״ח/.test(valueCell) ? "ILS" : /\$/.test(valueCell) ? "USD" : /€/.test(valueCell) ? "EUR" : null });
  });
  return { facts, asOf };
}
