// Hebrew display names of the canonical source_type values — taken from the meaning column of 18A §14.
// Display layer only; codes stay the glossary values.
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  bank_statement: "בנק / עו״ש",
  credit_card_statement: "כרטיס אשראי",
  p2p_payment: "Bit / PayBox / תשלום P2P",
  business_expense_export: "חשבונית ירוקה / Morning — הוצאות",
  business_income_export: "הכנסות עסק",
  accounting_ledger: "כרטסת / הנהלת חשבונות",
  tax_document: "מס / מע״מ",
  government_authority: "ביטוח לאומי / ממשלה",
  loan_document: "הלוואה / מימון",
  credit_report: "דוח נתוני אשראי",
  debt_collection: "חוב / גבייה",
  enforcement: "הוצאה לפועל",
  legal_document: "משפטי",
  local_authority: "רשות מקומית",
  asset_right: "נכס / חיסכון / זכות",
  payment_proof: "הוכחת תשלום",
  correspondence: "מייל / תכתובת",
  user_report: "דיווח ידני",
  official_reference: "מקור רשמי מקצועי",
  prior_analysis: "ניתוח קודם / מסמך עבודה",
};
