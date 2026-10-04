import type { Family } from "./families";

// Processing route (chapter 6; readiness skill-routing.md §5; family matrix §1 A/B): per file — the document subtype or an
// explicit "undetermined", the reader that ran, that OCR was not used on a digital file, and which chapter-6 skill rule
// sets were applied and why the others were not. The skills are deterministic rule sets in code; none writes canonical
// truth. Reconciliation never runs inside the understanding of a single file (it runs across sources after promotion).

export type SkillUse = { skill: string; applied: boolean; reason: string };
export type ProcessingRoute = { subtype: string; subtypeBasis: string; reader: string; ocr: string; skills: SkillUse[] };
export type RouteFacts = { format: "csv" | "excel" | "pdf"; rows: number; /** tables found, including ones still waiting on a question */ tables: number; facts: number; factsAsOf: string | null; documentAdapter: boolean; side: "income" | "expense" | null };

const READER = { csv: "CSV reader (UTF-8 / UTF-16 / Windows-1255)", excel: "SheetJS 0.20.3 (cells, types, formulas)", pdf: "unpdf (digital text layer with positions)" };
const MOVEMENTS = new Set(["bank_documents", "credit_card_documents", "payment_apps"]);
const BUSINESS = new Set(["green_invoice_morning", "receipts_invoices"]);

function subtypeOf(family: Family, f: RouteFacts): { subtype: string; basis: string } {
  switch (family.code) {
    case "bank_documents":
      if (f.rows > 0) return { subtype: "current_account_transaction_statement", basis: "a transaction table was understood" };
      if (f.tables > 0) return { subtype: "current_account_transaction_statement", basis: "a transaction table was found; open questions remain" };
      if (f.facts > 0 && f.factsAsOf) return { subtype: "annual_summary_report", basis: `stated facts as of ${f.factsAsOf}, no transaction table` };
      return { subtype: "undetermined", basis: "neither a transaction table nor dated facts were found" };
    case "credit_card_documents":
      if (f.documentAdapter) return { subtype: "monthly_statement", basis: "recognised issuer statement" };
      return f.format === "pdf" ? { subtype: "pdf_transaction_table", basis: "transaction table in a digital PDF" } : { subtype: "transaction_export", basis: `${f.format} export` };
    case "payment_apps":
      return { subtype: "transaction_export", basis: `${f.format} export` };
    case "green_invoice_morning":
    case "receipts_invoices": {
      const side = f.side === "income" ? "income" : f.side === "expense" ? "expenses" : "documents";
      return { subtype: `${side}_${f.format === "pdf" ? "pdf_report" : "export"}`, basis: `source context (${side}), ${f.format}` };
    }
    case "accounting_documents":
      return { subtype: "ledger_export", basis: `${f.format} bookkeeping export` };
    default:
      return { subtype: "undetermined", basis: "no subtype rules for this family yet" };
  }
}

export function routeOf(family: Family, f: RouteFacts): ProcessingRoute {
  const st = subtypeOf(family, f);
  const movement = MOVEMENTS.has(family.code), business = BUSINESS.has(family.code);
  return {
    subtype: st.subtype, subtypeBasis: st.basis, reader: READER[f.format], ocr: "not used — digital text / cell layer",
    skills: [
      { skill: "israeli-bank-connector", applied: movement && f.rows > 0, reason: !movement ? "not a bank / card / payment-app document" : f.rows > 0 ? "dates, direction, amounts and balances normalized" : "no understood movement rows" },
      { skill: "israeli-bank-reconciliation", applied: false, reason: "runs after promotion, across sources only" },
      { skill: "green-invoice", applied: family.code === "green_invoice_morning" && f.rows > 0, reason: family.code === "green_invoice_morning" ? "Morning document type codes and payment semantics" : "not a Morning export" },
      { skill: "il-invoice-organizer", applied: business && f.rows > 0, reason: business ? "document roles: receipt / credit note / payment approval are not counted" : "not an invoice / receipt document" },
      { skill: "israeli-receipt-scanner", applied: false, reason: "only for scanned or photographed documents" },
      { skill: "israeli-expense-categorizer", applied: false, reason: "no category is inferred in Route A" },
    ],
  };
}
