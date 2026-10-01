import { describe, it, expect } from "vitest";
import { understandTable } from "./semantic";
import { pdfTables, pdfFacts } from "./pdf-tables";
import { buildLineCells, type PdfItem } from "./pdf-lines";
import { understandDocument } from "./understand";
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
