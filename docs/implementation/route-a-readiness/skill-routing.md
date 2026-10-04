# Skill Routing — מתי מפעילים איזה Skill

**מעמד:** מסמך מימוש בלבד.  
**מקור אמת:** פרק 6 — Skills.  
המסמך אינו משנה את פרק 6 ואינו מעניק ל-Skill סמכות לכתוב אמת קנונית.

## 1. כלל יסוד
Skills הם כלים לפי צורך. אין Skill אחד שקורא את כל סוגי המסמכים ואין להפעיל את כל ה-Skills על כל מקור.

המסלול הבסיסי הוא:

`Reader / Vision → Semantic Understanding → Skill לפי צורך → Validation → Reconciliation לפי צורך → Canonical Promotion לפי הכללים`

## 2. Routing לפי סוג קובץ / מצב

| מצב | כלי/Skill | תפקיד | מתי לא להשתמש |
|---|---|---|---|
| CSV / XLS / XLSX | Reader דטרמיניסטי + מנוע סמנטי | קריאת תאים/שורות/גיליונות והבנת משמעות | לא OCR |
| PDF דיגיטלי | Reader דטרמיניסטי + מנוע סמנטי | טקסט, טבלאות, עמודים, מיקומים, משמעות | לא OCR כברירת מחדל |
| PDF סרוק / תמונה של קבלה/חשבונית | `israeli-receipt-scanner` | חילוץ חזותי של פרטי המסמך | לא CSV/Excel ולא PDF שכבר נקרא היטב |
| חשבונית/קבלה לאחר חילוץ | `il-invoice-organizer` | ארגון, נרמול, זיהוי סוג מסמך/זיכוי/עותק, חסרים | לא כתחליף לקריאת מסמך |
| הוצאה לאחר זיהוי/נרמול | `israeli-expense-categorizer` | הצעת קטגוריה + confidence + review flags | לא לקבוע אחוז הכרה/מע"מ סופי |
| קובץ/דוח בנק | `israeli-bank-connector` | קליטה ונרמול של תנועות/יתרות/תאריכים/כיוון | לא פיוס ולא קביעה עסקית |
| בנק + מקור נוסף | `israeli-bank-reconciliation` | התאמות, candidates, gaps, duplicates, unmatched | לא כשיש רק מקור אחד |
| Morning / חשבונית ירוקה | `green-invoice` | נרמול נתוני מקור/ייצוא, מסמכים, זיכויים ותשלומים | לא הוכחה לדיווח לרו"ח/רשות |
| הנהלת חשבונות לאחר מסמכים/עסקאות | `israeli-bookkeeping-automation` | הצעת/בדיקת רישום חשבונאי והשוואה לכרטסת | לא לקריאת מסמך בסיסית |
| חשבשבת | `hashavshevet-data-tools` | ETL/מיפוי של ייצואי חשבשבת | רק אם זה מקור חשבשבת |
| בדיקת/הכנת מע"מ | `israeli-vat-reporting` | VAT workpaper, פערים וחריגים | לא לכל חשבונית כברירת מחדל |
| דוח מס / שומה / החזר | `israeli-tax-returns` | ארגון ובדיקת נתוני מס לפי שנת המס | לא בלי מקור/שנה רלוונטיים |
| ניכוי מס במקור | `israeli-tax-withholding` | שיעור/סכום/תקופה והתאמה | לא לנחש שיעור |
| ביטוח לאומי | `israeli-bituach-leumi` | חיובים/מקדמות/זכויות/חובות | לא לקבוע זכאות סופית בלי מקור רשמי |
| מסמך רשות | `israeli-bureaucracy-decoder` | פירוש תפעולי של דרישה/מכתב | לא לקבוע חוקיות |
| מקור ממשלתי רשמי | `israel-gov-api` | אימות/הקשר ממקור רשמי | לא להחליף מסמך אישי כשזה מקור הראיה |
| נתון כלכלי היסטורי | `boi-economic-data` | ריבית/שער/נתון רשמי לפי מועד | לא להחליף תנאי חוזה ספציפי |

## 3. מסלולי עבודה טיפוסיים

### חשבונית דיגיטלית
`Reader → Semantic Understanding → il-invoice-organizer → Validation → israeli-expense-categorizer (אם נדרש)`

### חשבונית סרוקה
`Vision/OCR → israeli-receipt-scanner → il-invoice-organizer → Validation → categorizer לפי צורך`

### דוח בנק
`Reader → Semantic Understanding → israeli-bank-connector → Validation`

רק אם קיים מקור נוסף:
`→ israeli-bank-reconciliation`

### Morning
`Reader/Export → green-invoice → Validation → bookkeeping/reconciliation/VAT רק לפי הצורך`

## 4. מגבלות מחייבות
- Skill אינו כותב לבדו אמת קנונית.
- Skill אינו מחליף Reader.
- Skill אינו מחליף Reconciliation.
- Skill אינו קובע דיווח לרשות רק כי מסמך קיים.
- Skill אינו משלים מידע חסר בניחוש.
- תוצאת Skill נשמרת עם מקור, גרסת Skill/מנגנון, זמן, confidence/סטטוס ו-Evidence.
- חישובים דטרמיניסטיים, סכומים, יתרות, דדופליקציה וכללי matching מבוצעים בקוד.
- Canonical Promotion מתבצע רק דרך מנגנון האימות/קידום שהוגדר במערכת.

## 5. Acceptance ל-Skill Routing
לכל fixture יש להוכיח:
1. שה-Reader הנכון הופעל.
2. שלא הופעל OCR כשלא נדרש.
3. שה-Skill הופעל רק אם ה-Trigger שלו התקיים.
4. ש-Skill שלא נדרש לא הופעל.
5. שהפלט נשמר בשכבה המתאימה ולא דילג ל-Canonical.
6. שאם חסר מידע — נוצר `open_question`/`needs_review` במקום ניחוש.
7. ש-Reconciliation לא רץ על מקור יחיד.
8. שכל פלט מהותי ניתן לחזרה ל-Evidence.

## 6. שימוש יחד עם Family Matrix
`document-intelligence-family-matrix.md` מגדיר **מה צריך להבין ולהפיק** מכל משפחה ותת-סוג.

המסמך הזה מגדיר **איזה Skill, אם בכלל, נכנס באיזה שלב**.

שניהם כפופים לפרקים 5–6 ואינם מקור אמת חלופי.
