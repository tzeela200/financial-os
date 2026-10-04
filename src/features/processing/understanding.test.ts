import { describe, it, expect } from "vitest";
import { understandTable } from "./semantic";
import { pdfTables, pdfFacts } from "./pdf-tables";
import { buildLineCells, type PdfItem } from "./pdf-lines";
import { understandDocument } from "./understand";
import { verifyRows } from "./validate";
import { applyAnswers, unanswered } from "./mapping-answers";
import { readTabular } from "./tabular";
import { familyForSource } from "./families";
import type { ReadSheet, SourceRead } from "./readers-types";
import type { Adapter } from "./adapter";

// Document understanding (chapter 5 §1–§5, §20–§21) on SYNTHETIC material only. The reference corpus run lives in
// tests/reference and is local-only (never committed).

const enc = (s: string) => new TextEncoder().encode(s);
function csv(body: string): Extract<SourceRead, { ok: true }> {
  const r = readTabular(enc(body), "synthetic.csv");
  if (!r.ok) throw new Error("synthetic csv not readable");
  return { ok: true, format: "csv", meta: {}, sheets: r.sheets };
}
const BANK = `תאריך,תיאור,חובה,זכות,יתרה\n01/07/2026,משכורת,,"5,000.00","5,500.00"\n11/07/2026,חיוב כרטיס,340.00,,"5,160.00"\n15/07/2026,קפה,100.00,,"5,060.00"\n`;

describe("semantic engine — columns by meaning, not by an exact dictionary", () => {
  it("understands a bank table by itself; only the currency that the file never states is asked", () => {
    const u = understandTable(["תאריך", "תיאור", "חובה", "זכות", "יתרה"], [["01/07/2026", "משכורת", "", "5,000.00", "5,500.00"], ["11/07/2026", "קפה", "100.00", "", "5,400.00"]], familyForSource("bank_statement")!, { side: null });
    expect(u.decisions.map((d) => d.concept)).toEqual(["transaction_date", "description", "debit_amount", "credit_amount", "balance"]);
    expect(u.questions).toEqual([{ kind: "currency" }]);
  });
  it("takes the currency from the amount symbols and records the basis", () => {
    const u = understandTable(["תאריך", "תיאור", "חובה", "זכות"], [["01/07/2026", "משכורת", "", "₪5,000.00"], ["11/07/2026", "קפה", "₪100.00", ""]], familyForSource("bank_statement")!, { side: null });
    expect(u.questions).toEqual([]);
    expect(u.adapter.currencyDefault).toBe("ILS");
  });
  it("tolerates header variations (prefix ה, quotes, extra words) without a new parser", () => {
    const u = understandTable(["התאריך", "פרטי התנועה", "סכום החיוב ב-₪", "תאריך החיוב"], [["02/07/2026", "סופר", "300.00", "10/07/2026"]], familyForSource("credit_card_statement")!, { side: null });
    const byConcept = Object.fromEntries(u.decisions.filter((d) => d.concept).map((d) => [d.concept, d.index]));
    expect(byConcept.transaction_date).toBe(0);
    expect(byConcept.charge_date).toBe(3);
    expect(byConcept.charge_amount ?? byConcept.transaction_amount).toBe(2);
  });
  it("maps Green Invoice document type codes without asking", () => {
    const u = understandTable(["מספר מסמך", "תאריך מסמך", "סוג מסמך", "שם לקוח", 'סה"כ'], [["1001", "01/07/2026", "320", "לקוח א", "₪1,180.00"], ["1002", "02/07/2026", "305", "לקוח ב", "₪590.00"]], familyForSource("business_income_export")!, { side: "income" });
    expect(u.questions).toEqual([]);
    expect(u.adapter.values.documentRole).toMatchObject({ "320": "invoice_receipt", "305": "tax_invoice" });
  });
});

