import type { Adapter, AmountSign, DocumentRole, PaymentMethodMeaning } from "./adapter";
import { conceptByCode, type DataType } from "./concepts";
import type { Family } from "./families";
import { currencyCode, headerKey, parseAmount, parseDate } from "./normalize";

// Semantic Extraction for tables (chapter 5 §4, §5, §21; Stage 3 D5): "המנוע אינו מחפש 'תא מספר 4' או כותרת אחת קבועה.
// הוא מחפש מושגים ומשמעות". Each column is understood from three independent signals:
//  1. the header's wording against the canonical wording of the chapter 5 concepts (morphological variants only:
//     the definite article "ה", "סה״כ", quotes — no fuzzy similarity);
//  2. the profile of the values in the column (dates / money / identifiers / text);
//  3. whether the concept is expected in this document family (chapter 5 §6–§11).
// A column is assigned automatically only when one concept clearly wins. Columns that match nothing are kept as
// Unmapped Observations (no question). A question is asked only for real ambiguity that matters: a missing required
// concept, two columns competing for one concept, a coded value whose meaning is unknown, an unknown currency, or an
// undecidable amount sign. Every automatic decision is recorded with its basis (provenance of the engine).

export const SEMANTIC_ENGINE_VERSION = "semantic-v1";

// canonical wording per concept (chapter 5 §4, §6–§11) + the English names of the same concepts
const LEXICON: Record<string, string[]> = {
  transaction_date: ["תאריך עסקה", "תאריך פעולה", "תאריך תנועה", "תאריך רכישה", "תאריך התשלום", "תאריך תשלום", "תאריך העברה", "transaction date"],
  value_date: ["תאריך ערך", "value date"],
  charge_date: ["תאריך חיוב", "מועד חיוב", "charge date", "billing date"],
  document_date: ["תאריך מסמך", "תאריך חשבונית", "תאריך הפקה", "document date", "invoice date"],
  description: ["תיאור", "תיאור פעולה", "תיאור תנועה", "פרטים", "פירוט", "description", "details"],
  supplier: ["ספק", "שם ספק", "בית עסק", "שם בית עסק", "merchant", "supplier", "vendor"],
  customer: ["לקוח", "שם לקוח", "פרטי לקוח", "customer", "client"],
  counterparty: ["צד שני", "מאת ל", "שולח", "מקבל", "מוטב", "שם מוטב", "שם המוטב", "לפקודת", "counterparty", "payee"],
  counterparty_account: ["חשבון מוטב", "חשבון המוטב", "חשבון יעד", "חשבון נגדי", "payee account"],
  amount: ["סכום", "סכום פעולה", "זכות חובה", "amount", "sum"], // "זכות/חובה" = one signed amount column (chapter 5 §6 "סכום וכיוון חובה/זכות")
  transaction_amount: ["סכום עסקה", "סכום מקורי", "transaction amount", "original amount"],
  charge_amount: ["סכום חיוב", "סכום לחיוב", "charge amount"],
  debit_amount: ["חובה", "יציאה", "debit"],
  credit_amount: ["זכות", "כניסה", "credit"],
  balance: ["יתרה", "יתרה לאחר פעולה", "balance"],
  currency: ["מטבע", "currency"],
  exchange_rate: ["שער", "שער מטבע", "שער המרה", "exchange rate", "rate"],
  direction: ["כיוון", "זיכוי חיוב", "חיוב זיכוי", "נשלח התקבל", "direction"],
  status: ["סטטוס", "מצב", "status"],
  reference: ["אסמכתא", "אסמכתה", "reference"],
  fee_amount: ["עמלה", "סכום עמלה", "fee", "commission"],
  document_number: ["מספר מסמך", "מספר חשבונית", "מספר קבלה", "document number", "invoice number"],
  document_type: ["סוג מסמך", "document type"],
  document_name: ["שם מסמך"],
  vat_id: ["מספר עוסק", "מס עוסק", "עוסק מורשה", "חפ", "ח פ", "vat id", "tax id"],
  allocation_number: ["מספר הקצאה", "allocation number"],
  net_amount: ["נטו", "לפני מעמ", "סכום לפני מעמ", "לא כולל מעמ", "סכום לא כולל מעמ", "חייב מעמ", "סכום חייב מעמ", "net"],
  vat_amount: ["מעמ", "סכום מעמ", "vat"],
  gross_amount: ["ברוטו", "כולל מעמ", "סכום כולל מעמ", "סך לתשלום", "סהכ כולל מעמ", "gross", "total"],
  gross_amount_ils: ["כולל מעמ בשקלים", "סכום כולל בשקלים כולל מעמ", "סכום כולל בשקלים"],
  net_amount_ils: ["לפני מעמ בשקלים", "סכום כולל בשקלים לפני מעמ"],
  recognized_amount: ["הוצאה מוכרת", "הוצאה עסקית", "סכום הוצאה מוכרת", "סכום הוצאה עסקית"],
  recognized_vat: ["מעמ מוכר", "סכום מעמ מוכר", "מעמ הוצאה עסקית"],
  payment_method: ["אמצעי תשלום", "שולם באמצעות", "אופן תשלום", "payment method"],
  installment_info: ["תשלומים", "מספר תשלומים", "installments"],
  card_identifier: ["ספרות אחרונות", "מספר כרטיס", "card number"],
  merchant_category: ["ענף", "קטגוריה", "category"],
  reporting_period: ["חודש דיווח", "תקופת דיווח", "תקופה", "period"],
  expense_account: ["חשבון הוצאה", "תיאור חשבון הוצאה"],
  line_number: ["מספר שורה"],
  line_description: ["תיאור שורה"],
  quantity: ["כמות", "quantity"],
  unit_price: ["מחיר ליחידה", "מחיר ליחידה לפני מעמ", "unit price"],
  item_code: ["מקט"],
  vat_type: ["סוג מעמ"],
  document_link: ["קישור", "link"],
  external_id: ["מזהה מסמך"],
  note: ["הערות", "הערה", "notes", "memo"],
};
// a bare generic word is weaker evidence than a full phrase (chapter 5 §4 lists several dates and amounts)
const GENERIC: Record<string, { concept: string; weight: number }> = {
  "תאריך": { concept: "transaction_date", weight: 0.62 },
  "date": { concept: "transaction_date", weight: 0.62 },
  "מס": { concept: "document_number", weight: 0.82 }, // the abbreviation of "מספר" as a column title
  "סהכ": { concept: "gross_amount", weight: 0.85 },
  "שם": { concept: "counterparty", weight: 0.6 }, // a bare "name" column = the other party (chapter 5 §4 "שם גוף, אדם, ספק…"); counts only where the family expects a counterparty
  "חשבון": { concept: "counterparty_account", weight: 0.6 }, // a bare "account" column beside a payee = the payee's account (Payment Proofs); elsewhere below the threshold
  "סוג תנועה": { concept: "description", weight: 0.8 }, // the movement's name in bank reports; reduced weight — elsewhere it may hold a code // "סה״כ" = the total of the document (chapter 5 §9 "ברוטו / סך לתשלום")
};

