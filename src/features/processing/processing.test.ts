import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseAmountMinor, parseAmount, parseDate, isValidIsraeliTaxId, currencyCode } from "./normalize";
import { parseDelimited, decodeText, readTabular } from "./tabular";
import { readSource } from "./readers";
import { extractStructured, proposeHeaderRow } from "./extract";
import { headerSignature, type Adapter } from "./adapter";
import { normalizeRows } from "./normalize-step";
import { verifyRows, signedMinor } from "./validate";
import { planPromotion } from "./promote";
import { FAMILIES, familyForSource } from "./families";
import { CONCEPTS } from "./concepts";

// Synthetic fixtures only (no personal data).

const adapterFor = (headers: string[], over: Partial<Adapter>): Adapter => ({
  id: "00000000-0000-0000-0000-000000000001", version: "1", sourceType: "bank_statement", signature: headerSignature(headers), headerRow: 1,
  columns: [], dateFormat: "dmy", amountSign: "signed_negative_is_debit", currencyDefault: "ILS", values: {}, ...over,
});

describe("normalize (18B §6.2)", () => {
  it("amounts to agorot; extra precision is reported, never rounded", () => {
    expect(parseAmountMinor("1,234.56")).toBe("123456");
    expect(parseAmountMinor("1,234.56-")).toBe("-123456");
    expect(parseAmountMinor("(80.00)")).toBe("-8000");
    expect(parseAmountMinor("₪ 67")).toBe("6700");
    expect(parseAmountMinor("")).toBeNull();
    expect(parseAmount("123.45000000000001")).toEqual({ ok: false, reason: "precision" });
  });
  it("dates are day-first; a two-digit year needs the adapter's explicit rule", () => {
    expect(parseDate("15.09.2026")?.iso).toBe("2026-09-15");
    expect(parseDate("02.01.25")).toBeNull();
    expect(parseDate("02.01.25", "dmy_two_digit_year_20")?.iso).toBe("2025-01-02");
    expect(parseDate("31/02/2026")).toBeNull();
  });
  it("osek number structure and currency codes", () => {
    expect(isValidIsraeliTaxId("514682350")).toBe(true);
    expect(isValidIsraeliTaxId("514682351")).toBe(false);
    expect(currencyCode("ש\"ח")).toBe("ILS");
    expect(currencyCode("XYZ")).toBe("XYZ");
    expect(currencyCode("שקלים")).toBeNull();
  });
});

describe("readers (chapter 5 §21)", () => {
  it("CSV: quoted fields, embedded newlines, delimiter and Windows-1255", () => {
    expect(parseDelimited('a,b\n"x, y","l1\nl2"\n')).toEqual([["a", "b"], ["x, y", "l1\nl2"]]);
    expect(decodeText(new Uint8Array([0xfa, 0xe0, 0xf8, 0xe9, 0xea])).text).toBe("תאריך");
    const r = readTabular(new TextEncoder().encode("a;b\n1;2"), "f.csv");
    expect(r.ok && r.meta.delimiter).toBe(";");
  });
  it("Excel through SheetJS: sheets, dates, numbers and formulas", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["תאריך", "תיאור", "סכום"], [new Date(Date.UTC(2026, 8, 1)), "קניה", -50.5], [null, "סה\"כ", { f: "C2" }]], { cellDates: true });
    ws.C3 = { t: "n", v: -50.5, f: "C2" };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "תנועות");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const r = await readSource(bytes, "bank.xlsx");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.format).toBe("excel");
    expect(r.sheets[0].name).toBe("תנועות");
    expect(r.sheets[0].rows[1]).toEqual(["2026-09-01", "קניה", "-50.5"]);
    expect(r.sheets[0].cellMeta?.[2]?.[2]).toMatchObject({ type: "n", formula: "C2" });
  });
  it("digital PDF: text layer rebuilt into rows with the page kept", async () => {
    const r = await readSource(minimalPdf(["Date Amount Description", "01/09/2026 -50.00 Coffee shop purchase"]), "s.pdf");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.format).toBe("pdf");
    expect(r.sheets[0].locators?.[0]?.page).toBe(1);
    expect(r.sheets[0].rows.map((x) => x.join(" "))).toEqual(expect.arrayContaining([expect.stringContaining("Coffee")]));
  });
  it("images and PDFs without text are sent to visual reading, never read as 'no data'", async () => {
    expect(await readSource(new Uint8Array([1, 2, 3]), "scan.jpg")).toMatchObject({ ok: false, reason: "visual_reading_required" });
  });
});