describe("mapping answers — only the open questions, applied onto the proposal", () => {
  const proposed = (): Adapter => ({ id: "semantic:x", version: "semantic-v1", sourceType: "bank_statement", signature: "a|b", headerRow: 1, columns: [{ index: 0, header: "a", concept: "transaction_date" }, { index: 1, header: "b", concept: "amount" }], dateFormat: "dmy", amountSign: "signed_negative_is_debit", currencyDefault: null, values: {} });
  it("lists what is still unanswered", () => {
    expect(unanswered([{ kind: "currency" }, { kind: "sign" }], { 0: { kind: "currency", currency: "ILS" } })).toEqual([1]);
    expect(unanswered([{ kind: "values", concept: "direction", column: 2, unknown: ["x", "y"] }], { 0: { kind: "values", map: { x: "debit" } } })).toEqual([0]);
  });
  it("applies currency, sign and value meanings without touching other decisions", () => {
    const a = applyAnswers(proposed(), [{ kind: "currency" }, { kind: "sign" }, { kind: "values", concept: "direction", column: 1, unknown: ["יצא"] }], {
      0: { kind: "currency", currency: "ILS" }, 1: { kind: "sign", sign: "all_debit" }, 2: { kind: "values", map: { "יצא": "debit" } },
    });
    expect(a.currencyDefault).toBe("ILS");
    expect(a.amountSign).toBe("all_debit");
    expect(a.values.direction).toEqual({ "יצא": "debit" });
    expect(a.columns).toEqual(proposed().columns);
  });
  it("a column answer moves a concept to the chosen column only", () => {
    const a = applyAnswers(proposed(), [{ kind: "column", reason: "ambiguous", concept: "transaction_date", columns: [0, 1], candidates: ["transaction_date"] }], { 0: { kind: "column", column: 1, concept: "transaction_date" } });
    expect(a.columns.map((c) => c.concept)).toEqual([null, "transaction_date"]);
  });
});

describe("understandDocument — one model for CSV / Excel / PDF; approved answers are reused", () => {
  it("a new structure: everything understood except the currency; after the answer the same file needs nothing", () => {
    const first = understandDocument(csv(BANK), "bank_statement", []);
    expect(first.needsMapping).toBe(true);
    expect(first.tables[0].questions).toEqual([{ kind: "currency" }]);
    const adapter = { ...applyAnswers(first.tables[0].proposed!, first.tables[0].questions, { 0: { kind: "currency", currency: "ILS" } }), id: "approved-1", version: "1" };
    const again = understandDocument(csv(BANK), "bank_statement", [adapter]);
    expect(again.needsMapping).toBe(false);
    expect(again.tables[0].via).toBe("approved_mapping");
    expect(again.normalized).toHaveLength(3);
    expect(again.normalized.every((n) => n.currency === "ILS")).toBe(true);
  });
  it("a variation of a known structure (title line above, extra column) needs no new parser and no new mapping", () => {
    const first = understandDocument(csv(BANK), "bank_statement", []);
    const adapter = { ...applyAnswers(first.tables[0].proposed!, first.tables[0].questions, { 0: { kind: "currency", currency: "ILS" } }), id: "approved-1", version: "1" };
    const variant = `תנועות בחשבון — יולי\n${BANK.split("\n").map((l, i) => (l ? `${l},${i === 0 ? "אסמכתא" : String(1000 + i)}` : l)).join("\n")}`;
    const u = understandDocument(csv(variant), "bank_statement", [adapter]);
    expect(u.needsMapping).toBe(false);
    expect(u.normalized).toHaveLength(3);
  });
  it("Unknown is not 0: a file with no stated currency produces no amounts in the picture until answered", () => {
    const u = understandDocument(csv(BANK), "bank_statement", []);
    expect(u.normalized).toHaveLength(0);
  });
});

// a synthetic digital-PDF page: multi-character items at their x positions (right-to-left table)
const line = (...cells: [string, number, number][]): PdfItem[] => cells.map(([str, x, width]) => ({ str, x, width, fontSize: 10 }));
function pdfSheet(lines: PdfItem[][]): ReadSheet {
  return { name: "page", rows: lines.map((l) => buildLineCells(l)), positions: lines, locators: lines.map(() => ({ page: 1 })) };
}

