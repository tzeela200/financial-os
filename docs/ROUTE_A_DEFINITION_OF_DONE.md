# ROUTE A — Definition of Done
Version: 1.0

> **מעמד:** מסמך־על מחייב לסיום מסלול א׳ (אושר על ידי צאלה, 04.10.2026). אמת עבודה מחייבת — אינו מחליף את הקאנון
> (פרקים 1–23, ADRs, MASTER_EXECUTION_PLAN), את חבילת Route A Readiness או את תוכנית ה־Work Units; הוא קובע מתי מותר
> להכריז DONE. רישום: CHANGELOG CL-0044, WORKLOG 04.10.2026.

## מטרת המסמך

מסמך זה אינו מחליף את הקאנון, את Route A Readiness או את תוכנית ה־Work Units.

מטרתו להגדיר מתי מותר להכריז:

# DONE

Work Units שהסתיימו אינם Definition of Done.

Build ירוק אינו Definition of Done.

Tests שעברו אינם Definition of Done.

DONE פירושו:

האפליקציה האישית עובדת בפועל עם נתונים אמיתיים.

---

# מטרת העל

בסיום העבודה המשתמשת יכולה להשתמש באפליקציה כמערכת הפיננסית האישית שלה.

ללא השלמות ידניות.

ללא Debug.

ללא TODO.

---

# 1. Data

✓ כל מקורות הנתונים נתמכים.

✓ מסמכים מזוהים.

✓ Readers עובדים.

✓ Skills מופעלים לפי skill-routing בלבד.

✓ אין Parser ייעודי לכל קובץ.

✓ Evidence נשמר.

✓ Provenance נשמר.

---

# 2. Processing

✓ Semantic Understanding

✓ Validation

✓ Canonical Truth

✓ Read Models

✓ Reprocessing

✓ Coverage

✓ Unknown נשאר Unknown

✓ אין כפילויות

✓ אין ניחושים

---

# 3. Financial Engine

✓ Current Picture

✓ Income

✓ Expenses

✓ Cards

✓ Bank

✓ Transfers

✓ Loans

✓ Obligations

✓ Coverage

✓ Cash Flow

✓ VAT

✓ Accounting

✓ Reconciliation

✓ Review Queue

---

# 4. Screens

כל המסכים עובדים.

Home

Current Picture

Transactions

Documents

Evidence

Review

Reconciliation

Settings

Uploads

---

# 5. UX

RTL

Mobile

Desktop

Accessibility

Loading

Error

Empty

Partial

Needs Review

---

# 6. Commands

כל הפעולות במסכים עובדות.

Sort

Filter

Search

Pagination

Upload

Open

Back

Save

Retry

Reprocess

Review

Resolve

---

# 7. Verification

כל מספר ניתן למעקב.

Number

↓

Read Model

↓

Canonical

↓

Evidence

↓

Source

---

# 8. Real Data

האפליקציה נבדקה עם נתונים אמיתיים.

לא Fixtures בלבד.

---

# 9. Regression

אין שבירת יכולות קיימות.

---

# 10. Deployment

Production

Post Deploy

Rollback

Backup

Restore

עברו.

---

# 11. Final Acceptance

DONE מותר רק כאשר:

✓ כל Work Units הושלמו

✓ כל Gates עברו

✓ כל Acceptance עבר

✓ כל Regression עבר

✓ Real Data עבר

✓ UI עבר

✓ E2E עבר

✓ המשתמשת יכולה להשתמש באפליקציה בפועל.
