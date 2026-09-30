# Route A — מיפוי שיטות קליטה שאינן קובץ (פרקים 18–23)

> סטטוס: **אמת עבודה** (מיפוי מימוש). אינו משנה את החבילה הקנונית. כל שורה מפנה לסעיף המקור.
> נכתב לפי בקשת צאלה, 30.09.2026: "אל תממש העלאת קובץ בלבד אם המסמכים הקנוניים מגדירים שיטות קליטה נוספות".
> סיווג לפי 23D §7: Confirmed / Normalized / Gap / Deferred (נדחה במפורש בקנון).

## 1. טבלת ההפניות — כל הגדרה של קליטה שאינה קובץ

| # | שיטה / מקור | פרק וסעיף | מה נקבע שם |
|---|---|---|---|
| 1 | הזנה ידנית / מידע משיחה | 18A §6 (Source-first) | "גם הזנה ידנית או מידע שנמסר בשיחה הם מקור מסוג user_report"; הזנה ידנית → Source מסוג user_report |
| 2 | טבלת user_reports | 18A §13 | `user_reports`: source_id, reported_at, subject_type, statement, structured_payload, verification_status — "מידע ידני/שיחתי" |
| 3 | source_types שאינם קובץ־בנק | 18A §14 | correspondence (מייל/תכתובת), user_report (דיווח משתמשת), official_reference, prior_analysis |
| 4 | מייל/תכתובת | 18A §6 | מייל/תכתובת → Source מסוג correspondence "כאשר נשמרו בפועל" |
| 5 | מקור רשמי חיצוני | 18A §6, §14 | official_reference — כאשר משמש כלל/הקשר ולא תנועה אישית |
| 6 | ניתוח קודם | 18A §6, §14; 18C §31; 18E §35 | prior_analysis — אינו Canonical בלי ראיות תומכות; עזר בלבד |
| 7 | הערות / TXT / MD | 18A §43 | "TXT/MD — תכתובות/ניתוחים/הערות; מקור נשמר" |
| 8 | Email export | 18A §43 | "רק כאשר נוסף בפועל כמקור; שומרים headers/attachments באופן מבוקר" |
| 9 | מידע ידני ושיחתי | 18A §56 | user_report, reported_at, subject, payload, verification_status; לא נמחק אחרי אימות |
| 10 | בדיקת סכימה | 18A §72 | "User report נשמר כלא מאומת עד אימות" |
| 11 | ערוצי קלט | 18B §4.2 | קובץ; Connector/API; ייבוא ידני של קובץ; **דיווח משתמשת או הזנה ידנית**; **תכתובת/מייל**; official_reference; prior_analysis |
| 12 | תנאי קבלה לקליטה | 18B §4.6 | "הזנה ידנית מסומנת במפורש כ־user_report" |
| 13 | Provenance של דיווח | 18B §5.6 | "User report: הטקסט או השדה שנמסר + מועד" |
| 14 | מידע ידני בקידום | 18B §9.4 | reported/unverified; מגיע מקור מאמת — מקשרים, לא מוחקים |
| 15 | תצוגת "דווח ידנית" | 18B §19 | מותרת לפני קידום, מסומנת, לא מתערבבת עם verified |
| 16 | מידע משיחה | 18B §20.8 | user_report עם reported/unverified; "לפי דיווח" |
| 17 | שכבת Source במודל האמון | 18C §3 | "דיווח משתמשת" הוא Source |
| 18 | capture_method | 18C §4 | ידני/API/parser/OCR/vision/import |
| 19 | evidence_type | 18C §5 | user_report — "מידע שנמסר ידנית על ידי המשתמשת"; professional_response; official_rule |
| 20 | קידום | 18C §10 | User Report נשמר reported עד מקור מאמת |
| 21 | source_authority | 18C §31 | user_report — "חשוב אך מסומן reported עד אימות"; analysis — עזר בלבד |
| 22 | תרחיש בדיקה | 18C §55 | "User Report על חוב: מוצג reported עד אימות" |
| 23 | Idempotency | 18D §9 | "Manual intake: client_request_id ייחודי" |
| 24 | API Intake | 18D §16 | `POST /api/intake/upload`, **`POST /api/intake/manual-report`** → reported entity + evidence user_report |
| 25 | פעולות דומיין ידניות | 18D §19 | "כל פעולה ידנית נשמרת עם actor=user ו־Evidence מסוג user_report או decision" |
| 26 | Remote URL | 18D §35 | "Endpoints אינם מקבלים redirect URL/remote URL שרירותי ללא allowlist ו־validation" |
| 27 | Prompt injection | 18D §38 | טקסט בתוך מייל/מסמך הוא DATA |
| 28 | Webhooks | 18D §45 | "Webhooks עתידיים" |
| 29 | Connectors | 18D §46, §46A | Adapter; "Connector יכול להביא Raw Source; משם נכנס לאותו pipeline כמו העלאה ידנית" |
| 30 | Manual Intake | 18D §47 | "הזנה בשיחה/טופס היא Source מסוג user_report"; reliability=reported; הדיווח המקורי לא נמחק |
| 31 | Golden case | 18E §38 | "User Report ללא מסמך — reported, לא verified" |
| 32 | Documents Workspace | 19D §7 | Upload, Drag & Drop, **Paste**, **Email**, **Google Drive**, WhatsApp (בעתיד) |
| 33 | Upload Workspace | 19D §8 | להעלות, לבחור סוג מסמך, לעקוב אחר עיבוד |
| 34 | Upload Component | 20B §12 | גרירה, בחירת קבצים, **הדבקה**, מספר קבצים, התקדמות, ביטול, ניסיון חוזר |
| 35 | Textarea | 21A §20 | "הערות, תיאור, הסבר" — רכיב קלט; לא להצגת מסמך |
| 36 | Upload Area | 21D §7 | בחירת קובץ, Drag & Drop, בחירה מהמכשיר בנייד, מספר קבצים |
| 37 | Manual Entry Flow | 21D §53 | "נדרשת כאשר מידע אינו מגיע ממסמך או חיבור"; מסומנת User Reported עד אימות |
| 38 | Business rule | 21B §92 כלל 10 | "אין להציג User Report כעובדה מאומתת ללא אימות" |
| 39 | חשבונות ומקורות | 22A §16 | "קבצים שהועלו ידנית" לצד בנקים, חשבונית ירוקה, רשויות ועוד |
| 40 | Manual Data | 22B §86 | "מידע שהוזן ידנית מסומן כמקור ידני"; אינו הופך Verified |
| 41 | Flow 2 — העלאה | 22F §11–§13 | כניסות מ־Home/מסמכים/חשבונות ומקורות/Workspace — אותו Upload Flow של 21D |
| 42 | Evidence Rule | 23D §30 | "User-reported values", "Sources שאינם מסמך" — כל נתון ניתן להסבר לפי מקורו |
| 43 | Post-launch intake | 23C §101–§102 | כל מידע חדש באותה שרשרת קנונית |