describe("PDF layout understanding — tables and facts, not raw lines", () => {
  const sheet = pdfSheet([
    line(["פירוט תנועות", 450, 80]),
    line(["תאריך", 500, 30], ["תיאור", 380, 30], ["סכום", 200, 25]),
    line(["05/07/2026", 480, 50], ["סופר שכונתי", 350, 60], ["120.50", 195, 30]),
    line(["כולל משלוח", 352, 55]),
    line(["06/07/2026", 480, 50], ["ספרים", 370, 30], ["40.00", 197, 28]),
    line(['סה"כ', 500, 20], ["160.50", 195, 30]),
    line(["נכונים ליום 31/07/2026", 420, 110]),
    line(['יתרת עו"ש', 500, 40], ['1,234.00 ש"ח', 190, 60]),
  ]);
  it("finds the table, its rows and keeps a continuation line as a note of its row", () => {
    const [t] = pdfTables(sheet);
    expect(t.header).toEqual(["תאריך", "תיאור", "סכום"]);
    expect(t.sheet.rows.slice(1).map((r) => r.slice(0, 3))).toEqual([["05/07/2026", "סופר שכונתי", "120.50"], ["06/07/2026", "ספרים", "40.00"]]);
    expect(t.sheet.rows[1][3]).toContain("כולל משלוח");
  });
  it("reads stated facts with their date (a reported balance is a fact, not a transaction)", () => {
    const f = pdfFacts(sheet);
    expect(f.asOf).toBe("2026-07-31");
    expect(f.facts.find((x) => x.label.startsWith("יתרת"))).toMatchObject({ minor: "123400", currency: "ILS" });
  });
  it("the bank family gets a reported balance from the document; raw lines are kept as evidence, not as transactions", () => {
    const u = understandDocument({ ok: true, format: "pdf", meta: {}, sheets: [sheet] }, "bank_statement", []);
    expect(u.bankBalance).toMatchObject({ minor: "123400", currency: "ILS", asOf: "2026-07-31" });
    expect(u.extraction.records.filter((r) => r.sheet === "מסמך").every((r) => r.kind !== "data")).toBe(true);
    expect(u.tables.map((t) => t.sheet)).toEqual(["טבלה 1"]);
  });
});

