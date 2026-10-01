// Concept registry (chapter 5 §4, §6–§11; 18 V2 §16 concept_code / data_type). Codes are the proposed technical names
// of the canonical concepts — Stage 3 plan WU-1 / decision D4 (shown to Tzeela; recorded as execution decisions, not a
// new canon). There is NO alias list and NO fuzzy matching here (decision D5): column meaning comes only from an
// approved Source Adapter built from real material; anything else stays needs_mapping.

export type DataType = "money" | "date" | "text" | "id" | "rate" | "number";
export type Concept = { code: string; label: string; dataType: DataType; source: string };

export const CONCEPTS: Concept[] = [
  { code: "transaction_date", label: "תאריך עסקה / פעולה", dataType: "date", source: "פרק 5 §4, §6–§8" },
  { code: "document_date", label: "תאריך מסמך", dataType: "date", source: "פרק 5 §4, §9" },
  { code: "charge_date", label: "תאריך חיוב", dataType: "date", source: "פרק 5 §4, §7" },
  { code: "value_date", label: "תאריך ערך", dataType: "date", source: "פרק 5 §4, §6" },
  { code: "reporting_period", label: "תקופת דיווח", dataType: "text", source: "פרק 5 §4, §10" },
  { code: "status", label: "סטטוס", dataType: "text", source: "פרק 5 §4, §8, §10" },
  { code: "description", label: "תיאור", dataType: "text", source: "פרק 5 §4" },
  { code: "line_description", label: "תיאור שורה", dataType: "text", source: "פרק 5 §9 (פירוט פריטים)" },
  { code: "line_number", label: "מספר שורה", dataType: "number", source: "פרק 5 §9" },
  { code: "quantity", label: "כמות", dataType: "number", source: "פרק 5 §9" },
  { code: "unit_price", label: "מחיר ליחידה", dataType: "money", source: "פרק 5 §9" },
  { code: "amount", label: "סכום", dataType: "money", source: "פרק 5 §4, §8" },
  { code: "debit_amount", label: "סכום בחובה (יציאה)", dataType: "money", source: "פרק 5 §4, §6" },
  { code: "credit_amount", label: "סכום בזכות (כניסה)", dataType: "money", source: "פרק 5 §4, §6" },
  { code: "balance", label: "יתרה לאחר פעולה", dataType: "money", source: "פרק 5 §4, §6" },
  { code: "reference", label: "אסמכתא", dataType: "id", source: "פרק 5 §4, §6, §8" },
  { code: "transaction_amount", label: "סכום עסקה", dataType: "money", source: "פרק 5 §7" },
  { code: "charge_amount", label: "סכום חיוב", dataType: "money", source: "פרק 5 §7" },
  { code: "installment_info", label: "תשלומים (מספר תשלום / מספר תשלומים)", dataType: "text", source: "פרק 5 §4, §7" },
  { code: "card_identifier", label: "כרטיס / 4 ספרות", dataType: "id", source: "פרק 5 §4, §7" },
  { code: "fee_amount", label: "עמלה", dataType: "money", source: "פרק 5 §4" },
  { code: "direction", label: "כיוון (זיכוי / חיוב)", dataType: "text", source: "פרק 5 §4, §8" },
  { code: "payment_method", label: "אמצעי תשלום", dataType: "text", source: "פרק 5 §4, §9" },
  { code: "counterparty", label: "צד שני (מאת / אל)", dataType: "text", source: "פרק 5 §4, §8" },
  { code: "supplier", label: "ספק", dataType: "text", source: "פרק 5 §4, §9" },
  { code: "customer", label: "לקוח", dataType: "text", source: "פרק 5 §4, §10" },
  { code: "vat_id", label: "מספר עוסק", dataType: "id", source: "פרק 5 §4, §9" },
  { code: "document_number", label: "מספר מסמך", dataType: "id", source: "פרק 5 §4, §9" },
  { code: "document_type", label: "סוג מסמך", dataType: "text", source: "פרק 5 §9, §10" },
  { code: "document_type_code", label: "קוד סוג מסמך", dataType: "id", source: "פרק 5 §10" },
  { code: "allocation_number", label: "מספר הקצאה", dataType: "id", source: "פרק 5 §4, §9" },
  { code: "gross_amount", label: "סכום כולל מע״מ", dataType: "money", source: "פרק 5 §4, §9" },
  { code: "vat_amount", label: "מע״מ", dataType: "money", source: "פרק 5 §4, §9" },
  { code: "net_amount", label: "סכום לפני מע״מ", dataType: "money", source: "פרק 5 §4, §9" },
  { code: "gross_amount_ils", label: "סכום כולל בשקלים", dataType: "money", source: "פרק 5 §9; פרק 9 §15" },
  { code: "net_amount_ils", label: "סכום לפני מע״מ בשקלים", dataType: "money", source: "פרק 5 §9; פרק 9 §15" },
  { code: "recognized_amount", label: "סכום הוצאה עסקית / מוכרת", dataType: "money", source: "פרק 5 §10; פרק 9 §7" },
  { code: "recognized_vat", label: "מע״מ מוכר", dataType: "money", source: "פרק 5 §10; פרק 9 §8" },
  { code: "currency", label: "מטבע", dataType: "text", source: "פרק 5 §4" },
  { code: "exchange_rate", label: "שער מטבע", dataType: "rate", source: "פרק 5 §7; פרק 9 §15" },
  { code: "vat_type", label: "סוג מע״מ", dataType: "text", source: "פרק 5 §9" },
  { code: "expense_account", label: "חשבון הוצאה", dataType: "text", source: "פרק 5 §11" },
  { code: "accounting_code", label: "קוד חשבונאי", dataType: "id", source: "פרק 5 §11" },
  { code: "item_code", label: "מק״ט", dataType: "id", source: "פרק 5 §9" },
  { code: "external_id", label: "מזהה במערכת המקור", dataType: "id", source: "פרק 5 §10" },
  { code: "document_link", label: "קישור למסמך במקור", dataType: "text", source: "פרק 5 §10, §22" },
  { code: "note", label: "הערות", dataType: "text", source: "פרק 5 §5" },
  { code: "document_name", label: "שם המסמך", dataType: "text", source: "פרק 5 §10" },
];

const BY_CODE = new Map(CONCEPTS.map((c) => [c.code, c]));
export const conceptByCode = (code: string) => BY_CODE.get(code);