describe("extraction without an approved adapter (D5)", () => {
  const rows = [["דוח לדוגמה"], ["תאריך", "תיאור", "סכום", "קוד"], ["01/09/2026", "משכורת", "100", "A"], ["02/09/2026", "שכירות", "-40", "B"], ["הערה בסוף"]];
  it("proposes a header row but maps nothing: every column is needs_mapping", () => {
    expect(proposeHeaderRow(rows)).toBe(2);
    const x = extractStructured([{ name: "", rows }], []);
    expect(x.needsMapping).toBe(true);
    expect(x.records.map((r) => r.kind)).toEqual(["metadata", "header", "data", "data", "note"]);
    expect(x.records[2].observations.every((o) => o.concept === null)).toBe(true);
  });
  it("a column like 'תאריך לידה' is never assigned by itself", () => {
    const x = extractStructured([{ name: "", rows: [["תאריך לידה", "שם"], ["01/01/1990", "דנה"]] }], []);
    expect(x.records[1].observations.every((o) => o.concept === null)).toBe(true);
  });
});

describe("bank file with an approved adapter: extract → normalize → verify → promote", () => {
  const headers = ["תאריך", "תיאור", "חובה", "זכות", "יתרה", "קוד"];
  const rows = [headers, ["01/09/2026", "משכורת", "", "10,000.00", "10,500.00", "x"], ["02/09/2026", "שכירות", "4,000.00", "", "6,500.00", "y"], ["03/09/2026", "סופר", "67.00", "", "6,433.00", ""]];
  const adapter = adapterFor(headers, { columns: [
    { index: 0, header: "תאריך", concept: "transaction_date" }, { index: 1, header: "תיאור", concept: "description" },
    { index: 2, header: "חובה", concept: "debit_amount" }, { index: 3, header: "זכות", concept: "credit_amount" },
    { index: 4, header: "יתרה", concept: "balance" }, { index: 5, header: "קוד", concept: null }] });
  const x = extractStructured([{ name: "", rows }], [adapter]);
  const norm = normalizeRows(x.records, adapter);
  const v = verifyRows(norm, FAMILIES.bank_documents, adapter, null);

  it("uses the adapter only when the header signature matches; unknown column stays unmapped", () => {
    expect(x.adapterId).toBe(adapter.id);
    expect(x.records[1].observations.find((o) => o.header === "קוד")?.concept).toBeNull();
    expect(extractStructured([{ name: "", rows: [["אחר", "כותרת"], ...rows.slice(1)] }], [adapter]).adapterId).toBeNull();
  });
  it("normalizes with originals kept and signs from the approved columns", () => {
    expect(norm[0].values.credit_amount).toEqual({ minor: "1000000", currency: "ILS" });
    expect(norm[0].originals.credit_amount).toBe("10,000.00");
    expect(signedMinor(norm[1], adapter)).toBe(-400000n);
  });
  it("balance continuity passes; a gap is flagged, not fixed", () => {
    expect(v.checks.find((c) => c.code === "balance_continuity")?.status).toBe("passed");
    const broken = normalizeRows(extractStructured([{ name: "", rows: rows.map((r, i) => (i === 3 ? [...r.slice(0, 4), "6,000.00", ""] : r)) }], [adapter]).records, adapter);
    expect(verifyRows(broken, FAMILIES.bank_documents, adapter, null).checks.find((c) => c.code === "balance_continuity")?.status).toBe("warned");
  });
  it("promotes complete rows to transactions of one account, unmatched", () => {
    const plan = planPromotion(norm, FAMILIES.bank_documents, adapter, v, null);
    expect(plan.accountType).toBe("checking");
    expect(plan.transactions.map((t) => [t.direction, t.amountMinor])).toEqual([["credit", "1000000"], ["debit", "400000"], ["debit", "6700"]]);
    expect(plan.transactions[2].balanceAfterMinor).toBe("643300");
  });
  it("identical lines in one file are two events; the same file again yields the same keys", () => {
    const dup = [headers, rows[3], rows[3]];
    const a = normalizeRows(extractStructured([{ name: "", rows: dup }], [adapter]).records, adapter);
    const p1 = planPromotion(a, FAMILIES.bank_documents, adapter, verifyRows(a, FAMILIES.bank_documents, adapter, null), null);
    const p2 = planPromotion(a, FAMILIES.bank_documents, adapter, verifyRows(a, FAMILIES.bank_documents, adapter, null), null);
    expect(new Set(p1.transactions.map((t) => t.key)).size).toBe(2);
    expect(p1.transactions.map((t) => t.key)).toEqual(p2.transactions.map((t) => t.key));
  });
});