// DI-1 (readiness skill-routing §5; matrix §1 A/B): every file records its subtype and processing route.
describe("processing route — subtype, reader, OCR, skills applied / not applied", () => {
  const BANK_ILS = `תאריך,תיאור,חובה,זכות,יתרה\n01/07/2026,משכורת,,"₪5,000.00","₪5,500.00"\n11/07/2026,קפה,₪100.00,,"₪5,400.00"\n`;
  it("a bank table with transactions is a current-account transaction statement", () => {
    const u = understandDocument(csv(BANK_ILS), "bank_statement", []);
    expect(u.route?.subtype).toBe("current_account_transaction_statement");
  });
  it("a bank PDF with dated facts and no transaction table is an annual / summary report, never transactions", () => {
    const facts = pdfSheet([line(["נכונים ליום 31/12/2025", 420, 110]), line(['יתרת עו"ש', 500, 40], ['1,234.00 ש"ח', 190, 60])]);
    const u = understandDocument({ ok: true, format: "pdf", meta: {}, sheets: [facts] }, "bank_statement", []);
    expect(u.route?.subtype).toBe("annual_summary_report");
    expect(u.normalized).toHaveLength(0);
  });
  it("a bank transaction table still waiting on an open question is already a transaction statement", () => {
    const body = `תאריך,תיאור,סכום
01/07/2026,העברה,"₪100.00"
02/07/2026,העברה,"₪50.00"
`; // no sign, no direction column
    const u = understandDocument(csv(body), "bank_statement", []);
    expect(u.needsMapping).toBe(true);
    expect(u.route?.subtype).toBe("current_account_transaction_statement");
  });
  it("keeps the subtype explicitly undetermined when the document shows neither", () => {
    const u = understandDocument({ ok: true, format: "pdf", meta: {}, sheets: [pdfSheet([line(["מכתב כללי", 400, 60])])] }, "bank_statement", []);
    expect(u.route?.subtype).toBe("undetermined");
  });
  it("records the reader and never routes a digital file to OCR or to the receipt scanner", () => {
    const u = understandDocument(csv(BANK_ILS), "bank_statement", []);
    expect(u.route?.reader).toMatch(/CSV/);
    expect(u.route?.ocr).toMatch(/^not used/);
    expect(u.route?.skills.find((s) => s.skill === "israeli-receipt-scanner")?.applied).toBe(false);
  });
  it("applies the bank-connector rules to bank movements and not the Morning rules", () => {
    const u = understandDocument(csv(BANK_ILS), "bank_statement", []);
    expect(u.route?.skills.find((s) => s.skill === "israeli-bank-connector")?.applied).toBe(true);
    expect(u.route?.skills.find((s) => s.skill === "green-invoice")?.applied).toBe(false);
  });
  it("never applies reconciliation inside understanding of a single file", () => {
    const u = understandDocument(csv(BANK_ILS), "bank_statement", []);
    expect(u.route?.skills.find((s) => s.skill === "israeli-bank-reconciliation")?.applied).toBe(false);
  });
  it("a Morning export applies green-invoice and il-invoice-organizer rules", () => {
    const body = `מספר מסמך,תאריך מסמך,סוג מסמך,שם לקוח,סה"כ\n1001,01/07/2026,320,לקוח א,"₪1,180.00"\n`;
    const u = understandDocument(csv(body), "business_income_export", []);
    expect(u.route?.subtype).toBe("income_export");
    expect(u.route?.skills.filter((s) => s.applied).map((s) => s.skill).sort()).toEqual(["green-invoice", "il-invoice-organizer"]);
  });
});

// Semantic safety (chapter 5 §21): a table in which no column carries a known meaning is NOT "understood".
describe("a table with no recognisable concept", () => {
  const body = `שנה,חודש,ערך א,ערך ב\n2025,4,18682,18781\n2025,3,29408,30286\n`;
  it("is marked not understood, produces no rows, and goes to review — not presented as understood", () => {
    const u = understandDocument(csv(body), "accounting_ledger", []);
    expect(u.tables[0].via).toBe("not_understood");
    expect(u.normalized).toHaveLength(0);
    expect(u.needsMapping).toBe(false);
    expect(u.extraChecks.find((c) => c.code === "table_not_understood")?.status).toBe("failed");
  });
});

// Checklist C — accounting XLSX through the same reader + engine (synthetic workbook built in memory).
describe("accounting export as XLSX", () => {
  it("is read by SheetJS, understood semantically and recorded as a ledger export", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["כרטסת הנהלת חשבונות — סכומים בשקלים"], [], ["תאריך", "פרטים", "אסמכתא", "ספק", "מע\"מ", "סכום כולל מע\"מ"], ["05/07/2026", "חומרי ניקוי", "1001", "ספק א", "18.00", "118.00"], ["06/07/2026", "שכירות", "1002", "משכיר ב", "0.00", "4000.00"]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "כרטסת");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    const { readSource } = await import("./readers");
    const r = await readSource(bytes, "ledger.xlsx");
    if (!r.ok) throw new Error(r.reason);
    expect(r.format).toBe("excel");
    const u = understandDocument(r, "accounting_ledger", []);
    expect(u.route?.subtype).toBe("ledger_export");
    expect(u.route?.reader).toMatch(/SheetJS/);
    expect(u.tables[0].questions).toEqual([]);
    expect(u.tables[0].via).toBe("semantic");
    expect(u.normalized).toHaveLength(2);
    expect(u.tables[0].decisions.filter((d) => d.concept).map((d) => d.concept)).toEqual(expect.arrayContaining(["transaction_date", "reference", "supplier", "vat_amount", "gross_amount"]));
  });
});

