# Bank PDF Transaction Statement — Missing Acceptance Case

## 1. למה המסמך הזה חשוב
דוח העבודה האחרון אימת Bank Summary/Annual Report, אך לא הוכיח PDF בנק עם פירוט תנועות. לכן תדפיס עו"ש PDF הוא fixture חסר ולא "סוג חדש של מערכת".

## 2. Outcome
כאשר מעלים PDF דיגיטלי של תנועות בנק:
1. המערכת מזהה `Bank Documents / Current Account Transaction Statement`.
2. מזהה פרטי חשבון ותקופה.
3. מאתרת את טבלת התנועות גם אם כותרות חוזרות/זזות בין עמודים.
4. משחזרת rows אמיתיים.
5. מפיקה transaction observations.
6. מנרמלת תאריך/ערך/סכום/כיוון/תיאור/אסמכתא/יתרה.
7. מריצה validation.
8. מציגה transactions ב-Read Model המתאים.
9. כל transaction ניתן ל-drill-down ל-Evidence בעמוד/שורה/אזור המקור.

## 3. Failure שמוכיח שהיכולת לא עובדת
מצב כגון:
- raw lines נקראו
- טבלת תנועות נראית במסמך
- `transactions = 0`

הוא **כשל Processing/Understanding**, לא "אין מידע".

## 4. Reader rules
- להשתמש בשכבת טקסט/מיקום של PDF דיגיטלי לפני OCR.
- לזהות headers semantically, לא לפי x קבוע מעמוד ראשון.
- לרענן positions בכל repeated header/page.
- לחבר continuation/wrapped cells לשורה הקרובה הנכונה.
- לזהות מספר ארוך שנשפך לעמודה שכנה באמצעות type constraints.
- לשמר raw tokens/lines רק כ-Evidence/debug, לא כ-business rows.

## 5. Direction
סדר עדיפות:
1. explicit debit/credit columns.
2. sign on amount.
3. reliable provider/layout rule.
4. balance-delta inference רק אם deterministic ומאומת.
5. אחרת — open question.

אין default של "כל סכום שלילי = הוצאה עסקית".

## 6. Required assertions
- document classified correctly.
- non-zero transaction count when rows exist.
- row count matches source rows after excluding headers/subtotals.
- first/last visible transactions match source.
- amounts exact in minor units.
- dates preserved distinctly.
- direction preserved.
- running balance consistent when document supports it.
- evidence locator exists per transaction.
- reprocess does not duplicate canonical records.
- screen does not display stale previous-run result while queued/running.

## 7. End-to-End acceptance
`PDF → Document → Observations → Validation → Canonical candidates → Read Model → Transactions screen → Evidence`

כל אחד מהחצים חייב לקבל assertion נפרד.

## 8. Allowed user questions
רק שאלות עמימות אמיתיות שלא נפתרו אחרי semantic extraction, כגון משמעות עמודת סכום שאין לה סימן/כיוון.

לא לשאול:
- "איזו עמודה היא תאריך?" כאשר הכותרת והערכים מאפשרים לזהות.
- mapping מלא ידני לכל קובץ מאותה משפחה.

## 9. Acceptance report
בסיום לדווח:
- fixture
- subtype
- format
- pages
- extracted transactions
- expected transactions
- assertions passed/failed
- open questions
- unsupported behavior
- commit/version tested