describe("payment app: approved meanings of direction, status, funding and two-digit years (§8)", () => {
  const headers = ["סטטוס", "תיאור", "סכום", "אמצעי תשלום", "זיכוי/חיוב", "מאת/ל", "תאריך"];
  const rows = [headers, ["בוצע", "מתנה", "100", "כרטיס אשראי", "חיוב", "דנה", "02.01.25"], ["בוצע", "החזר", "40", "יתרה", "זיכוי", "יוסי", "03.01.25"], ["נכשל", "ניסיון", "70", "יתרה", "חיוב", "רון", "04.01.25"], ["בוצע", "שורה שבורה"]];
  const adapter = adapterFor(headers, {
    sourceType: "p2p_payment", amountSign: "unsigned_use_direction", dateFormat: "dmy_two_digit_year_20",
    columns: headers.map((h, i) => ({ index: i, header: h, concept: ["status", "description", "amount", "payment_method", "direction", "counterparty", "transaction_date"][i] })),
    values: { direction: { "חיוב": "debit", "זיכוי": "credit" }, status: { "בוצע": "executed", "נכשל": "not_executed" }, paymentMethod: { "כרטיס אשראי": "credit_card", "יתרה": "balance" } },
  });
  const norm = normalizeRows(extractStructured([{ name: "", rows }], [adapter]).records, adapter);
  const v = verifyRows(norm, FAMILIES.payment_apps, adapter, null);
  const plan = planPromotion(norm, FAMILIES.payment_apps, adapter, v, null);
  it("only executed, complete transfers are promoted; the funding source is kept for reconciliation", () => {
    expect(plan.transactions.map((t) => [t.date, t.direction, t.amountMinor, t.typeCode])).toEqual([["2025-01-02", "debit", "10000", "funded_by:credit_card"], ["2025-01-03", "credit", "4000", "funded_by:balance"]]);
    expect(plan.notPromoted.map((n) => n.reasons[0])).toEqual(expect.arrayContaining(["not_executed", "missing:transaction_date"]));
  });
});

describe("business documents (chapter 9 §5–§10)", () => {
  const headers = ["מספר", "סוג", "תאריך", "לקוח", "לפני מעמ", "מעמ", "סהכ", "מטבע"];
  const rows = [headers,
    ["1", "305", "01/09/2026", "לקוח א", "100", "18", "118", "ILS"],
    ["1", "305", "01/09/2026", "לקוח א", "50", "9", "59", "ILS"], // second line of the same invoice
    ["2", "400", "02/09/2026", "לקוח א", "", "", "177", "ILS"], // receipt for invoice 1 — not new income
    ["3", "330", "03/09/2026", "לקוח ב", "-10", "-1.8", "-11.8", "ILS"]];
  const adapter = adapterFor(headers, {
    sourceType: "business_income_export",
    columns: headers.map((h, i) => ({ index: i, header: h, concept: ["document_number", "document_type_code", "document_date", "customer", "net_amount", "vat_amount", "gross_amount", "currency"][i] })),
    values: { documentRole: { "305": "tax_invoice", "400": "receipt", "330": "credit_note" } },
  });
  const norm = normalizeRows(extractStructured([{ name: "", rows }], [adapter]).records, adapter);
  const plan = planPromotion(norm, FAMILIES.green_invoice_morning, adapter, verifyRows(norm, FAMILIES.green_invoice_morning, adapter, "income"), "income");
  it("counts tax invoices once (lines grouped); receipts and credit notes are not new income", () => {
    expect(plan.documents).toHaveLength(1);
    expect(plan.documents[0]).toMatchObject({ grossMinor: "17700", netMinor: "15000", vatMinor: "2700", rowNumbers: [2, 3] });
    expect(plan.notPromoted.flatMap((n) => n.reasons)).toEqual(expect.arrayContaining(["role_not_counted:receipt", "role_not_counted:credit_note"]));
  });
});

describe("registry and families", () => {
  it("every expected concept exists in the registry; no alias lists remain", () => {
    const codes = new Set(CONCEPTS.map((c) => c.code));
    for (const f of Object.values(FAMILIES)) for (const c of f.expected) expect(codes.has(c), `${f.code}:${c}`).toBe(true);
    expect(CONCEPTS.some((c) => "hints" in c)).toBe(false);
  });
  it("government_authority is ambiguous between two families and is not decided silently", () => {
    expect(familyForSource("government_authority")).toBeNull();
    expect(familyForSource("credit_card_statement")?.promotes).toBe("transaction");
  });
});

// ---- a minimal valid PDF with a text layer (synthetic) ----
function minimalPdf(lines: string[]): Uint8Array {
  const content = `BT /F1 12 Tf ${lines.map((l, i) => `1 0 0 1 72 ${720 - i * 20} Tm (${l}) Tj`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