**הקשר מחוץ ל־18–23 (לא נדרש בבקשה, נבדק להשלמה):** פרק 4 (שכבת המקורות) מגדיר "כתיבה חופשית או שיחה עם המנהל הפיננסי", דיווח על אירוע ללא מסמך, ו"מייל או ערוץ קליטה עתידי אחר, כאשר יוגדר חיבור כזה" (MASTER 01–17, פרק 4 §17 ו־§5).

## 2. מה **לא** נמצא בקנון (Gap)

| שיטה | ממצא | השלכה |
|---|---|---|
| הקלטות קול / Voice | אין הגדרה ב־18–23 ולא בפרק 4 ("שיחה עם המנהל הפיננסי" אינה מגדירה קול) | לא ממומש. Decision Required |
| קישור חיצוני (URL) כמקור | אין source_type/Flow. 18D §35 אוסר remote URL שרירותי ללא allowlist | לא ממומש. Decision Required |
| אוצר ערכים ל־`user_reports.subject_type` | שדה חובה (18A §13) בלי רשימת ערכים | Decision Required (הצעה בסעיף 4) |
| "Paste" — מה מודבק | 19D §7 / 20B §12 אומרים "הדבקה" בהקשר העלאה, בלי להגדיר טקסט מול קובץ | Normalized (סעיף 3) |

## 3. החלטות מימוש (Normalized — ללא המצאת טבלה/Status)

| # | שיטת קליטה במערכת | איך נשמר (שכבת Raw) | source_types | בסיס |
|---|---|---|---|---|
| M1 | **קובץ**: בחירה, גרירה, בחירה מהמכשיר בנייד, **הדבקת קובץ/צילום מהלוח** | `sources` + `source_files` (sha256, private bucket) | כל 19 הסוגים פרט ל־user_report | 18A §6, §13, §40–44; 19D §7; 20B §12; 21D §7 |
| M2 | **טקסט מודבק/מוקלד כמקור** (מייל שהועתק, תכתובת, ניתוח קודם, כלל רשמי, הערה) | נשמר כקובץ `.txt` בלתי משתנה (`text/plain`, sha256) → `sources` + `source_files`, `original_filename` נוצר בשרת | correspondence, prior_analysis, official_reference | 18A §43 ("TXT/MD — תכתובות/ניתוחים/הערות; מקור נשמר"), 23 §23 Immutable Raw |
| M3 | **דיווח ידני / כתיבה חופשית** | `sources`(user_report) + `user_reports` (statement, subject_type, reported_at, verification_status=unverified) | user_report | 18A §13, §56; 18D §16 manual-report, §47; 21D §53 |
| — | Connector/API, Google Drive, העברת מייל ישירה, WhatsApp, Webhooks | — | — | **Deferred**: 18D §45–46 ("עתידי"), 19D §7 ("בעתיד"), 23A §107 ("רק כאשר נדרשות בפועל"), ADR-002 (שלב 18 נדחה) |

כל שלוש השיטות: Server-side בלבד (18D §15), idempotent (`client_request_id`, 18D §9), Evidence + Audit אטומיים (18C §48), `correlation_id` (18D §40), `pipeline_state=uploaded` (18D §5), reliability של user_report = reported/unverified (18B §9.4).

## 4. הצעה ל־subject_type (ממתין לאישור — לא ימומש לפני כן)

שימוש חוזר בשמות הישויות הקנוניות של 18A (§19–§32) בלבד, בלי ערכים חדשים:
`transaction`, `income`, `expense`, `payment`, `obligation`, `receivable`, `loan`, `debt`, `agreement`, `legal_case`, `event`, `asset`, `tax_record`, `authority_record`, `account`, ועוד `unknown` כאשר הנושא אינו ידוע (18A §11 מכיר unknown כערך קנוני).

## 5. שינוי מול המימוש הקודם

המימוש הקודם של Route A (CL-0028) הגדיר רק 5 מרחבי מקור מבוססי קובץ. מעתה רישום שיטות הקליטה (`src/features/intake/intake-methods.ts`) מכסה את **כל 20** ערכי `source_type` של ה־glossary, ולכל אחד את השיטות שהקנון מתיר. חמשת מרחבי מסלול A נשארים כנקודות כניסה ממוקדות, והם משתמשים באותו רישום.
