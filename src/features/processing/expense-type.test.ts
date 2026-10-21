import { describe, it, expect } from "vitest";
import { matchExpenseType, type ExpenseTypeEntry } from "./expense-type";
import { headerCandidates } from "./semantic";

// Owner's guideline (dictionary doc §"הנחיות למפתחים" 1–2): exact name or alias of an active row; an ambiguous name is
// decided only by the account key from the file; otherwise review. Sub-types are never chosen automatically; a general /
// composite / needs-review type is never a final classification. Nothing is guessed.
const row = (p: Partial<ExpenseTypeEntry> & Pick<ExpenseTypeEntry, "code" | "name" | "accountKey">): ExpenseTypeEntry =>
  ({ aliases: [], source: "green_invoice", hasParent: false, needsReview: false, nameIsAmbiguous: false, active: true, ...p });
const dict: ExpenseTypeEntry[] = [
  row({ code: "3540:שירותים מקצועיים", name: "שירותים מקצועיים", accountKey: 3540 }),
  row({ code: "1390:תוכנה", name: "תוכנה", accountKey: 1390, aliases: ["תוסף"], nameIsAmbiguous: true }),
  row({ code: "3680:תוכנה", name: "תוכנה", accountKey: 3680, nameIsAmbiguous: true }),
  row({ code: "3680:הוצאות משרדיות", name: "הוצאות משרדיות", accountKey: 3680, aliases: ["משרדיות"] }),
  row({ code: "1390:כללי", name: "כללי", accountKey: 1390, needsReview: true }),
  row({ code: "3515:ביטוחים", name: "ביטוחים", accountKey: 3515, needsReview: true }),
  row({ code: "3515:ביטוחים - רכב", name: "ביטוחים - רכב", accountKey: 3515, source: "alldent_split", hasParent: true }),
  row({ code: "3600:ישן", name: "ישן", accountKey: 3600, active: false }),
];

describe("matchExpenseType", () => {
  it("an exact name of a final type is matched", () => {
    expect(matchExpenseType({ name: "שירותים מקצועיים", accountKey: null }, dict)).toEqual({ status: "matched", code: "3540:שירותים מקצועיים" });
  });
  it("spacing differences do not matter; an alias is matched to its row", () => {
    expect(matchExpenseType({ name: "  שירותים   מקצועיים ", accountKey: null }, dict)).toMatchObject({ status: "matched" });
    expect(matchExpenseType({ name: "משרדיות", accountKey: null }, dict)).toEqual({ status: "matched", code: "3680:הוצאות משרדיות" });
  });
  it("an ambiguous name without an account key goes to review with its candidates", () => {
    expect(matchExpenseType({ name: "תוכנה", accountKey: null }, dict)).toEqual({ status: "review", reason: "expense_type_ambiguous", candidates: ["1390:תוכנה", "3680:תוכנה"] });
  });
  it("an ambiguous name is decided by the account key from the file", () => {
    expect(matchExpenseType({ name: "תוכנה", accountKey: "3680" }, dict)).toEqual({ status: "matched", code: "3680:תוכנה" });
  });
  it("an account key that matches none of the rows of that name is review, not a guess", () => {
    expect(matchExpenseType({ name: "תוכנה", accountKey: "9999" }, dict)).toEqual({ status: "review", reason: "expense_type_key_mismatch", candidates: ["1390:תוכנה", "3680:תוכנה"] });
    expect(matchExpenseType({ name: "שירותים מקצועיים", accountKey: "1390" }, dict)).toMatchObject({ status: "review", reason: "expense_type_key_mismatch" });
  });
  it("a general or composite type is identified but is not a final classification", () => {
    expect(matchExpenseType({ name: "כללי", accountKey: null }, dict)).toEqual({ status: "review", reason: "expense_type_needs_review", candidates: ["1390:כללי"] });
    expect(matchExpenseType({ name: "ביטוחים", accountKey: "3515" }, dict)).toEqual({ status: "review", reason: "expense_type_needs_review", candidates: ["3515:ביטוחים"] });
  });
  it("an owner sub-type is never chosen from a file; an inactive type is not used", () => {
    expect(matchExpenseType({ name: "ביטוחים - רכב", accountKey: "3515" }, dict)).toMatchObject({ status: "review", reason: "expense_type_unknown" });
    expect(matchExpenseType({ name: "ישן", accountKey: null }, dict)).toMatchObject({ status: "review", reason: "expense_type_unknown" });
  });
  it("an unknown or missing name is review", () => {
    expect(matchExpenseType({ name: "משהו אחר", accountKey: null }, dict)).toEqual({ status: "review", reason: "expense_type_unknown", candidates: [] });
    expect(matchExpenseType({ name: null, accountKey: "3540" }, dict)).toEqual({ status: "review", reason: "expense_type_missing", candidates: [] });
  });
  it("lines of one document that name different types are review", () => {
    expect(matchExpenseType({ name: "שירותים מקצועיים", accountKey: null, conflict: true }, dict)).toEqual({ status: "review", reason: "expense_type_conflicting_lines", candidates: [] });
  });
});

// the owner's Morning expense exports (header rows only): 2025 has "תיאור חשבון הוצאה" + "מפתח חשבון"; 2026 has "חשבון הוצאה"
describe("Morning expense export headers", () => {
  it("the type name and the account key are recognised; 6111 and sort codes are not taken as the key", () => {
    expect(headerCandidates("תיאור חשבון הוצאה")[0]).toMatchObject({ concept: "expense_account", score: 1 });
    expect(headerCandidates("חשבון הוצאה")[0]).toMatchObject({ concept: "expense_account", score: 1 });
    expect(headerCandidates("מפתח חשבון")[0]).toMatchObject({ concept: "accounting_code", score: 1 });
    expect(headerCandidates("קוד 6111").some((c) => c.concept === "accounting_code")).toBe(false);
    expect(headerCandidates("קוד מיון").some((c) => c.concept === "accounting_code")).toBe(false);
  });
});
