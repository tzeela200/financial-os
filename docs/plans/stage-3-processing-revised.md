# שלב 3, צינור העיבוד: תוכנית מימוש מתוקנת (גרסה 2)

> **מעמד:** תיעוד ביצוע והחלטות פיתוח בלבד. **אינו מסמך קנוני** ואינו מחליף או משכפל את פרקים 1–23. במקרה של סתירה, הקנון גובר.
> **החלטות D1–D5:** קובעו על ידי צאלה ב־1.10.2026 (CL‑0039). D6–D10 הם Gaps עם התנהגות זמנית שמרנית.
> **סדר העבודה המחייב:** CANON → PLAN → RELEVANT SKILLS → WORK UNIT → IMPLEMENTATION → TESTS → VALIDATION → REPORT.
> **Skills שהופעלו לפני גרסה זו:** writing-plans, israeli-bank-connector, israeli-receipt-scanner, green-invoice, il-invoice-organizer.
> **writing-plans:** צעדי TDD עם קוד מלא נכתבים לכל יחידת עבודה בתחילתה, אחרי שהיחידה הקודמת אושרה.

**מטרה (ללא שינוי):** Vertical Slice. מעלים מקור אמיתי, המערכת קוראת אותו, שומרת את הנתונים ואת הראיות, ומציגה מה נקלט כ־Extracted, Unverified, Needs Mapping או Needs Review, לפי המצב האמיתי. שום דבר לא מוצג כ־Canonical או Verified לפני שעבר את השלבים.

---

## 1. החלטות מקובעות

| # | החלטה | מקור |
|---|---|---|
| **D1** | Excel ו־XLSX: **SheetJS Community Edition 0.20.3** ממקור ההפצה הרשמי של SheetJS. לא חבילת `xlsx` 0.18.5 מ־npm, ולא קורא עצמאי. נקראים גיליונות, תאים, טיפוסים, נוסחאות (טקסט + ערך שמור) וכותרות, עם provenance של sheet/row/column/header. התלות מתועדת לפי ADR‑005 ב־CHANGELOG בזמן ההתקנה | צאלה; פרק 5 §21–§22; 18B §5.4, §5.6; ADR‑005 |
| **D2** | PDF דיגיטלי: **unpdf**. קודם שכבת הטקסט ומבנה המקור. לכל ערך: page, location / supporting text, raw, parsed, method, extractor_version, confidence, verification_status. אין "טקסט אחד ארוך". PDF סרוק ותמונה הם מסלול נפרד (Vision/OCR, receipt-scanner) ולא מתערבבים | צאלה; פרק 5 §21–§22; 18B §5.4–§5.6; פרק 6 §3 |
| **D3** | Processing דרך **תשתית ה־jobs הקיימת**. ההעלאה רק שומרת, רושמת ויוצרת Job (18 V2 §44: "Upload finalize: רישום + enqueue"). ה־Job runner רץ בצד השרת, והדפדפן אינו המנוע. processing_runs מתעד כל מעבר. Retry לפי טבלת 18 V2 §10. כשל טכני סופי עובר ל־DLQ. בעיה עסקית או פיננסית עוברת ל־Review/Exception ולא ל־DLQ. לא נבנה Queue חדש | צאלה; 18B §4, §16–§17; 18 V2 §7–§11, §44; 18D §57, §59 |
| **D4** | קודי משפחה וסוג מסמך: מוצגים כטבלת Mapping ב־WU‑1 (שם קנוני → קוד מוצע → מקור → עמימות) לפני שהם הופכים לחוזה נתונים. לא מקבעים בשקט קוד שהומצא | צאלה; פרק 5 §3; 18B §5.3; 18A §35 |
| **D5** | **מנוע סמנטי אחד + Source Adapters + confidence + needs_mapping + review.** לא התאמה מדויקת בלבד, ולא ניחוש fuzzy לא מבוקר. Adapter נוצר רק מחומר אמיתי או ממבנה מוכר, ואינו קובע אמת לבדו. כשל של Adapter לא מפיל את התהליך. מה שלא ממופה בביטחון: Unmapped Observation עם raw header, value ו־provenance. מיפוי שאושר נשמר לשימוש חוזר | צאלה; פרק 5 §1, §4, §5, §20; 21D §12 |
| Skills | לפי מפת השימוש. Skills אינם מקור אמת, אינם כותבים Canonical, אינם ממציאים כללים, ואינם עוקפים Verification, Reconciliation, Evidence, RLS או Migrations. confidence אינו verification | צאלה; מפת השימוש §2; פרק 6 §7 |

