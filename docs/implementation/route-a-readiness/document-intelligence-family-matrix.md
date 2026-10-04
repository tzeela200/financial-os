# Family–Subtype–Format–Output–Acceptance Matrix

## כלל עבודה
המטריצה היא שכבת **מימוש ובדיקות** בלבד. פרק 5 נשאר מקור האמת למשפחות, Concepts, Provenance, Validation ו-Reprocessing. פרק 6 נשאר מקור האמת ל-Skill routing.

לכל fixture יש לתעד מקומית:
`family | subtype | format | source/provider | layout variant | expected concepts | expected entity/read-model outputs | expected counts/totals | evidence locators | allowed questions | unsupported features`

---

## 1. Bank Documents

### A. Current Account Transaction Statement — תדפיס עו"ש עם תנועות
**מטרה:** הפקת תנועות בנק אמיתיות, יתרות ועובדות חשבון מתוך טבלת תנועות.

**פורמטים:** PDF דיגיטלי, CSV, XLS/XLSX; PDF סרוק רק במסלול Vision/OCR.

**Concepts צפויים:**
- bank / branch / masked account
- coverage period
- opening/closing balance
- transaction date
- value date
- description
- reference
- debit / credit / direction
- amount + currency
- balance after transaction
- counterparty when present
- fees / interest / standing order indicators when present

**פלט:**
- normalized bank observations
- canonical transaction candidates רק אחרי Verification/Promotion
- reported balances כאשר המסמך מצהיר עליהם
- coverage result
- evidence locator לכל שדה מהותי

**Validation:**
- כותרת טבלה חוזרת בין עמודים אינה שוברת מיפוי.
- debit/credit אינו ננחש אם אין סימן/עמודה/כלל.
- balance sequence נבדק כאשר אפשר.
- 83 raw lines + 0 transactions = כשל Acceptance אם קיימת טבלת תנועות.
- raw lines נשמרות כ-Evidence בלבד.

**Allowed questions:**
- "האם העמודה הזו מייצגת חובה או זכות?" רק אם אין דרך להסיק מהמסמך.
- מטבע רק אם אינו מצוין ואין כלל מקור אמין.

**Skills:**
- `israeli-bank-connector` — נרמול/קליטה לאחר קריאה.
- `israeli-bank-reconciliation` — רק לאחר שיש מקור נוסף לפיוס.

### B. Annual / Summary Bank Report — דוח שנתי/מסכם
**מטרה:** הפקת facts מסכמים, לא המצאת Transactions.

**Concepts:** reported balance, as-of date, loans, facilities, deposits, standing orders, summary facts.

**פלט:** facts + reported balance + evidence + date.

**אסור:** ליצור transactions ממסמך שאינו כולל טבלת תנועות.

**Acceptance:** יתרה נשמרת עם `as_of` ו-locator; דוח ישן אינו דורס יתרה חדשה יותר.

---

## 2. Credit Card Documents
**תתי־סוגים:** monthly statement / transaction export / PDF table.

**Concepts:**
issuer, masked card, transaction date, charge date, merchant, transaction amount, charged amount, currency, installment number/count, refund/cancellation, monthly billed total, fees, FX.

**Validation:**
- transaction date ≠ charge date.
- זיכוי/ביטול מזוהים.
- total מול statement total כאשר אפשר.
- credit limit אינו "כסף זמין".
- אין לספור חיוב הכרטיס בבנק פעמיים לצד עסקאות הכרטיס.

**Fixtures ידועים לבדיקת רגרסיה:** CAL PDF, XLSX export, card PDF table.

---

## 3. Payment Apps
**דוגמאות:** Bit / PayBox.

**Concepts:** datetime, amount, currency, direction sent/received, sender, recipient, note, status, reference.

**פלט:** payment-app observations / transactions candidates.

**Validation:**
- direction חייבת להיות מפורשת או ניתנת להסקה באופן אמין.
- קשר לבנק עובר Reconciliation; אינו יוצר הכנסה/הוצאה כפולה.

---

## 4. Receipts & Invoices
**תתי־סוגים:** tax invoice, receipt, tax-invoice/receipt, credit note, payment approval.

**Concepts:** document type, supplier, tax ID, buyer, document no., allocation no. when present, date, line items when available, net/VAT/gross, currency, payment method, references, credit linkage.

