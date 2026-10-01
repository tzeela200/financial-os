import { describe, it, expect } from "vitest";
import { parseCalStatement, checkCalTotals } from "./cal-statement";
import { calArtifacts } from "./cal-pipeline";
import type { ReadSheet } from "../readers-types";

// Synthetic CAL-like statement (made-up values) with item positions, the way the PDF reader returns them.
const it_ = (str: string, right: number, width = 40) => ({ str, x: right - width, width, fontSize: 10 });
function sheet(): ReadSheet {
  const lines: { cells: string[]; items: ReturnType<typeof it_>[] }[] = [
    { cells: ["דף חיוב חודשי ל-16/08/26", "www.cal-online.co.il"], items: [it_("דף חיוב חודשי ל-16/08/26", 560, 120), it_("www.cal-online.co.il", 150, 90)] },
    { cells: ["המסתיים ב-1234 ע\"ש בדיקה"], items: [it_("המסתיים ב-1234 ע\"ש בדיקה", 560, 150)] },
    { cells: ["מסגרת אשראי לכרטיס", "₪ 5,000"], items: [it_("מסגרת אשראי לכרטיס", 560, 100), it_("₪ 5,000", 200)] },
    { cells: ["מועד החיוב הבא הינו: 15/09/2026"], items: [it_("מועד החיוב הבא הינו: 15/09/2026", 560, 150)] },
    { cells: ["פירוט עסקות שנצברו עד ל-16/08/2026"], items: [it_("פירוט עסקות שנצברו עד ל-16/08/2026", 560, 180)] },
    { cells: ["תאריך", "שם בית העסק", "ענף", "פירוט", "כרטיס", "סכום", "סכום"], items: [it_("תאריך", 560, 30), it_("שם בית העסק", 500, 60), it_("ענף", 380, 20), it_("פירוט", 320, 30), it_("כרטיס", 260, 30), it_("סכום", 200, 25), it_("סכום", 120, 25)] },
    { cells: ["העסקה", "חיוב"], items: [it_("העסקה", 560, 30), it_("חיוב", 120, 25)] },
    { cells: ["15/07/2026", "ספק בדיקה", "תקשורת", "הוראת קבע", "לא", "₪ 100.00", "₪ 100.00"], items: [it_("15/07/2026", 560, 50), it_("ספק בדיקה", 500, 50), it_("תקשורת", 380, 30), it_("הוראת קבע", 320, 40), it_("לא", 260, 10), it_("₪ 100.00", 200, 40), it_("₪ 100.00", 120, 40)] },
    { cells: ["הערת המשך לעסקה"], items: [it_("הערת המשך לעסקה", 500, 80)] },
    { cells: ["16/07/2026", "חנות שנייה", "שונות", "₪ -20.00", "₪ -20.00", "פרסומת בצד"], items: [it_("16/07/2026", 560, 50), it_("חנות שנייה", 500, 50), it_("שונות", 380, 30), it_("₪ -20.00", 200, 40), it_("₪ -20.00", 120, 40), it_("פרסומת בצד", 40, 30)] },
    { cells: ["סה\"כ לתאריך 16/08/26 ₪ 80.00"], items: [it_("סה\"כ לתאריך 16/08/26 ₪ 80.00", 300, 200)] },
  ];
  return { name: "", rows: lines.map((l) => l.cells), positions: lines.map((l) => l.items), locators: lines.map(() => ({ page: 1 })) };
}

describe("CAL statement adapter (chapter 5 §7, §20)", () => {
  const st = parseCalStatement(sheet())!;
  it("understands the document: card, statement date, credit limit, next charge date", () => {
    expect(st).not.toBeNull();
    expect(st.cardLast4).toBe("1234");
    expect(st.statementDate).toBe("2026-08-16");
    expect(st.creditLimit).toEqual({ minor: "500000", currency: "ILS" });
    expect(st.nextChargeDate).toBe("2026-09-15");
  });
  it("extracts transactions by the header column positions; side columns are ignored; continuation lines become notes", () => {
    expect(st.transactions).toHaveLength(2);
    expect(st.transactions[0]).toMatchObject({ transactionDate: "2026-07-15", supplier: "ספק בדיקה", category: "תקשורת", details: "הוראת קבע", chargeDate: "2026-08-16", chargeAmount: { minor: "10000", currency: "ILS" }, notes: ["הערת המשך לעסקה"] });
    expect(st.transactions[1]).toMatchObject({ supplier: "חנות שנייה", chargeAmount: { minor: "-2000", currency: "ILS" } });
  });
  it("charges add up to the statement total (completeness check)", () => {
    expect(checkCalTotals(st)).toEqual([{ chargeDate: "2026-08-16", total: "8000", sum: "8000", ok: true, missingAmounts: 0 }]);
  });
  it("feeds the shared pipeline: every row stored, transactions normalized with charge date, totals check passed", () => {
    const a = calArtifacts(sheet(), st);
    expect(a.extraction.records).toHaveLength(11);
    expect(a.normalized.map((n) => [n.values.charge_amount?.minor, n.values.charge_date?.iso, n.originals.description])).toEqual([["10000", "2026-08-16", "ספק בדיקה"], ["-2000", "2026-08-16", "חנות שנייה"]]);
    expect(a.checks[0].status).toBe("passed");
  });
  it("a statement that is not CAL is not claimed by this adapter", () => {
    expect(parseCalStatement({ name: "", rows: [["דף בנק"]], positions: [[]] })).toBeNull();
  });
});