// Regression (found 04.10): in a Morning expenses export "סכום כולל מע״מ" is the original-currency total and a plain
// "סכום כולל" is the shekel-converted total — the plain header must not compete with the gross amount and create a question.
describe("ambiguous total headers in a known export", () => {
  it("'סכום כולל מע״מ' beside a plain 'סכום כולל' stays understood without a question", () => {
    const body = `מספר המסמך,תאריך המסמך,סוג המסמך,ספק,סכום כולל מע״מ,מטבע,סכום כולל\n87,16/01/2025,קבלה,ספק א,45,USD,163.13\n88,17/01/2025,חשבונית מס,ספק ב,118,ILS,118\n`;
    const u = understandDocument(csv(body), "business_expense_export", []);
    expect(u.tables[0].questions).toEqual([]);
    expect(u.tables[0].decisions.find((d) => d.header === "סכום כולל מע״מ")?.concept).toBe("gross_amount");
  });
});

// DI-2 (bank-pdf-acceptance): a current-account movements report (synthetic replica of the layout — no personal data).
// Header cells are separate PDF items close together; "זכות/חובה" is ONE signed amount column (minus = debit); the
// value date appears only when it differs; the stated current balance carries its own date.
describe("bank PDF movements report — transactions, not raw lines", () => {
  const f = (str: string, x: number, width: number): PdfItem => ({ str, x, width, fontSize: 11 });
  const report = (): ReadSheet => {
    const lines: PdfItem[][] = [
      [f("תנועות בחשבון מתאריך 28/09/2025 עד 28/09/2026", 308, 231)],
      [f("תאריך", 510, 27), f("תאריך ערך", 424, 47), f("סוג תנועה", 370, 43), f("זכות/חובה", 256, 44), f('יתרה בש"ח', 182, 49), f("אסמכתה", 116, 38)],
      [f("יתרה נוכחית נכון ל -", 436, 101), f("28/09/2026", 364, 65), f("1,998.35 ₪-", 277, 69)],
      [f("תנועות אחרונות", 452, 85)],
      [f("18/09/2026", 487, 50), f("17/09/2026", 423, 40), f("פיגור הלואה", 314, 99), f("650.88-", 266, 34), f("401601", 121, 33)],
      [f("17/09/2026", 487, 50), f("זיכוי מידי", 342, 71), f("590.00", 270, 31), f("1,791.45-", 190, 42), f("5708", 132, 22)],
      [f("Monday, 28 September 2026", 400, 120), f("עמוד 1 מתוך 25", 78, 54)], // page footer — must not become the row's value date
      [f("יתרה קודמת נכון ל- 16/09/2026 :", 420, 120), f("2,381.45-", 190, 42)], // a stated opening balance — a fact, not row content
    ];
    const ys = [569, 541, 513, 366, 338, 224, 60, 40];
    return { name: "page", rows: lines.map((l) => buildLineCells(l)), positions: lines, locators: lines.map((_, i) => ({ page: 1, y: ys[i] })) };
  };
  it("understands the table without a question and produces signed transactions with value dates", () => {
    const u = understandDocument({ ok: true, format: "pdf", meta: {}, sheets: [report()] }, "bank_statement", []);
    expect(u.tables.flatMap((t) => t.questions)).toEqual([]);
    expect(u.route?.subtype).toBe("current_account_transaction_statement");
    const rows = u.normalized.map((n) => ({ date: n.values.transaction_date?.iso, value: n.values.value_date?.iso ?? null, desc: n.originals.description }));
    expect(rows).toEqual([
      { date: "2026-09-18", value: "2026-09-17", desc: "פיגור הלואה" },
      { date: "2026-09-17", value: null, desc: "זיכוי מידי" },
    ]);
    expect(u.normalized.map((n) => n.values.amount?.minor)).toEqual(["-65088", "59000"]);
    expect(u.normalized.every((n) => n.issues.length === 0)).toBe(true);
  });
  it("reads the stated current balance with its own date as a reported balance", () => {
    const u = understandDocument({ ok: true, format: "pdf", meta: {}, sheets: [report()] }, "bank_statement", []);
    expect(u.bankBalance).toMatchObject({ minor: "-199835", currency: "ILS", asOf: "2026-09-28" });
  });
});