const tokens = (s: string) => headerKey(s).split(" ").filter(Boolean).map((t) => (t.length > 3 && t.startsWith("ה") ? t.slice(1) : t));
const PHRASES = Object.entries(LEXICON).flatMap(([concept, ps]) => ps.map((p) => ({ concept, toks: tokens(p) })));

/** Header → [concept, score] candidates from wording only. */
export function headerCandidates(header: string): { concept: string; score: number }[] {
  const h = tokens(header);
  if (!h.length) return [];
  const key = h.join(" ");
  const out = new Map<string, number>();
  const put = (c: string, s: number) => out.set(c, Math.max(out.get(c) ?? 0, s));
  if (GENERIC[key]) put(GENERIC[key].concept, GENERIC[key].weight);
  for (const p of PHRASES) {
    const pk = p.toks.join(" ");
    if (pk === key) { put(p.concept, 1); continue; }
    const pool = [...h];
    if (p.toks.every((t) => { const i = pool.indexOf(t); if (i < 0) return false; pool.splice(i, 1); return true; })) put(p.concept, 0.55 + 0.4 * (p.toks.length / h.length));
  }
  return [...out.entries()].map(([concept, score]) => ({ concept, score })).sort((a, b) => b.score - a.score);
}

export type Profile = { n: number; date: number; money: number; integer: number; text: number; signs: { pos: number; neg: number }; symbols: Set<string>; twoDigitYear: number };
export function profile(values: string[]): Profile {
  const vs = values.map((v) => v.trim()).filter(Boolean);
  const p: Profile = { n: vs.length, date: 0, money: 0, integer: 0, text: 0, signs: { pos: 0, neg: 0 }, symbols: new Set(), twoDigitYear: 0 };
  for (const v of vs) {
    const d = parseDate(v) ?? parseDate(v, "dmy_two_digit_year_20");
    const sym = /[₪$€£]/.exec(v)?.[0];
    const a = parseAmount(v.replace(/[₪$€£]/g, ""));
    if (d) { p.date++; if (!parseDate(v)) p.twoDigitYear++; }
    else if (/^\d+$/.test(v) && v.length >= 5) p.integer++;
    else if (a && a.ok) { p.money++; if (sym) p.symbols.add(sym); if (a.minor.startsWith("-")) p.signs.neg++; else p.signs.pos++; }
    else p.text++;
  }
  return p;
}
const ratio = (x: number, p: Profile) => (p.n ? x / p.n : 0);