## 2. מבנה הצינור (18B §16, 23A §34)

```
Upload (browser → signed URL) → finalize (server): sha256, register, create Job — and respond
      │
      ▼  Job runner (server; after() and sweep — §5)
accepted → classification_pending → classified → extraction_pending → extracted
→ normalization_pending → normalized → verification_pending → verified | needs_review
      │                                                     (stage 3 ends here)
      ▼  later: reconcile_scope (Stage 4) → promote_canonical (Stage 5) → refresh_projections
```

## 3. הפרדת השכבות

| שכבה | מה עושה | מה כותבת | מה אסור לה | מקור |
|---|---|---|---|---|
| **Extraction** | קוראת את כל הקובץ: כל שורה, כל תא, כל עמוד. מזהה מבנה (טבלה, כותרות, פרטי מסמך). מציעה משמעות לעמודות דרך המנוע הסמנטי וה־Adapters | `source_records` (כל שורה), `observations` (value_original, locator, method, confidence, extractor_version; unmapped / needs_mapping) | לנרמל, לחשב סכומים, לבחור "תנועה", לפרש סימן, לזרוק מידע | פרק 5 §4–§5, §21–§22; 18B §5 |
| **Normalization** | מתרגמת ייצוגים לשפה אחידה: תאריך ISO עם date_precision, כסף לאגורות עם מטבע מפורש, מזהים מנוקים ונבדקים | value_normalized_json + normalizer_version, במסגרת אותה ריצה | לאחד ישויות, לתקן ערך לא חוקי, להמציא יום או מטבע | 18B §6; 23A §37 |
| **Verification** | בדיקות דטרמיניסטיות: רצף יתרות (בנק), נטו + מע״מ מול ברוטו (רישום ההפרש), מבנה מספר עוסק, שלמות שדות חובה, מטבע | `qa_runs`, `qa_check_results`; כשל → `exceptions` + `review_queue_items` | להפוך confidence ל־verified, למחוק או לתקן נתון | פרק 5 §23–§24; 18C; 23A §38 |
| **Reconciliation** (שלב 4) | התאמה בין מקורות: בנק ↔ אשראי ↔ bit ↔ חשבוניות | שכבת הפיוס | לא קיים בשלב 3 | פרק 7; 18B |
| **Canonical Promotion** (שלב 5) | קידום אטומי של תוצאות מאושרות | טבלאות קנוניות | לא קיים בשלב 3. שום דבר בשלב 3 לא כותב לטבלאות קנוניות | 18A §46; 18 V2 §8, §12 |

## 4. המנוע הסמנטי ו־Source Adapters (D5)

**רישום המושגים (WU‑1):** כל מושג נגזר מפרק 5 §4 ו־§6–§11, עם קוד, data_type (18 V2 §16: money/date/text/id/rate), המשפחות שבהן הוא צפוי, והנוסח הקנוני שלו מפרק 5 (למשל balance: "יתרה", "יתרה לאחר פעולה", "Balance", ‏§4). אין כינויים שאינם בקנון.