// DI-2 stage B: a monthly bank statement (synthetic replica of the layout — no personal data). Day-month dates whose
// year comes from the stated period; the date printed once per day; date + value date glued in one cell; a value date
// alone that is earlier than the day's date; an opening-balance line inside the table.
describe("bank PDF monthly statement — date carried per day, year from the stated period", () => {
  const f = (str: string, x: number, width: number): PdfItem => ({ str, x, width, fontSize: 9.1 });
  const statement = (): ReadSheet => {
    const lines: PdfItem[][] = [
      [f("₪ 36167", 358, 35)], // the summary chart on page 1 states the currency — the table itself does not
      [f("התקופה שבין 01/01/26 - 30/01/26 כוללת 2 דפי חשבון.", 200, 300)],
      [f("פעולה", 524, 25), f("תאריך/ת.ערך", 435, 53), f("תיאור פעולה", 340, 50), f("אסמכתה", 226, 35), f("זכות (-)חובה", 139, 48), f("יתרה", 75, 20)],
      [f("יתרה קודמת", 345, 44), f("797.62-", 64, 31)],
      [f("01.01", 464, 23), f("ריבית", 349, 40), f("55555555", 220, 41), f("1.80", 169, 18)],
      [f("עמלת מסלול", 343, 46), f("1", 255, 5), f("-10.00", 161, 25), f("805.82-", 64, 31)],
      [f("02.0101.01", 442, 45), f("החזר עמלה", 302, 87), f("1", 255, 5), f("10.00", 164, 23)],
      [f("01.01", 464, 23), f("החזר עמלה", 302, 87), f("25", 250, 10), f("44.00", 164, 23), f("751.82-", 64, 31)],
      [f("05.01", 464, 23), f("זיכוי - בנק", 322, 67), f("99010", 235, 25), f("590.00", 158, 28), f("161.82-", 64, 31)],
      [f("הכנסות", 500, 30), f("משיכת מזומנים", 380, 60), f("העברה בנקאית", 60, 50)], // chart legend after the table
    ];
    const ys = [638, 438, 399, 374, 350, 325, 175, 150, 125, 100];
    return { name: "page", rows: lines.map((l) => buildLineCells(l)), positions: lines, locators: lines.map((_, i) => ({ page: 1, y: ys[i] })) };
  };
  it("produces one transaction per movement line with the right dates, value dates and signed amounts", () => {
    const u = understandDocument({ ok: true, format: "pdf", meta: {}, sheets: [statement()] }, "bank_statement", []);
    expect(u.tables.flatMap((t) => t.questions)).toEqual([]);
    expect(u.normalized.map((n) => [n.values.transaction_date?.iso, n.values.value_date?.iso ?? null, n.values.amount?.minor, n.originals.description])).toEqual([
      ["2026-01-01", null, "180", "ריבית"],
      ["2026-01-01", null, "-1000", "עמלת מסלול"],
      ["2026-01-02", "2026-01-01", "1000", "החזר עמלה"],
      ["2026-01-02", "2026-01-01", "4400", "החזר עמלה"],
      ["2026-01-05", null, "59000", "זיכוי - בנק"],
    ]);
  });
  it("end-of-day balances reconcile from the stated opening balance's day onward, and the opening balance is not a transaction", () => {
    const u = understandDocument({ ok: true, format: "pdf", meta: {}, sheets: [statement()] }, "bank_statement", []);
    expect(u.normalized.some((n) => n.originals.description?.includes("יתרה קודמת"))).toBe(false);
    const v = verifyRows(u.normalized, u.family!, u.adapterFor.get(0)!, null);
    expect(v.checks.find((c) => c.code === "balance_continuity")?.status).toBe("passed");
    expect(u.normalized.every((n) => n.issues.length === 0)).toBe(true); // "161.82-" + a legend word must not become one cell
  });
});