function compatibility(type: DataType, p: Profile): number {
  if (!p.n) return 0.5;
  if (type === "date") return ratio(p.date, p) >= 0.6 ? 1 : 0.15;
  if (type === "money") return ratio(p.money, p) >= 0.6 ? 1 : 0.15;
  if (type === "rate" || type === "number") return ratio(p.money, p) + ratio(p.integer, p) >= 0.6 ? 1 : 0.3;
  if (type === "id") return ratio(p.integer + p.money, p) >= 0.5 || ratio(p.text, p) >= 0.5 ? 0.9 : 0.4;
  return ratio(p.date, p) >= 0.8 || ratio(p.money, p) >= 0.8 ? 0.2 : 1; // text concepts
}

// value meanings (sources' own vocabulary for chapter 5 §4/§8 directions and statuses; document codes as documented
// by the green-invoice Skill: 305 tax invoice, 320 invoice-receipt, 330 credit note, 400 receipt, 300 transaction invoice)
const DIRECTION_VALUES: Record<string, "debit" | "credit"> = { "חיוב": "debit", "חובה": "debit", "נשלח": "debit", "יציאה": "debit", "שלחת": "debit", "debit": "debit", "זיכוי": "credit", "זכות": "credit", "התקבל": "credit", "כניסה": "credit", "קיבלת": "credit", "credit": "credit" };
const STATUS_VALUES: Record<string, "executed" | "not_executed"> = { "בוצע": "executed", "הושלם": "executed", "completed": "executed", "נכשל": "not_executed", "בוטל": "not_executed", "סירבת": "not_executed", "נדחה": "not_executed", "עבר התוקף": "not_executed", "פג תוקף": "not_executed", "failed": "not_executed", "cancelled": "not_executed", "declined": "not_executed", "expired": "not_executed" };
const ROLE_VALUES: Record<string, DocumentRole> = {
  "חשבונית מס": "tax_invoice", "305": "tax_invoice", "חשבונית מס קבלה": "invoice_receipt", "320": "invoice_receipt",
  "קבלה": "receipt", "400": "receipt", "קבלה על תרומה": "receipt", "405": "receipt",
  "חשבון עסקה": "transaction_invoice", "חשבון אישור תשלום": "transaction_invoice", "אישור תשלום": "transaction_invoice", "חשבון": "transaction_invoice", "300": "transaction_invoice",
  "חשבוניות מס": "tax_invoice", "חשבוניות מס קבלה": "invoice_receipt", "קבלות": "receipt", "חשבונות עסקה": "transaction_invoice", "חשבוניות זיכוי": "credit_note",
  "חשבונית זיכוי": "credit_note", "330": "credit_note", "הצעת מחיר": "other", "10": "other", "הזמנה": "other", "100": "other", "תעודת משלוח": "other", "200": "other", "תעודת החזרה": "other", "210": "other",
};
const PAYMENT_VALUES: Record<string, PaymentMethodMeaning> = { "כרטיס אשראי": "credit_card", "אשראי": "credit_card", "יתרה": "balance", "חשבון בנק": "bank_account", "העברה בנקאית": "bank_account", "מזומן": "cash", "אחר": "other", "המחאה": "other", "אפליקציית תשלום": "other", "לא שולם": "other" };
const vkey = (s: string) => headerKey(s);
/** "חשבונית מס (9 מסמכים)" → tax_invoice. The count in parentheses (either direction, RTL extraction) is dropped. */
function roleFromTitle(title: string | undefined): DocumentRole | null {
  if (!title) return null;
  const core = title.replace(/[()]\s*\d+\s*מסמכים?\s*[()]/g, "").replace(/\d+/g, "").trim();
  if (!core || core.length > 40) return null;
  const keyed = new Map(Object.entries(ROLE_VALUES).map(([k, v]) => [vkey(k), v]));
  return keyed.get(vkey(core)) ?? null;
}

