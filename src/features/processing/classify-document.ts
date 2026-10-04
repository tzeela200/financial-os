import { FAMILIES, type Family, type FamilyCode } from "./families";

// Document classifier (chapter 5 §2–§4; MASTER_SPEC 19.09 §6.1; ADR-008 v2 decision 3; signatures from
// docs/implementation/route-a-readiness/Expected_Semantic_Concepts_Matrix.xlsx). The family is decided by what the content
// shows — the column concepts, the table structure and the document's own heading — never by the file name. The upload
// source is a hint: it is kept while its own signature is present, and replaced only when another family's signature is
// present and the hint's is not. Decisive phrases are read from the heading area and table headers only, never from
// movement text (a bank line "החזר הלוואה" does not make a statement a loan document).

export type ClassifyInput = {
  /** the family of the upload source (hint), or null */
  hint: Family | null;
  /** per table: the column headers, their wording concepts, and the cell values */
  tables: { headers: string[]; concepts: (string | null)[]; rows: string[][] }[];
  /** heading area: sheet titles, lines above the first table, document title lines */
  heading: string;
  /** stated facts found in the document (PDF "label | amount") */
  facts: { label: string }[];
  /** a recognised issuer statement (e.g. the CAL statement adapter) */
  cardStatement: boolean;
};

export type Classification = {
  family: FamilyCode | null;
  /** the family has a reading path in Release 1 (its rows can be understood and, if allowed, promoted) */
  supported: boolean;
  hint: FamilyCode | null;
  /** the content shows a different family from the upload source */
  mismatch: boolean;
  /** what the decision rests on — concepts and phrases found (plain, for the file screen) */
  basis: string[];
  /** for payment proofs: the direction the document itself declares (transfers / payments made → debit) */
  statedDirection: "debit" | null;
};

const SUPPORTED = new Set<FamilyCode>(["bank_documents", "credit_card_documents", "payment_apps", "receipts_invoices", "accounting_documents", "green_invoice_morning", "payment_proofs"]);