**Pipeline:**
Reader/Vision → semantic extraction → `il-invoice-organizer` → optional classification → validation.

**Skills:**
- `israeli-receipt-scanner` רק לסרוק/מצולם.
- `il-invoice-organizer` אחרי extraction.
- `israeli-expense-categorizer` להצעת סיווג בלבד.

**Validation:**
- net + VAT = gross כאשר אפשר.
- receipt אינה נספרת אוטומטית כהכנסה.
- payment approval אינו tax invoice.
- duplicate copy אינו הוצאה נוספת.

---

## 5. Green Invoice / Morning
**תתי־סוגים:** expenses export, income export, PDF report, CSV export.

**Concepts:** document ID/type, customer/supplier, date/period, net/VAT/gross, payment, credit/cancellation, document status, linkage.

**Acceptance:**
- אותו דוח PDF ו-CSV אמורים להגיע לאותה משמעות קנונית.
- wrapped cells / repeated headers / page shifts אינם משנים ספירות.
- PDF ו-CSV equivalent fixture: compare document numbers, dates, totals and semantic types.

**אסור:** להסיק "דווח לרו"ח/מע"מ" מעצם הימצאות המסמך ב-Morning.

---

## 6. Accounting Documents
**תתי־סוגים:** ledger/card, bookkeeping export, XLS/XLSX/XLS-as-HTML.

**Concepts:** period, section/card/group, posting date, description, reference, gross/net/VAT, batch/code, balances, supplier/customer, draft/final state.

**Validation:**
- partial posting נשמר כ-partial, לא "missing".
- 25%/50% recorded ≠ absent.
- סכום מקור וסכום חשבונאי הם שדות שונים כאשר המקור מבדיל ביניהם.
- encoding/container quirks מטופלים בשכבת reader, לא בלוגיקה העסקית.

---

## 7. Loans & Financing
**Concepts:** lender, borrower, origination date, original principal, rate/type, linkage/indexation, term, installments, payment amount, principal/interest split, fees, amortization schedule, payoff balance, arrears, collateral/guarantees when present.

**אסור:** לחשב תנאים שלא כתובים במסמך בתוך extraction; חישוב מחדש שייך calculation engine.

---

## 8. Credit Reports
**דוגמאות:** Bank of Israel credit-data reports.

**Concepts:** reporting period, lenders, facilities, loans active/inactive, balances, arrears/statuses, negative events/restrictions, dates.

**אסור:** לפרש מעבר למה שהדוח עצמו אומר ללא שכבת analysis נפרדת.

---

## 9. Tax Documents
**תתי־סוגים:** VAT report, assessment, annual return, payment demand/confirmation.

**Concepts:** tax period/year, turnover/income, output/input VAT, deductions/credits, advances, debit/refund, payments, due date, status, authority notes.

**Skills:** VAT/tax skill רק בשלב המקצועי; extraction אינו קובע זכאות.

---

## 10. Bituach Leumi / Government / Local Authority
**Concepts:** authority, document type, date, addressee, case/reference, amount, requirement, deadline, reasons, payment/appeal options, penalties/interest/discounts.

**Skill role:** decoder יכול להסביר מבנה ודרישה; אינו קובע חוקיות.

---

## 11. Enforcement, Debt & Settlement
**Concepts:** case no., creditor/debtor, opening/closing dates, original/current debt, principal, interest/indexation, fees, payments, status, arrangements, enforcement acts, liens/restrictions, decisions/deadlines.

**Validation:** timeline completeness + links to debt/payments; legality is not extraction.

---

## 12. Legal Documents
**Concepts:** parties, forum, case no., date, proceeding/doc type, claim/request/decision, amounts, deadlines, conditions, orders/restrictions.

**Critical semantic rule:** allegation/claim ≠ court/authority decision.

---

## 13. Assets, Savings & Rights
**Concepts:** asset/right type, institution, owner/beneficiary, balance/value, valuation/as-of date, liquidity/withdrawal date, deposits/withdrawals, right to receive money, restrictions.

---

## Acceptance status fields
לכל שורה במטריצה בפועל:
- `coverage_status`
- `fixture_count`
- `formats_tested`
- `layout_variants_tested`
- `expected_output_asserted`
- `evidence_asserted`
- `read_model_asserted`
- `screen_asserted`
- `open_ambiguities`
- `unsupported`
- `last_verified_commit`
- `last_verified_at`
