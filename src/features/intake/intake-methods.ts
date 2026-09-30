// Intake methods per canonical source_type (docs/implementation/route-a-02-intake-methods-map.md).
// Every glossary source_type is listed — intake is never file-only when the canon defines more:
//   file          — select / drag & drop / mobile pick / clipboard file paste (18A §6, §40–44; 19D §7; 20B §12; 21D §7)
//   text          — pasted or typed text kept as an immutable .txt source (18A §43: "TXT/MD — תכתובות/ניתוחים/הערות")
//   manual_report — user_report with statement (18A §13, §56; 18D §16 POST /api/intake/manual-report, §47; 21D §53)
// Voice recordings and external links are NOT defined in chapters 18–23 (gap) and have no method here.
export type IntakeMethod = "file" | "text" | "manual_report";

const FILE: IntakeMethod[] = ["file"];
const FILE_OR_TEXT: IntakeMethod[] = ["file", "text"];

export const INTAKE_METHODS_BY_SOURCE_TYPE: Readonly<Record<string, readonly IntakeMethod[]>> = {
  bank_statement: FILE,
  credit_card_statement: FILE,
  p2p_payment: FILE,
  business_expense_export: FILE,
  business_income_export: FILE,
  accounting_ledger: FILE,
  tax_document: FILE,
  government_authority: FILE,
  loan_document: FILE,
  credit_report: FILE,
  debt_collection: FILE,
  enforcement: FILE,
  legal_document: FILE,
  local_authority: FILE,
  asset_right: FILE,
  payment_proof: FILE,
  correspondence: FILE_OR_TEXT, // 18A §6 מייל/תכתובת; §43 Email export
  official_reference: FILE_OR_TEXT, // 18A §6, §14
  prior_analysis: FILE_OR_TEXT, // 18A §6; 18C §31 analysis — support only
  user_report: ["manual_report"],
};

export function intakeMethodsFor(sourceType: string): IntakeMethod[] {
  return [...(INTAKE_METHODS_BY_SOURCE_TYPE[sourceType] ?? [])];
}

// Channels the canon names but explicitly defers — recorded so they are not silently dropped (23D §113–§114).
export const DEFERRED_INTAKE_CHANNELS = [
  { channel: "connector_api", basis: "18B §4.2; 18D §46 — Adapter; ADR-002 stage 18 deferred" },
  { channel: "google_drive", basis: "19D §7; 18D §3 'Drive/API/ייבוא עתידי'" },
  { channel: "email_forward", basis: "19D §7; chapter 4 'ערוץ עתידי של העברת מייל'" },
  { channel: "whatsapp", basis: "19D §7 'WhatsApp (בעתיד)'" },
  { channel: "webhook", basis: "18D §45 'Webhooks עתידיים'" },
] as const;