const norm = (s: string) => s.replace(/["״׳']/g, "").replace(/\s+/g, " ").trim();
// the other party's bank account: "בנק לאומי 925-3711944", "בנק מזרחי-טפחות בע״מ 139913 - 433", "ד.י. דואר פיננסים 2771500 - 1"
const ACCOUNT_VALUE = /\d{2,4}-\d{4,}|\d{4,}\s*-\s*\d{1,4}|(בנק|דואר|פיננסים)[^\d]*\d{5,}/;

// decisive heading phrases per family (matrix: canonical subtypes and their titles)
const PHRASES: Partial<Record<FamilyCode, string[]>> = {
  bank_documents: ["עובר ושב", "תדפיס עוש", "תדפיס חשבון", "דף חשבון", "תנועות בחשבון"],
  credit_card_documents: ["פירוט עסקאות", "פירוט חיובים", "דף פירוט", "מועד חיוב", "כרטיס אשראי"],
  payment_apps: ["bit", "ביט", "paybox", "פייבוקס"],
  green_invoice_morning: ["חשבונית ירוקה", "morning", "מורנינג"],
  accounting_documents: ["כרטסת", "כרטסת הנהח", "פקודות יומן", "מאזן בוחן"],
  payment_proofs: ["רשימת העברות", "אישור העברה", "אישורי העברה", "ריכוז אישורים", "תשלומים שבוצעו", "אישור סליקה", "שובר תשלום", "שם מוטב"],
  loans_financing: ["לוח סילוקין", "הסכם הלוואה", "אישור יתרת הלוואה", "יתרת הלוואה"],
  credit_reports: ["נתוני אשראי", "דוח נתוני אשראי"],
  tax_documents: ["דוח מעמ", "רשות המסים", "שומת מס", "מקדמות מס", "דוח שנתי למס"],
  bituach_leumi_documents: ["ביטוח לאומי", "המוסד לביטוח לאומי", "דמי ביטוח לאומי"],
  local_authority_documents: ["ארנונה", "עיריית", "מועצה מקומית", "מועצה אזורית"],
  enforcement_collection: ["הוצאה לפועל", "לשכת ההוצאה לפועל", "הודעת עיקול", "אזהרה בתיק"],
  debt_settlement_documents: ["הסדר חוב", "פריסת חוב", "אישור סילוק"],
  legal_documents: ["כתב תביעה", "פסק דין", "בית משפט", "בית המשפט", "כתב הגנה"],
  assets_savings_rights: ["קרן פנסיה", "קופת גמל", "קרן השתלמות", "פיקדון", "הערכת שווי"],
};
// table-header words that are decisive for a family without a reading path (matrix: expected concepts)
const HEADER_WORDS: Partial<Record<FamilyCode, string[]>> = {
  loans_financing: ["קרן", "ריבית", "הצמדה", "מספר תשלום", "יתרת קרן", "החזר חודשי"],
  enforcement_collection: ["מספר תיק", "זוכה", "חייב", "יתרת חוב"],
  assets_savings_rights: ["שווי", "יתרה צבורה", "הפקדות"],
};
const OUTGOING = ["רשימת העברות", "תשלומים שבוצעו", "שם מוטב", "מוטב", "העברות שבוצעו"];

export function classifyDocument(input: ClassifyInput): Classification {
  const heading = norm(input.heading).toLowerCase();
  const headerText = norm(input.tables.flatMap((t) => t.headers).join(" | "));
  const concepts = new Set(input.tables.flatMap((t) => t.concepts.filter((c): c is string => !!c)));
  const has = (c: string) => concepts.has(c);
  const phrasesOf = (f: FamilyCode) => (PHRASES[f] ?? []).filter((p) => heading.includes(norm(p).toLowerCase()));
  const headerWordsOf = (f: FamilyCode) => (HEADER_WORDS[f] ?? []).filter((w) => headerText.includes(w));

  // a family's own signature: what the content must show for the family to be the right reading
  const signature: Record<FamilyCode, string[]> = {} as Record<FamilyCode, string[]>;
  const add = (f: FamilyCode, why: string | false) => { if (why) (signature[f] ??= []).push(why); };

  // movement tables
  add("bank_documents", has("balance") && "יתרה אחרי כל פעולה");
  add("bank_documents", has("debit_amount") && has("credit_amount") && "עמודות חובה וזכות");
  add("bank_documents", input.facts.some((f) => /^(יתרת )?עו"?ש|^יתרה בחשבון|^יתרה נוכחית/.test(norm(f.label))) && "יתרת עו״ש מוצהרת");
  add("credit_card_documents", input.cardStatement && "מבנה דף חיוב של חברת כרטיסים");
  add("credit_card_documents", (has("charge_date") || has("charge_amount") || has("card_identifier")) && "תאריך או סכום חיוב / כרטיס");
  add("payment_apps", (has("direction") || has("status")) && phrasesOf("payment_apps").length > 0 && "כיוון / סטטוס תשלום באפליקציה");
  add("receipts_invoices", has("gross_amount") && (has("net_amount") || has("vat_amount")) && "נטו / מע״מ / ברוטו");
  add("receipts_invoices", (has("vat_id") || has("allocation_number")) && "מספר עוסק / מספר הקצאה");
  add("green_invoice_morning", (has("document_number") && (has("gross_amount") || has("gross_amount_ils"))) && "מספר מסמך וסכום מסמך");
  add("accounting_documents", (has("expense_account") || has("accounting_code")) && "חשבון / קוד חשבונאי");
  // payment proofs: a list of payments to named parties — no running balance, no debit/credit split
  const proofTable = input.tables.some((t) => {
    const c = new Set(t.concepts);
    // the payee's account column: by its header, else any column whose values are bank accounts
    const isAccountCol = (i: number) => t.rows.filter((r) => ACCOUNT_VALUE.test(r[i] ?? "")).length >= Math.max(1, t.rows.length * 0.5);
    const byHeader = t.headers.findIndex((h, i) => c.has("counterparty_account") ? t.concepts[i] === "counterparty_account" : /חשבון/.test(h));
    const accountValues = byHeader >= 0 ? isAccountCol(byHeader) : t.headers.some((_, i) => t.concepts[i] === null && isAccountCol(i));
    return !c.has("balance") && !(c.has("debit_amount") && c.has("credit_amount")) && (c.has("amount") || c.has("gross_amount")) && (c.has("counterparty") || accountValues) && (accountValues || phrasesOf("payment_proofs").length > 0);
  });
  add("payment_proofs", proofTable && "תשלומים לצד שני (מוטב וחשבונו) בלי יתרה ובלי חובה/זכות");
  // heading phrases (all families) and decisive header words (families without a reading path)
  const structural = new Set(Object.keys(signature) as FamilyCode[]); // families whose content structure is present
  const phrased = new Set<FamilyCode>();
  for (const f of Object.keys(FAMILIES) as FamilyCode[]) {
    const ph = phrasesOf(f);
    if (ph.length) { add(f, `כותרת המסמך: "${ph[0]}"`); phrased.add(f); }
    const hw = headerWordsOf(f);
    if (hw.length >= 2) add(f, `עמודות: ${hw.slice(0, 3).join(", ")}`);
  }

  const hint = input.hint?.code ?? null;
  const own = (f: FamilyCode | null) => (f ? signature[f] ?? [] : []);
  // a family without a reading path wins only with both a heading phrase and its header words (or with no table at all)
  const unsupportedStrong = (Object.keys(signature) as FamilyCode[]).filter((f) => !SUPPORTED.has(f) && (input.tables.length === 0 ? own(f).length >= 1 : own(f).length >= 2));
  const others = (Object.keys(signature) as FamilyCode[]).filter((f) => f !== hint && SUPPORTED.has(f) && own(f).length > 0);

  let family: FamilyCode | null = hint;
  let basis: string[] = own(hint);
  if (unsupportedStrong.length && (!own(hint).length || unsupportedStrong.some((f) => own(f).length > own(hint).length))) {
    family = unsupportedStrong.sort((a, b) => own(b).length - own(a).length)[0];
    basis = own(family);
  } else if (hint && !structural.has(hint) && others.some((f) => structural.has(f)) && (!phrased.has(hint) || others.includes("payment_proofs") && structural.has("payment_proofs"))) {
    // the hint's signature is absent and exactly one other supported family's is present; payment proofs first —
    // a payment list must never be read as new movements
    const strong = others.filter((f) => structural.has(f));
    const pick = strong.includes("payment_proofs") ? "payment_proofs" : strong.length === 1 ? strong[0] : null;
    if (pick) { family = pick; basis = own(pick); }
  }
  const statedDirection = family === "payment_proofs" && OUTGOING.some((p) => heading.includes(norm(p).toLowerCase())) ? "debit" : null;
  return { family, supported: !!family && SUPPORTED.has(family), hint, mismatch: !!family && family !== hint, basis, statedDirection };
}