**הצעת משמעות לעמודה, דטרמיניסטית ובלי AI (אפשרות ב'):** שלוש ראיות בלתי תלויות.
1. **כותרת:** חפיפת מונחים בין הכותרת המנורמלת לנוסח הקנוני של המושג.
2. **פרופיל ערכים:** איזה חלק מתאי העמודה מתפענח כתאריך, כסף, מזהה או טקסט, בהתאם ל־data_type של המושג.
3. **הקשר משפחה:** האם המושג צפוי במשפחה הזו (פרק 5 §6–§11).

מהשלוש מחושב confidence. **שיוך אוטומטי** רק כשהמושג המוביל עובר סף, ואין מושג מתחרה קרוב אליו. אחרת: needs_mapping, עם המועמדים כהצעה במסך המיפוי (21D §12: "מציעה התאמה כאשר אפשר, אך אינה ממציאה משמעות").
- "תאריך" לבד מתאים לחמישה מושגי תאריך, ולכן: needs_mapping עם הצעות.
- "תאריך לידה" אינו צפוי באף משפחה של מסלול A, ולכן: needs_mapping.

**הספים** הם פרמטרים של המימוש. הם מתועדים כאן ונכללים ב־extractor_version.

**Source Adapter:**
- נוצר רק מחומר אמיתי: מיפוי שאישרת על קובץ אמיתי, או מבנה מוכר שנבדק על קובץ אמיתי.
- מכיל: source_type, חתימת כותרות, מיפוי עמודה → מושג, רמזי מבנה ופורמט, גרסה, ומקור יצירה (evidence).
- כשהחתימה תואמת, ה־Adapter מוסיף ראיה חזקה, וה־confidence נרשם עם method `adapter`. כשאינה תואמת או שה־Adapter נכשל, המנוע הסמנטי ממשיך לבד (פרק 5 §20).
- **אחסון:** Gap. ב־18A אין טבלה ייעודית. ההחלטה ב־WU‑1 (§8, G‑A).

## 5. איך ההעלאה יוצרת ומפעילה Job (D3)

1. `finalizeFileUpload` מחשב sha256 וקורא לפונקציית הקליטה. מיגרציה חדשה מחליפה את הפונקציה של 021, ובאותה טרנזקציה:
   - רושמת את המקור ואת הקובץ (קיים);
   - מעבירה uploaded → accepted → classification_pending, עם רשומות ב־processing_runs;
   - יוצרת ב־`jobs` רשומת `process_source` עם idempotency_key `process_source:{file_id}:{processing_version}` (18B §17), max_attempts לפי סוג Job, correlation_id שעובר בירושה (18D).
2. התגובה חוזרת מיד לדפדפן ("נקלט — בעיבוד"). אין חילוץ לפני התגובה.
3. **מפעיל:** אחרי התגובה, השרת מפעיל את ה־runner דרך `after()` של Next.js, יכולת מובנית בלי תשתית חדשה. העיבוד ממשיך גם אם הדפדפן נסגר.
4. **Runner:** `processing_claim_job` תופס Job פנוי (`FOR UPDATE SKIP LOCKED`, locked_at/lock_owner, lease עם תפוגה, attempt_count). הוא מריץ שלב אחרי שלב, עם checkpoint לכל שלב ורישום ב־processing_runs.
5. **כשל טכני** (timeout, אחסון, parser_transient): retry_wait עם exponential backoff + jitter, לפי 18 V2 §10. אחרי max_attempts: `dead_letter_jobs` (job, error history, attempt history, correlation_id) ופריט תפעולי.
6. **כשל עסקי** (validation_error, unsupported_format, needs_mapping, בדיקה שנכשלה): needs_review, `exceptions` ו־`review_queue_items`, **בלי retry loop ובלי DLQ** (18 V2 §10B, 18D §57).
7. **Gap אמיתי, G‑B:** ניסיון חוזר מתוזמן (retry_wait, lease שפג) בלי פעילות של משתמשת דורש מתזמן זמן, והתשתית הקיימת לא מספקת אותו.
   - **ביניים, בלי תשתית:** כל רינדור בצד השרת של מסכי מסלול A מבצע sweep קצר, שמפעיל את ה־Jobs שזמנם הגיע. זה תלוי בפעילות, לא בדפדפן פתוח.
   - **פתרון מלא, דורש אישור כי זו תשתית חדשה:** `pg_cron` + `pg_net` (הרחבות מובנות ב־Supabase), או Vercel Cron (בתוכנית Hobby: פעם ביום בלבד).

## 6. הקוד מהבוקר: נשאר, Refactor, מוחלף

| קובץ | החלטה | פירוט |
|---|---|---|
| `normalize.ts` | **נשאר + Refactor קטן** | נשמרים parseAmountMinor, parseDateIso, headerKey, isValidIsraeliTaxId (18B §6.2). מתווספים date_precision; דיוק מעבר לאגורות יוצר חריגה במקום null שקט; שנה דו־ספרתית לפי D7. מוסר isDigits |
| `concepts.ts` | **Refactor** | מבנה המושגים נשמר. רשימת כ־220 הכינויים וההתאמה החלקית מוסרות, ובמקומן הנוסח הקנוני מהרישום המאושר (WU‑1). נוסף מנוע ההצעה (§4) |
| `tabular.ts` | **מוחלף חלקית** | קורא ה־ZIP/XLSX וקורא ה־HTML העצמאיים מוחלפים ב־SheetJS (D1), שקורא גם קובצי "XLS" שהם HTML וגם XLS בינארי ישן. קורא ה־CSV והפענוח נשארים (מחרוזות גולמיות, UTF‑8/Windows‑1255), ומתווספת שמירת delimiter, encoding ושורת הכותרת |
| `extract.ts` | **Refactor ופיצול** | נשארים זיהוי הטבלה, סיווג השורות והתצפיות עם locator. מתפצל ל־classify, extract, normalize-step ו־validate (§3). **מוסרים:** סכומים מצטברים, "תנועה", סימן לפי כיוון, עדיפות סכום. כרטיס אשראי: שני הסכומים נשמרים |
| `process-file.ts` | **מוחלף** | Job runner לפי §5 |
| מיגרציה 022 | **מוחלפת** | לא הופעלה בשום מקום. פונקציות: claim, advance, write_records, fail/complete, ועדכון פונקציית הקליטה |
| `actions.ts` | **Refactor** | הקריאה בתוך finalize מוסרת. נוסף `after()` שמפעיל את ה־runner |
| `file-detail.ts` + מסך הקובץ | **Refactor** | הסכומים המצטברים מוסרים. נוספים ציר שלבים, needs_mapping, בדיקות וחריגות |
| `process-button.tsx` | **Refactor** | "ניסיון חוזר" ל־Job שנכשל, דרך פקודה לשרת |
| `upload-area.tsx`, `source-file-list.tsx`, `source-files.ts`, `business.css` | **נשארים** | עדכון תוויות |
| `processing.test.ts` | **Refactor** | נשמרות בדיקות הנרמול וה־CSV. השאר ב־TDD |
| `tsconfig.json` ES2022 | **נשאר** | נדרש לסכומים מדויקים |

## 7. יחידות העבודה

| WU | תוכן | חוסם? |
|---|---|---|
| **WU‑1** | רישום קנוני (מושגים, משפחות, source_type → family), אחסון Adapters (G‑A), נוסח תיקון ADR‑008. מסמכים בלבד, לאישור | כן |
| **WU‑2** | צינור ה־Jobs: מיגרציה (claim, advance, write, fail/complete, עדכון הקליטה), after() + sweep, retry/backoff, DLQ, processing_runs. TDD + pgTAP | כן |
| **WU‑3** | מסלול CSV: classify → extract (מנוע סמנטי + Adapters) → normalize → validate. TDD | כן |
| **WU‑4** | מסך הקובץ: ציר שלבים, שורות, משמעות עמודות, needs_mapping, בדיקות, חריגות, ניסיון חוזר | כן |
| **WU‑5** | מסך מיפוי (21D §12): אישור יוצר Adapter ומפעיל `reprocess_source`; הריצה הקודמת נשמרת | כן |
| **WU‑6** | XLSX, HTML‑XLS ו־XLS ישן דרך SheetJS (D1) | מרחיב |
| **WU‑7** | PDF דיגיטלי דרך unpdf (D2) | מרחיב |
| **WU‑8** | סגירת שלב: 23A §41, E2E, design-review, verification, Change Log, Checkpoint, ענף verify → CI → main | כן |
| **WU‑9** | סריקות ותמונות: receipt-scanner דרך Provider Adapter (23A §39), החלטת ספק נפרדת | נפרד |

**Vertical Slice ל־CSV:** אחרי WU‑2 עד WU‑5.

## 8. WU‑1, מפרט

- **Specification:**
  - (1) רישום מושגים: code, data_type, משפחות, נוסח קנוני ומקור (פרק + סעיף).
  - (2) טבלת משפחות: שם קנוני → קוד מוצע → מקור → עמימות.
  - (3) מיפוי source_type → family.
  - (4) document_type_code: Gap. הצעה: null עם סיבה, עד שיוגדרו כללי סוג.
  - (5) G‑A, אחסון Adapters.
  - (6) נוסח תיקון ADR‑008.
  - אחרי אישור: הוספה ל־`docs/stage-0/glossary.json` והרצת Terminology Gate.
- **Dependencies:** אין קוד ואין תלות חדשה.
- **Existing Components:** glossary.json וסקריפט ה־Terminology Gate ב־`docs/stage-0/scripts`; טבלאות documents ו־observations (מיגרציה 005); rule_versions (מיגרציה 016).
- **Data Contracts:** `documents.document_family_code`, `documents.document_type_code`, `observations.concept_code`, `observations.data_type`, ואחסון Adapter.
- **Skills:** writing-plans, domain-driven-design; israeli-bank-connector, green-invoice ו־il-invoice-organizer לבדיקת השדות הצפויים מול המשפחות.
- **Acceptance Criteria:**
  - כל קוד מצביע על פרק וסעיף.
  - אין שינוי משמעות מול פרק 5.
  - Terminology Gate עובר (אין כפילויות).
  - העמימויות מסומנות.
  - צאלה מאשרת לפני שהקודים נכנסים לקוד.
- **Risks:**
  - פרק 5 §3 (17 משפחות) ו־18B §5.3 (15 משפחות + תכתובות) אינם זהים.
  - אין source_type ייעודי לחשבונית או קבלה בודדת.
  - government_authority מכסה גם ביטוח לאומי וגם רשויות.
  - rule_versions מיועדת לכללים, ושימוש בה ל־Adapters עלול לבלבל.

## 9. Acceptance Criteria מקצה לקצה (שלב 3)

1. בקשת ההעלאה רק שומרת, רושמת ויוצרת Job. מוכח בבדיקה שאין observations כשהתגובה חוזרת.
2. ה־Job רץ בשרת גם אם הדפדפן נסגר. כל מעבר רשום ב־processing_runs עם סיבה.
3. מספר ה־source_records שווה למספר השורות שאינן ריקות. שורות כותרת, פרטי מסמך ונתונים מובחנות. שורות סיכום לא מתערבבות עם תנועות (18B §5.7).
4. לכל observation יש locator, method, confidence, extractor_version, value_original ו־value_normalized.
5. עמודה בלי ביטחון מספיק → needs_mapping עם raw header ועם הצעות. "תאריך לידה" לא משויך.
6. מיפוי שאושר יוצר Adapter ו־reprocess. הריצה הקודמת נשמרת. נרשם audit. בקובץ הבא מאותו מבנה, השיוך אוטומטי עם method adapter.
7. כרטיס אשראי: גם סכום העסקה וגם סכום החיוב נשמרים. אין "תנועה".
8. המסך מציג את מה שנקרא ואת המצבים בלבד. אין סכומים מצטברים. אין Canonical ואין Verified.
9. כשל עסקי → exception + review item, בלי DLQ. כשל טכני → retry ואז DLQ.
10. 23A §41 ו־18D §57: מסמך תקין, לא מוכר, חילוץ חלקי, חילוץ שגוי שתוקן במיפוי, timeout, retry, כשל קבוע, Job כפול, שני runners, reprocess בזמן ריצה.
11. XLSX ו־PDF דיגיטלי עוברים את 1–10. ל־PDF: page ו־location.
12. pgTAP לכל פונקציה. RLS ללא שינוי. אין secrets בדפדפן. CI ירוק.

## 10. Gaps פתוחים (לא חוסמים, עם התנהגות זמנית)

| # | Gap | התנהגות זמנית |
|---|---|---|
| G‑A | אחסון Source Adapters (אין טבלה ב־18A) | החלטה ב־WU‑1: rule_versions עם domain `source_adapter`, בלי שינוי סכמה; או טבלה ייעודית |
| G‑B | מתזמן לניסיון חוזר בלי פעילות משתמשת | sweep בכל רינדור שרת. pg_cron/pg_net או Vercel Cron דורשים אישור |
| D6 | סף עיגול נטו + מע״מ | רושמים את ההפרש, ולא מכריעים |
| D7 | שנה דו־ספרתית | needs_review עם הערך המקורי |
| D8 | כלל שורת סיכום | שורה בלי תאריך תקין בעמודת התאריך שמופתה → "שורה אחרת", נפרדת, לא בשום חישוב |
| D10 | מה פירוש verified בשלב 3 | כל התצפיות unverified. מצב המסמך verified/needs_review רק לפי הבדיקות |
| G‑C | document_type_code | null עם סיבה |
