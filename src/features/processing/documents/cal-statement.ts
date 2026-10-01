import { buildLineCells, type PdfItem } from "../pdf-lines";
import { parseAmount, parseDate } from "../normalize";
import type { ReadSheet } from "../readers-types";

// Source Adapter: CAL credit-card statement ("דף פירוט דיגיטלי כאל"), built from real statements Tzeela uploaded
// (chapter 5 §20: an adapter is added when real material justifies it; it holds structural hints, known headers,
// formats and source-specific checks; if it does not recognise the document the semantic engine continues).
// Document understanding, not a line dump: statement details, credit limit, transaction table sections (columns taken
// from the table header positions), continuation notes and the charge-date totals used as a completeness check
// (chapter 5 §7: "סך העסקאות מול חיוב הכרטיס"). Nothing is guessed: a value that does not parse stays null.

export const CAL_ADAPTER_ID = "builtin:cal-statement";
export const CAL_ADAPTER_VERSION = "1";

type Money = { minor: string; currency: string };
export type CalTransaction = {
  rowNumber: number; page: number | null;
  transactionDate: string; supplier: string | null; category: string | null; details: string | null; cardPresented: string | null;
  transactionAmount: Money | null; chargeDate: string | null; chargeAmount: Money | null; notes: string[];
  section: "charged_before" | "accumulated";
};
export type CalTotal = { rowNumber: number; chargeDate: string; total: Money };
export type CalStatement = {
  issuer: "כאל"; cardLast4: string | null; statementDate: string | null; asOf: string | null;
  creditLimit: Money | null; nextChargeDate: string | null; limitValidUntil: string | null;
  transactions: CalTransaction[]; totals: CalTotal[];
  rowKinds: Map<number, "header" | "data" | "note" | "summary" | "metadata">;
};

type Column = "transaction_date" | "supplier" | "category" | "details" | "card_presented" | "transaction_amount" | "charge_date" | "charge_amount";

const SYMBOL_CURRENCY: Record<string, string> = { "₪": "ILS", "$": "USD", "€": "EUR", "£": "GBP" };
function money(text: string | null): Money | null {
  if (!text) return null;
  const sym = /[₪$€£]/.exec(text)?.[0];
  const a = parseAmount(text.replace(/[₪$€£]/g, ""));
  return a && a.ok && sym ? { minor: a.minor, currency: SYMBOL_CURRENCY[sym] } : null;
}
const isoShort = (d: string) => parseDate(d, "dmy_two_digit_year_20")?.iso ?? null; // the statement prints dd/mm/yy

export function isCalStatement(sheet: ReadSheet): boolean {
  const text = sheet.rows.slice(0, 40).map((r) => r.join(" ")).join(" ");
  return /cal-online\.co\.il/.test(text) && /דף חיוב חודשי/.test(text);
}

/** Header words with their horizontal extent; consecutive words of "שם בית העסק" form one column. */
function headerColumns(items: PdfItem[]): { col: Column; right: number; left: number }[] {
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => b.x - a.x);
  const words: { text: string; right: number; left: number }[] = [];
  let cur: { text: string; right: number; left: number } | null = null;
  let prevLeft: number | null = null;
  for (const it of sorted) {
    const gap = prevLeft === null ? 0 : prevLeft - (it.x + it.width);
    if (!cur || gap > (it.fontSize || 10) * 0.22) { cur = { text: "", right: it.x + it.width, left: it.x }; words.push(cur); }
    cur.text += it.str; cur.left = Math.min(cur.left, it.x);
    prevLeft = it.x;
  }
  const merged: typeof words = [];
  for (const w of words) {
    const last = merged[merged.length - 1];
    if (last && (last.text === "שם" || last.text === "שםבית") && (w.text === "בית" || w.text === "העסק")) { last.text += w.text; last.left = w.left; }
    else merged.push({ ...w });
  }
  const out: { col: Column; right: number; left: number }[] = [];
  let dates = 0, sums = 0;
  const sumCount = merged.filter((w) => w.text === "סכום").length;
  for (const w of merged) {
    let col: Column | null = null;
    if (w.text === "תאריך") col = dates++ === 0 ? "transaction_date" : "charge_date";
    else if (w.text.startsWith("שם")) col = "supplier";
    else if (w.text === "ענף") col = "category";
    else if (w.text === "פירוט") col = "details";
    else if (w.text === "כרטיס") col = "card_presented";
    else if (w.text === "סכום") col = ++sums === sumCount ? "charge_amount" : "transaction_amount";
    if (col) out.push({ col, right: w.right, left: w.left });
  }
  return out;
}

/** Items of a data line → column texts by the header's right edges (RTL columns are right-aligned). */
function splitByColumns(items: PdfItem[], cols: { col: Column; right: number; left: number }[]): Partial<Record<Column, string>> {
  const minLeft = Math.min(...cols.map((c) => c.left));
  const buckets = new Map<Column, PdfItem[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const r = it.x + it.width;
    if (r < minLeft - 15) continue; // outside the table (side marketing column)
    const candidates = cols.filter((c) => c.right >= r - 4).sort((a, b) => a.right - b.right);
    const target = candidates[0] ?? cols.reduce((a, b) => (a.right > b.right ? a : b));
    buckets.set(target.col, [...(buckets.get(target.col) ?? []), it]);
  }
  const out: Partial<Record<Column, string>> = {};
  for (const [col, its] of buckets) out[col] = buildLineCells(its).join(" ").trim();
  return out;
}

