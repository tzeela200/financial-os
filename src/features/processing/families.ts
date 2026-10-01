// Document families (chapter 5 §3; 18B §5.3) and their expected concepts (chapter 5 §6–§11). Family codes are the
// WU-1 / D4 proposal shown to Tzeela (canonical name → proposed code). Expected concepts drive the mapping screen
// choices and the completeness check; they are a minimum, never a ceiling (chapter 5 §5).

export type FamilyCode =
  | "bank_documents" | "credit_card_documents" | "payment_apps" | "receipts_invoices" | "accounting_documents"
  | "green_invoice_morning" | "loans_financing" | "credit_reports" | "tax_documents" | "bituach_leumi_documents"
  | "government_authority_letters" | "local_authority_documents" | "enforcement_collection" | "debt_settlement_documents"
  | "legal_documents" | "assets_savings_rights" | "payment_proofs";

export type Family = {
  code: FamilyCode; label: string; section: string;
  expected: string[];
  /** concepts a row must have before it can become a canonical record (18A §46 via the import path, ADR-007) */
  required: string[];
  /** which canonical entity a complete row can become in Route A; null = extracted only for now (Gap) */
  promotes: "transaction" | "income_or_expense" | null;
};

export const FAMILIES: Record<FamilyCode, Family> = {
  bank_documents: {
    code: "bank_documents", label: "בנק / עו״ש", section: "פרק 5 §6",
    expected: ["transaction_date", "value_date", "description", "amount", "debit_amount", "credit_amount", "direction", "balance", "reference", "counterparty", "fee_amount", "currency", "note"],
    required: ["transaction_date"], promotes: "transaction", // amount: signed amount, or debit/credit columns
  },
  credit_card_documents: {
    code: "credit_card_documents", label: "כרטיס אשראי", section: "פרק 5 §7",
    expected: ["transaction_date", "charge_date", "description", "supplier", "transaction_amount", "charge_amount", "amount", "currency", "installment_info", "card_identifier", "merchant_category", "card_presented", "payment_method", "fee_amount", "exchange_rate", "status", "note"],
    // chapter 7 §7: card transactions are the economic expenses, kept by the actual charges; the charge amount is used
    // when the source states it, otherwise the single amount column. Transaction amount stays as an observation.
    required: ["transaction_date"], promotes: "transaction",
  },
  payment_apps: {
    code: "payment_apps", label: "bit / אפליקציות תשלום", section: "פרק 5 §8",
    expected: ["transaction_date", "amount", "currency", "direction", "counterparty", "description", "status", "reference", "fee_amount", "payment_method"],
    required: ["transaction_date", "amount", "direction", "status"], promotes: "transaction",
  },
  receipts_invoices: {
    code: "receipts_invoices", label: "קבלות וחשבוניות", section: "פרק 5 §9",
    expected: ["document_type", "supplier", "vat_id", "customer", "document_number", "allocation_number", "document_date", "line_description", "net_amount", "vat_amount", "gross_amount", "currency", "payment_method", "note"],
    required: ["document_date", "gross_amount"], promotes: "income_or_expense",
  },
  accounting_documents: {
    code: "accounting_documents", label: "הנהלת חשבונות / כרטסת", section: "פרק 5 §11",
    expected: ["reporting_period", "expense_account", "transaction_date", "description", "reference", "gross_amount", "net_amount", "vat_amount", "accounting_code", "supplier", "status"],
    required: [], promotes: null,
  },
  green_invoice_morning: {
    code: "green_invoice_morning", label: "חשבונית ירוקה / Morning", section: "פרק 5 §10",
    expected: ["document_number", "document_type", "document_type_code", "document_name", "document_date", "reporting_period", "supplier", "customer", "vat_id", "description", "line_number", "line_description", "item_code", "quantity", "unit_price", "net_amount", "vat_amount", "gross_amount", "net_amount_ils", "gross_amount_ils", "recognized_amount", "recognized_vat", "vat_type", "currency", "exchange_rate", "expense_account", "accounting_code", "payment_method", "status", "allocation_number", "external_id", "document_link", "note"],
    required: ["document_number", "document_date", "gross_amount"], promotes: "income_or_expense", // document type: its approved role is checked separately
  },
  loans_financing: { code: "loans_financing", label: "הלוואות ומימון", section: "פרק 5 §12", expected: ["document_date", "amount", "description", "status"], required: [], promotes: null },
  credit_reports: { code: "credit_reports", label: "דוחות נתוני אשראי", section: "פרק 5 §13", expected: ["document_date", "description", "amount", "status"], required: [], promotes: null },
  tax_documents: { code: "tax_documents", label: "מס / מע״מ", section: "פרק 5 §14", expected: ["document_date", "reporting_period", "amount", "status", "description"], required: [], promotes: null },
  bituach_leumi_documents: { code: "bituach_leumi_documents", label: "ביטוח לאומי", section: "פרק 5 §15", expected: ["document_date", "reporting_period", "amount", "status", "description"], required: [], promotes: null },
  government_authority_letters: { code: "government_authority_letters", label: "ממשלה ורשויות", section: "פרק 5 §17", expected: ["document_date", "document_number", "amount", "description", "status"], required: [], promotes: null },
  local_authority_documents: { code: "local_authority_documents", label: "רשות מקומית", section: "פרק 5 §17", expected: ["document_date", "document_number", "amount", "description", "status"], required: [], promotes: null },
  enforcement_collection: { code: "enforcement_collection", label: "הוצאה לפועל וגבייה", section: "פרק 5 §16", expected: ["document_date", "document_number", "amount", "description", "status"], required: [], promotes: null },
  debt_settlement_documents: { code: "debt_settlement_documents", label: "חובות והסדרים", section: "פרק 5 §16", expected: ["document_date", "document_number", "amount", "description", "status"], required: [], promotes: null },
  legal_documents: { code: "legal_documents", label: "משפטי", section: "פרק 5 §18", expected: ["document_date", "document_number", "amount", "description", "status"], required: [], promotes: null },
  assets_savings_rights: { code: "assets_savings_rights", label: "נכסים, חסכונות וזכויות", section: "פרק 5 §19", expected: ["document_date", "amount", "description", "status"], required: [], promotes: null },
  payment_proofs: { code: "payment_proofs", label: "אסמכתאות תשלום", section: "פרק 5 §3", expected: ["document_date", "amount", "reference", "counterparty", "description"], required: [], promotes: null },
};

