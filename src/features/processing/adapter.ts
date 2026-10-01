import { headerKey, type DateFormat } from "./normalize";

// Source Adapter (chapter 5 §20; Stage 3 D5): created only from real material — the column mapping Tzeela approves on a
// file she uploaded (21D §12 Import Mapping). It holds structural hints (header row, header signature), the approved
// column → concept map, the approved meaning of coded values (direction / status / document type) and the date format.
// It improves accuracy but never replaces the engine and never decides canonical truth by itself.

export type DocumentRole = "tax_invoice" | "invoice_receipt" | "receipt" | "transaction_invoice" | "credit_note" | "other";
export type AmountSign = "signed_negative_is_debit" | "signed_positive_is_debit" | "unsigned_use_direction";
export type PaymentMethodMeaning = "balance" | "credit_card" | "bank_account" | "cash" | "other";

export type AdapterColumn = { index: number; header: string; concept: string | null };
export type Adapter = {
  id: string;
  version: string;
  sourceType: string;
  signature: string;
  headerRow: number; // 1-based row number inside the sheet
  columns: AdapterColumn[];
  dateFormat: DateFormat;
  amountSign: AmountSign;
  /** currency stated by the user for a file that has no currency column; null = currency unknown */
  currencyDefault: string | null;
  values: {
    direction?: Record<string, "debit" | "credit">;
    status?: Record<string, "executed" | "not_executed">;
    documentRole?: Record<string, DocumentRole>;
    paymentMethod?: Record<string, PaymentMethodMeaning>;
  };
};

/** Header signature: the normalized non-empty header cells in order. Identical exports produce the same signature. */
export function headerSignature(headerCells: string[]): string {
  return headerCells.map((h) => headerKey(h)).filter(Boolean).join("|");
}

export function columnOf(adapter: Adapter, concept: string): number | undefined {
  return adapter.columns.find((c) => c.concept === concept)?.index;
}

/** Document roles counted as income / expense (chapter 9 §5–§6, §9–§10: a receipt or transaction invoice of an invoiced
 *  deal is not a second event; a credit note corrects the original event and is never new income or a normal expense). */
export const COUNTED_ROLES: Record<"income" | "expense", DocumentRole[]> = {
  income: ["tax_invoice", "invoice_receipt"],
  expense: ["tax_invoice", "invoice_receipt", "receipt"],
};

export const DOCUMENT_ROLE_LABELS: Record<DocumentRole, string> = {
  tax_invoice: "חשבונית מס",
  invoice_receipt: "חשבונית מס / קבלה",
  receipt: "קבלה",
  transaction_invoice: "חשבון עסקה / אישור תשלום (לא חשבונית מס)",
  credit_note: "חשבונית זיכוי",
  other: "אחר",
};