function mapValues<T>(values: string[], table: Record<string, T>): { map: Record<string, T>; unknown: string[] } {
  const keyed = new Map(Object.entries(table).map(([k, v]) => [vkey(k), v]));
  const map: Record<string, T> = {}; const unknown: string[] = [];
  for (const v of values) { const m = keyed.get(vkey(v)); if (m !== undefined) map[v] = m; else unknown.push(v); }
  return { map, unknown };
}

export type ColumnDecision = { index: number; header: string; concept: string | null; score: number; basis: string; alternatives: { concept: string; score: number }[] };
export type Question =
  | { kind: "column"; reason: "required_missing" | "ambiguous"; concept?: string; columns: number[]; candidates: string[] }
  | { kind: "values"; concept: "direction" | "status" | "document_type" | "payment_method"; column: number; unknown: string[] }
  | { kind: "currency" }
  | { kind: "document_role_all" }
  | { kind: "sign" };
export type SemanticResult = { adapter: Omit<Adapter, "id" | "version" | "signature" | "sourceType">; decisions: ColumnDecision[]; questions: Question[]; assumptions: string[] };

/** Understands a table: header row + data rows → an adapter-shaped decision set, plus the questions that remain. */
export function understandTable(headers: string[], rows: string[][], family: Family, context: { side: "income" | "expense" | null; sheetName?: string; headerText?: string; sectionTitle?: string; /** the one currency the whole document states (PDF), if exactly one */ documentCurrency?: string | null; /** the direction the document itself declares for all its rows (payment proofs: transfers made) */ statedDirection?: "debit" | null }): SemanticResult {
  const expected = new Set(family.expected);
  const columns = headers.map((h, index) => ({ index, header: h, prof: profile(rows.map((r) => r[index] ?? "")) }));
  const scored: { col: number; concept: string; score: number; basis: string }[] = [];
  for (const c of columns) {
    for (const cand of headerCandidates(c.header)) {
      const def = conceptByCode(cand.concept);
      if (!def) continue;
      const fam = expected.has(cand.concept) ? 1 : 0.5;
      scored.push({ col: c.index, concept: cand.concept, score: cand.score * compatibility(def.dataType, c.prof) * fam, basis: `header "${c.header}"` });
    }
  }
  // value-only evidence when the header says nothing (e.g. exported web tables): a single unambiguous date / money column
  const dateCols = columns.filter((c) => c.prof.n && ratio(c.prof.date, c.prof) >= 0.9);
  const moneyCols = columns.filter((c) => c.prof.n && ratio(c.prof.money, c.prof) >= 0.9);
  const dateConcept = family.required.find((r) => conceptByCode(r)?.dataType === "date") ?? "transaction_date";
  if (dateCols.length === 1 && !scored.some((s) => conceptByCode(s.concept)?.dataType === "date" && s.score >= 0.7)) scored.push({ col: dateCols[0].index, concept: dateConcept, score: 0.78, basis: "the only date column" });
  // a plain "תאריך" beside an explicit value-date column is the transaction / record date (chapter 5 §6 "תאריך פעולה / תאריך ערך")
  const hasValueDate = scored.some((s) => s.concept === "value_date" && s.score >= 0.7);
  if (hasValueDate && !scored.some((s) => s.concept === dateConcept && s.score >= 0.7)) {
    const plain = columns.find((c) => headerKey(c.header) === "תאריך" && c.prof.n && ratio(c.prof.date, c.prof) >= 0.9);
    if (plain) scored.push({ col: plain.index, concept: dateConcept, score: 0.8, basis: `header "${plain.header}" beside a value-date column` });
  }
  const moneyConcept = context.side ? "gross_amount" : "amount";
  if (moneyCols.length === 1 && !scored.some((s) => conceptByCode(s.concept)?.dataType === "money" && s.score >= 0.7)) scored.push({ col: moneyCols[0].index, concept: moneyConcept, score: 0.76, basis: "the only amount column" });

  // a business document's value date is its date of record (chapter 5 §10 "תאריך ותקופה") when no document date exists
  if (context.side && !scored.some((s) => s.concept === "document_date" && s.score >= 0.7)) {
    const vd = scored.find((s) => s.concept === "value_date");
    if (vd) scored.push({ col: vd.col, concept: "document_date", score: 0.8, basis: `header "${headers[vd.col]}" — value date of a business document = its record date` });
  }
  scored.sort((a, b) => b.score - a.score);
  const byCol = new Map<number, ColumnDecision>();
  const takenConcept = new Set<string>();
  const conflicts: { concept: string; cols: number[] }[] = [];
  for (const s of scored) {
    if (s.score < 0.45) continue;
    const existing = byCol.get(s.col);
    if (existing) { existing.alternatives.push({ concept: s.concept, score: s.score }); continue; }
    if (takenConcept.has(s.concept)) {
      const holder = [...byCol.values()].find((d) => d.concept === s.concept)!;
      if (holder.score - s.score < 0.1 && s.score >= 0.7) conflicts.push({ concept: s.concept, cols: [holder.index, s.col] });
      continue;
    }
    byCol.set(s.col, { index: s.col, header: headers[s.col], concept: s.concept, score: s.score, basis: s.basis, alternatives: [] });
    takenConcept.add(s.concept);
  }
  const decisions: ColumnDecision[] = columns.map((c) => byCol.get(c.index) ?? { index: c.index, header: c.header, concept: null, score: 0, basis: "no matching concept — kept as unmapped", alternatives: [] });
  const questions: Question[] = [];
  const assumptions: string[] = [];
  // low-confidence or contested assignments become questions (only when the concept matters)
  for (const d of decisions) {
    if (!d.concept) continue;
    const second = d.alternatives[0]?.score ?? 0;
    const matters = family.required.includes(d.concept) || ["money", "date"].includes(conceptByCode(d.concept)!.dataType);
    if ((d.score < 0.7 || d.score - second < 0.12) && matters) questions.push({ kind: "column", reason: "ambiguous", concept: d.concept, columns: [d.index], candidates: [d.concept, ...d.alternatives.map((a) => a.concept)].slice(0, 4) });
  }
  for (const c of conflicts) questions.push({ kind: "column", reason: "ambiguous", concept: c.concept, columns: c.cols, candidates: [c.concept] });
  const has = (concept: string) => decisions.some((d) => d.concept === concept);
  const satisfied = (r: string) => has(r) || (r === "amount" && (has("debit_amount") || has("credit_amount") || has("charge_amount"))) || (r === "gross_amount" && has("gross_amount_ils"));
  for (const r of family.required) if (!satisfied(r)) questions.push({ kind: "column", reason: "required_missing", concept: r, columns: [], candidates: [r] });
  if (family.code === "bank_documents" && !has("amount") && !has("debit_amount") && !has("credit_amount")) questions.push({ kind: "column", reason: "required_missing", concept: "amount", columns: [], candidates: ["amount", "debit_amount", "credit_amount"] });

  // coded values
  const values: SemanticResult["adapter"]["values"] = {};
  const colOf = (concept: string) => decisions.find((d) => d.concept === concept)?.index;
  // coded values are read from structurally valid rows only (a shifted / broken source line must not create a question)
  const dateIdx = decisions.find((d) => d.concept && conceptByCode(d.concept)?.dataType === "date")?.index;
  const validRows = dateIdx === undefined ? rows : rows.filter((r) => parseDate(r[dateIdx] ?? "") || parseDate(r[dateIdx] ?? "", "dmy_two_digit_year_20"));
  const distinct = (i: number) => [...new Set(validRows.map((r) => (r[i] ?? "").trim()).filter(Boolean))];
  const dirCol = colOf("direction");
  if (dirCol !== undefined) { const m = mapValues(distinct(dirCol), DIRECTION_VALUES); values.direction = m.map; if (m.unknown.length) questions.push({ kind: "values", concept: "direction", column: dirCol, unknown: m.unknown }); }
  const stCol = colOf("status");
  if (stCol !== undefined && family.code === "payment_apps") { const m = mapValues(distinct(stCol), STATUS_VALUES); values.status = m.map; if (m.unknown.length) questions.push({ kind: "values", concept: "status", column: stCol, unknown: m.unknown }); }
  const roleCol = colOf("document_type");
  if (context.side) {
    // no document-type column: the section title above the table may state it (chapter 5 §21 layout / sections)
    const titled = roleCol === undefined ? roleFromTitle(context.sectionTitle) : null;
    if (titled) { values.documentRoleDefault = titled; assumptions.push(`document type from the section title "${context.sectionTitle}"`); }
    else if (roleCol === undefined) questions.push({ kind: "document_role_all" });
    else { const m = mapValues(distinct(roleCol), ROLE_VALUES); values.documentRole = m.map; if (m.unknown.length) questions.push({ kind: "values", concept: "document_type", column: roleCol, unknown: m.unknown }); }
  }
  const pmCol = colOf("payment_method");
  if (pmCol !== undefined && family.code === "payment_apps") { const m = mapValues(distinct(pmCol), PAYMENT_VALUES); values.paymentMethod = m.map; if (m.unknown.length) questions.push({ kind: "values", concept: "payment_method", column: pmCol, unknown: m.unknown }); }

  // currency: a currency column, symbols on the amounts, or the table/sheet stating shekels; otherwise ask
  const moneyIdx = decisions.filter((d) => d.concept && conceptByCode(d.concept)?.dataType === "money").map((d) => d.index);
  let currencyDefault: string | null = null;
  let currencyFromSymbols = false;
  if (moneyIdx.length && !has("currency")) {
    const syms = new Set(moneyIdx.flatMap((i) => [...columns[i].prof.symbols]));
    const stated = `${context.sheetName ?? ""} ${context.headerText ?? ""} ${headers.join(" ")}`;
    const withSymbol = moneyIdx.reduce((n, i) => n + columns[i].prof.symbols.size, 0);
    const symbolRatio = moneyIdx.length ? moneyIdx.filter((i) => { const pr = columns[i].prof; return pr.money && [...pr.symbols].length; }).length / moneyIdx.length : 0;
    if (syms.size > 1 && symbolRatio >= 0.5 && withSymbol) { currencyFromSymbols = true; assumptions.push(`currency per row from the amount symbols (${[...syms].join(" ")})`); }
    else if (syms.size === 1 && currencyCode([...syms][0])) { currencyDefault = currencyCode([...syms][0]); assumptions.push(`currency from the amount symbol ${[...syms][0]}`); }
    else if (syms.size === 0 && /ש"?ח|ש״ח|ש''ח|בשקלים|₪/.test(stated)) { currencyDefault = "ILS"; assumptions.push("currency stated in the sheet/header (שקלים)"); }
    else if (syms.size === 0 && context.documentCurrency) { currencyDefault = context.documentCurrency; assumptions.push(`currency stated elsewhere in the document (${context.documentCurrency}) — the only currency it mentions`); }
    else if (syms.size === 0 && family.code === "payment_apps") { currencyDefault = "ILS"; assumptions.push("payment apps (bit / PayBox) operate in shekels only"); }
    else questions.push({ kind: "currency" });
  }

  // amount sign: separate debit/credit columns or a direction column decide; otherwise the family convention when the
  // data is unambiguous; otherwise ask
  let amountSign: AmountSign = "signed_negative_is_debit";
  const signCol = colOf("charge_amount") ?? colOf("amount");
  if (signCol !== undefined && !has("debit_amount") && !has("credit_amount") && !context.side) {
    const pr = columns[signCol].prof; const tot = pr.signs.pos + pr.signs.neg;
    if (dirCol !== undefined) amountSign = "unsigned_use_direction";
    else if (family.code === "payment_proofs" && context.statedDirection === "debit" && pr.signs.neg === 0) { amountSign = "all_debit"; assumptions.push("the document lists transfers / payments made from the account — every row is an outgoing payment"); }
    else if (family.code === "bank_documents" && pr.signs.neg > 0) { amountSign = "signed_negative_is_debit"; assumptions.push("bank amounts: minus = debit (statement convention)"); }
    else if (family.code === "credit_card_documents" && tot && pr.signs.pos / tot >= 0.65) { amountSign = "signed_positive_is_debit"; assumptions.push("card amounts: positive = charge, negative = refund (most amounts are positive)"); }
    else if (family.code === "credit_card_documents" && tot && pr.signs.neg / tot >= 0.65) { amountSign = "signed_negative_is_debit"; assumptions.push("card amounts: negative = charge (most amounts are negative)"); }
    else questions.push({ kind: "sign" });
  }

  // two-digit years: dated financial records → 20YY up to next year, else 19YY (deterministic pivot, recorded)
  const twoDigit = decisions.some((d) => d.concept && conceptByCode(d.concept)?.dataType === "date" && columns[d.index].prof.twoDigitYear > 0);
  if (twoDigit) assumptions.push("two-digit years read as 20YY (pivot: up to next year)");

  return {
    adapter: { headerRow: 0, columns: decisions.map((d) => ({ index: d.index, header: d.header, concept: d.concept })), dateFormat: twoDigit ? "dmy_two_digit_year_20" : "dmy", amountSign, currencyDefault, currencyFromSymbols, values },
    decisions, questions, assumptions,
  };
}
