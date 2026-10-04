# Route A Readiness — חבילת הטמעה
**תאריך:** 01.10.2026  
**סטטוס:** Implementation package — לא מפרט קנוני חדש

## 1. מטרה
החבילה מתרגמת את המפרט הקנוני הקיים להוראות מימוש ובדיקות בשני צירים:
1. Document Intelligence — קליטה, הבנה, חילוץ, נרמול, אימות, Evidence ופלט.
2. UI/UX — הצגת האמת הפיננסית בצורה שימושית, עקבית, RTL ונגישה.

החבילה **אינה מחליפה** את פרק 5, פרק 6, פרקים 18–23, ADRs או Master Execution Plan.

## 2. מקורות אמת
סדר הקדימות:
- פרקים 1–17 — משמעות פיננסית וכללי דומיין.
- פרק 18 V2 — Backend, Data, Evidence, QA, Audit, Contracts.
- פרק 19 — Frontend Architecture.
- פרק 20 + ADR-004 — Design System וטוקנים.
- פרק 21 — רכיבים והתנהגות.
- פרק 22 — מסכים וזרימות.
- פרק 23 + MASTER_EXECUTION_PLAN — סדר ביצוע, Gates ו-Verification.
- פרק 5 — Document Intelligence.
- פרק 6 — Skill routing.

## 3. עקרונות קשיחים
- לא בונים Parser קשיח לכל קובץ.
- משפחה + תת־סוג + משמעות מגדירים התנהגות; fixtures מוכיחים אותה.
- CSV/XLS/XLSX/PDF דיגיטלי נקראים קודם ב-Readers דטרמיניסטיים.
- OCR/Vision רק למסמך סרוק/מצולם או כששכבת הטקסט אינה מספקת.
- Raw source נשאר immutable.
- Unknown אינו 0.
- Raw PDF lines אינן Transactions.
- Skill אינו מקור אמת עצמאי ואינו מבצע canonical write.
- אין שינוי מוצר/Scope דרך חבילת ההטמעה הזאת.
- אין להכניס קבצי ייחוס אישיים ל-Git או ל-Production.

## 4. סדר עבודה
1. לקרוא את `document-intelligence-family-matrix.md`.
2. להשלים/להוסיף fixtures מקומיים ב-manifest שאינו נכנס ל-Git.
3. לממש/לתקן מנוע כללי לפי משפחה ותת־סוג.
4. להריץ Acceptance לפי `acceptance-checklist.md`.
5. רק לאחר שהפלט נכון — ליישם/לתקן UI לפי `ui-ux-implementation.md`.
6. להוכיח End-to-End: Source → Output → Read Model → Screen → Evidence.

## 5. מחוץ להיקף
- שינוי מודל פיננסי קנוני.
- שינוי ADRs.
- שינוי טוקנים.
- יצירת משפחת מסמכים חדשה ללא בסיס בפרק 5.
- חיבור API חדש רק כדי לעקוף בעיית parsing.
- הכנסת OCR provider בלי החלטה ואישור.

## 6. Skill Routing
לפני מימוש כל fixture יש לעבור על `skill-routing.md` כדי לוודא שה-Reader וה-Skill הנכונים מופעלים רק בשלב המתאים.

## 7. UI/UX Skill Routing
לכל Work Unit של מסכים יש להשתמש ב-`ui-skill-routing.md` כדי לבחור את Skills המתאימים לבדיקת עיצוב, שימושיות, RTL, React, QA ואימות סופי.