export function parseCalStatement(sheet: ReadSheet): CalStatement | null {
  if (!isCalStatement(sheet) || !sheet.positions) return null;
  const lines = sheet.rows.map((r) => r.join(" "));
  const find = (re: RegExp) => { for (const l of lines) { const m = re.exec(l); if (m) return m; } return null; };
  const st: CalStatement = {
    issuer: "כאל",
    cardLast4: find(/המסתיים ב-(\d{4})/)?.[1] ?? null,
    statementDate: (() => { const m = find(/דף חיוב חודשי ל-(\d{2}\/\d{2}\/\d{2})/); return m ? isoShort(m[1]) : null; })(),
    asOf: (() => { const m = find(/הנתונים נכונים לתאריך (\d{2}\/\d{2}\/\d{4})/); return m ? parseDate(m[1])?.iso ?? null : null; })(),
    creditLimit: (() => { const i = lines.findIndex((l) => /^מסגרת אשראי לכרטיס/.test(l)); return i >= 0 ? money(sheet.rows[i].find((c) => /₪/.test(c)) ?? null) : null; })(),
    nextChargeDate: (() => { const m = find(/מועד החיוב הבא הינו: (\d{2}\/\d{2}\/\d{4})/); return m ? parseDate(m[1])?.iso ?? null : null; })(),
    limitValidUntil: (() => { const m = find(/מסגרת אשראי בתוקף עד (\d{2}\/\d{2}\/\d{4})/); return m ? parseDate(m[1])?.iso ?? null : null; })(),
    transactions: [], totals: [], rowKinds: new Map(),
  };

  let cols: { col: Column; right: number; left: number }[] | null = null;
  let section: CalTransaction["section"] | null = null;
  let open: CalTransaction[] = [];
  sheet.rows.forEach((cells, i) => {
    const rowNumber = i + 1;
    const text = lines[i];
    if (/פירוט עסקות/.test(text)) { section = /אשר חויבו לפני/.test(text) ? "charged_before" : "accumulated"; cols = null; st.rowKinds.set(rowNumber, "metadata"); return; }
    if (section && !cols && /שם בית העסק/.test(text)) { cols = headerColumns(sheet.positions![i]); st.rowKinds.set(rowNumber, "header"); return; }
    if (!section || !cols) { st.rowKinds.set(rowNumber, "metadata"); return; }
    const total = /סה"כ לתאריך (\d{2}\/\d{2}\/\d{2})/.exec(text);
    if (total) {
      const chargeDate = isoShort(total[1]);
      const amounts = text.replace(/סה"כ לתאריך \d{2}\/\d{2}\/\d{2}/, "").match(/[₪$€£]\s*-?[\d,]+(?:\.\d+)?/g) ?? [];
      const amount = money(amounts[amounts.length - 1] ?? null);
      if (chargeDate && amount) st.totals.push({ rowNumber, chargeDate, total: amount });
      for (const t of open) if (!t.chargeDate) t.chargeDate = chargeDate;
      open = []; section = null; cols = null;
      st.rowKinds.set(rowNumber, "summary");
      return;
    }
    const parts = splitByColumns(sheet.positions![i], cols);
    const date = parts.transaction_date && /^\d{2}\/\d{2}\/\d{4}$/.test(parts.transaction_date) ? parseDate(parts.transaction_date)?.iso ?? null : null;
    if (date) {
      const t: CalTransaction = {
        rowNumber, page: sheet.locators?.[i]?.page ?? null, transactionDate: date,
        supplier: parts.supplier || null, category: parts.category || null, details: parts.details || null, cardPresented: parts.card_presented || null,
        transactionAmount: money(parts.transaction_amount ?? null), chargeDate: parts.charge_date ? isoShort(parts.charge_date) : null,
        chargeAmount: money(parts.charge_amount ?? null), notes: [], section: section!,
      };
      open.push(t); st.transactions.push(t); st.rowKinds.set(rowNumber, "data");
    } else if (open.length && (parts.supplier || parts.details) && !parts.charge_amount) {
      open[open.length - 1].notes.push([parts.supplier, parts.category, parts.details].filter(Boolean).join(" "));
      st.rowKinds.set(rowNumber, "note");
    } else if (/^(העסקה|תאריך)/.test(text)) st.rowKinds.set(rowNumber, "header");
    else st.rowKinds.set(rowNumber, "note");
  });
  return st.transactions.length || st.totals.length ? st : null;
}

/** Completeness check (chapter 5 §7, §23): the charges of each charge date add up to the statement's total. */
export function checkCalTotals(st: CalStatement): { chargeDate: string; total: string; sum: string; ok: boolean; missingAmounts: number }[] {
  return st.totals.map((t) => {
    const rows = st.transactions.filter((x) => x.chargeDate === t.chargeDate);
    const missing = rows.filter((x) => !x.chargeAmount).length;
    const sum = rows.reduce((s, x) => s + (x.chargeAmount ? BigInt(x.chargeAmount.minor) : 0n), 0n);
    return { chargeDate: t.chargeDate, total: t.total.minor, sum: sum.toString(), ok: missing === 0 && sum === BigInt(t.total.minor), missingAmounts: missing };
  });
}