/** source_type (18A §14) → family (chapter 5 §3). null = not a document family (user_report) or ambiguous (needs_review). */
const BY_SOURCE: Record<string, FamilyCode | null> = {
  bank_statement: "bank_documents",
  credit_card_statement: "credit_card_documents",
  p2p_payment: "payment_apps",
  business_income_export: "green_invoice_morning",
  business_expense_export: "green_invoice_morning",
  accounting_ledger: "accounting_documents",
  tax_document: "tax_documents",
  government_authority: null, // Bituach Leumi or authority letter — decided per document (D4 ambiguity)
  loan_document: "loans_financing",
  credit_report: "credit_reports",
  debt_collection: "debt_settlement_documents",
  enforcement: "enforcement_collection",
  legal_document: "legal_documents",
  local_authority: "local_authority_documents",
  asset_right: "assets_savings_rights",
  payment_proof: "payment_proofs",
};

export function familyForSource(sourceType: string): Family | null {
  const code = BY_SOURCE[sourceType];
  return code ? FAMILIES[code] : null;
}

/** For income/expense families the side is fixed by the explicit source context (ADR-007/008), never inferred. */
export function sideForSource(sourceType: string): "income" | "expense" | null {
  if (sourceType === "business_income_export") return "income";
  if (sourceType === "business_expense_export") return "expense";
  return null;
}
