// Expense type of a business expense from the owner's dictionary (green_invoice_expense_types; migration 027).
// Deterministic identification only (owner's guideline, dictionary doc "הנחיות למפתחים" 1–2): the type name printed in the
// Morning export must equal a row's name or alias exactly (spacing aside); a name that appears under several account keys
// is decided only by the account key in the file. A sub-type (source alldent_split) never comes from a file, and a
// general / composite / needs-review type is not a final classification. Everything else goes to the review queue with
// its candidates — nothing is guessed. Rates are not decided here: they are read only from the view, and only when fixed.

export type ExpenseTypeEntry = {
  code: string; name: string; aliases: string[]; accountKey: number; source: string;
  hasParent: boolean; needsReview: boolean; nameIsAmbiguous: boolean; active: boolean;
};
export type ExpenseTypeReason =
  | "expense_type_missing" | "expense_type_unknown" | "expense_type_ambiguous" | "expense_type_key_mismatch"
  | "expense_type_needs_review" | "expense_type_conflicting_lines";
export type ExpenseTypeMatch = { status: "matched"; code: string } | { status: "review"; reason: ExpenseTypeReason; candidates: string[] };

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

export function matchExpenseType(input: { name: string | null; accountKey: string | null; conflict?: boolean }, dict: ExpenseTypeEntry[]): ExpenseTypeMatch {
  const review = (reason: ExpenseTypeReason, candidates: string[] = []): ExpenseTypeMatch => ({ status: "review", reason, candidates });
  if (input.conflict) return review("expense_type_conflicting_lines");
  const name = input.name ? norm(input.name) : "";
  if (!name) return review("expense_type_missing");
  const named = dict.filter((d) => d.active && d.source === "green_invoice" && !d.hasParent && (norm(d.name) === name || d.aliases.some((a) => norm(a) === name)));
  if (!named.length) return review("expense_type_unknown");
  const codes = named.map((d) => d.code).sort();
  const key = input.accountKey && /^\d+$/.test(input.accountKey.trim()) ? Number(input.accountKey.trim()) : null;
  let chosen: ExpenseTypeEntry;
  if (key !== null) {
    const byKey = named.filter((d) => d.accountKey === key);
    if (byKey.length !== 1) return review(byKey.length ? "expense_type_ambiguous" : "expense_type_key_mismatch", codes);
    chosen = byKey[0];
  } else {
    if (named.length > 1 || named.some((d) => d.nameIsAmbiguous)) return review("expense_type_ambiguous", codes);
    chosen = named[0];
  }
  if (chosen.needsReview) return review("expense_type_needs_review", [chosen.code]);
  return { status: "matched", code: chosen.code };
}
