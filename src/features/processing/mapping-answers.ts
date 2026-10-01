import type { Adapter, AmountSign, DocumentRole } from "./adapter";
import type { Question } from "./semantic";

// Mapping answers (chapter 5 §21 "Mapping הוא fallback רק למה שבאמת עמום"; 21D §12). The semantic engine already
// proposed everything it could; Tzeela answers only its open questions. The answers complete the proposal into an
// approved Source Adapter — the proposal itself is never silently changed beyond what was answered.

export type MappingAnswer =
  | { kind: "column"; column: number | null; concept: string | null }
  | { kind: "values"; map: Record<string, string> }
  | { kind: "currency"; currency: string | null }
  | { kind: "sign"; sign: AmountSign }
  | { kind: "document_role_all"; role: DocumentRole };

const VALUE_KEY = { direction: "direction", status: "status", document_type: "documentRole", payment_method: "paymentMethod" } as const;

/** Which questions still have no complete answer (answers are by question index). */
export function unanswered(questions: Question[], answers: Record<number, MappingAnswer | undefined>): number[] {
  return questions.flatMap((q, i) => {
    const a = answers[i];
    if (!a || a.kind !== q.kind) return [i];
    if (q.kind === "values" && a.kind === "values") return q.unknown.every((v) => a.map[v]) ? [] : [i];
    if (q.kind === "column" && a.kind === "column") {
      if (q.columns.length > 1) return a.column !== null && q.columns.includes(a.column) ? [] : [i]; // one concept, several columns
      if (q.reason === "required_missing") return []; // a column, or "not in this file"
      return a.concept === null || q.candidates.includes(a.concept) ? [] : [i];
    }
    return [];
  });
}

/** Applies the answers onto the semantic proposal. Pure. */
export function applyAnswers(proposed: Adapter, questions: Question[], answers: Record<number, MappingAnswer | undefined>): Adapter {
  const a: Adapter = { ...proposed, columns: proposed.columns.map((c) => ({ ...c })), values: { ...proposed.values } };
  const setConcept = (column: number, concept: string | null) => {
    if (concept) for (const c of a.columns) if (c.concept === concept) c.concept = null;
    const col = a.columns.find((c) => c.index === column);
    if (col) col.concept = concept;
  };
  questions.forEach((q, i) => {
    const ans = answers[i];
    if (!ans || ans.kind !== q.kind) return;
    if (q.kind === "column" && ans.kind === "column") {
      if (q.columns.length > 1) { for (const c of q.columns) if (c !== ans.column) setConcept(c, null); if (ans.column !== null) setConcept(ans.column, q.concept ?? null); }
      else if (q.reason === "required_missing") { if (ans.column !== null) setConcept(ans.column, ans.concept ?? q.concept ?? null); }
      else setConcept(q.columns[0], ans.concept);
    } else if (q.kind === "values" && ans.kind === "values") {
      const key = VALUE_KEY[q.concept];
      a.values = { ...a.values, [key]: { ...((a.values[key] as Record<string, string> | undefined) ?? {}), ...ans.map } };
    } else if (q.kind === "currency" && ans.kind === "currency") {
      a.currencyDefault = ans.currency; a.currencyFromSymbols = false;
    } else if (q.kind === "sign" && ans.kind === "sign") {
      a.amountSign = ans.sign;
    } else if (q.kind === "document_role_all" && ans.kind === "document_role_all") {
      a.values = { ...a.values, documentRoleDefault: ans.role };
    }
  });
  return a;
}
