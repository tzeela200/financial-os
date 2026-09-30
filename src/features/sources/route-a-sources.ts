// Route A known sources (ADR-007 §2, ADR-008 decision 3, CL-0028): each is an internal workspace inside
// "חשבונות ומקורות". Every upload enters with an explicit source_type from the glossary — no generic upload.
export type RouteASource = {
  kind: "bank" | "credit-card" | "bit" | "green-invoice-income" | "green-invoice-expenses";
  label: string;
  description: string;
  sourceTypes: string[]; // glossary source_type values
  accountSide: boolean; // B5 §60: financial account (bank/card) vs information source
};

export const ROUTE_A_SOURCES: RouteASource[] = [
  { kind: "bank", label: "בנק וחשבונות עו״ש", description: "דוחות ותנועות בחשבון הבנק", sourceTypes: ["bank_statement"], accountSide: true },
  { kind: "credit-card", label: "כרטיסי אשראי", description: "קבצי עסקאות וחיובים של כרטיסי האשראי", sourceTypes: ["credit_card_statement"], accountSide: true },
  { kind: "bit", label: "bit", description: "תשלומים והעברות ב־bit", sourceTypes: ["p2p_payment"], accountSide: true },
  { kind: "green-invoice-income", label: "חשבונית ירוקה — הכנסות", description: "ייצוא הכנסות מחשבונית ירוקה", sourceTypes: ["business_income_export"], accountSide: false },
  { kind: "green-invoice-expenses", label: "חשבונית ירוקה — הוצאות", description: "ייצוא הוצאות מחשבונית ירוקה", sourceTypes: ["business_expense_export"], accountSide: false },
];

export function findSource(kind: string): RouteASource | undefined {
  return ROUTE_A_SOURCES.find((s) => s.kind === kind);
}
