# Route A Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans per Work Unit. Steps use `- [ ]`.
> **מעמד:** אמת עבודה (תוכנית ביצוע). כפופה לקאנון (פרקים 1–23, ADRs, MASTER_EXECUTION_PLAN) ולמסמך־העל
> `docs/ROUTE_A_DEFINITION_OF_DONE.md`. חבילת המימוש: Route A Readiness v3 (01.10.2026).
> אושרה עקרונית על ידי צאלה ב־04.10.2026.

**Goal:** אפליקציית Route A שלמה ועובדת עם הנתונים האמיתיים של צאלה — עד שכל סעיפי ה־DoD מולאו והוכחו.

**Architecture:** אין בנייה מחדש. לכל סעיף DoD: Existing → Verify → Gap → Fix. מנוע הבנה אחד (פרק 5), Read Models
משותפים (18D), מסכים לפי 22A/22B/22C, כל מספר נפתח עד המקור.

**Tech Stack:** הקיים בלבד (ADR-003, ADR-005). אין תלות/שירות/עלות חדשים בלי אישור.

---

## 0. כללי עבודה מחייבים (מהוראת 04.10.2026)
- Work Units הם הדרך, לא התוצאה. אין עצירה אחרי DI/UI — ממשיכים ל־Release Completion מול DoD.
- לפני כל WU: טעינת Skills לפי `using-superpowers` + `skill-routing.md` / `ui-skill-routing.md`, ותיעוד מה נבחר ולמה.
- אין הנחות ואין השלמת דרישות חסרות. דבר שאינו מוגדר בקאנון → עצירה ושאלה מרוכזת.
- אין שינוי Scope או החלטת מוצר בלי אישור.
- DONE רק כשכל סעיפי ה־DoD הוכחו: נתונים אמיתיים + E2E + Regression + Production Validation.
- כל שינוי נרשם ב־WORKLOG (תאריך ושעה) וב־CHANGELOG.

## 1. מפת DoD → Existing / Gap / WU (Verify נעשה בתחילת כל WU, לא מהזיכרון)

| סעיף DoD | Existing (לפי הקוד ב־04.10) | Gap | WU | מקור קנוני |
|---|---|---|---|---|
| 1 Data — Readers, זיהוי, Evidence, Provenance | CSV/Excel/PDF דיגיטלי, מנוע סמנטי, CAL adapter | תת־סוג מפורש; רישום מסלול Skills; תדפיס עו"ש PDF לא הוכח; משפחות שאינן Route A לא מקודמות; סרוק/תמונה | DI‑0, DI‑1, DI‑2, DI‑4 | פרק 5 §3, §20–§23; פרק 6; readiness: matrix, skill-routing, bank-pdf-acceptance |
| 2 Processing | הבנה, אימות, קידום, Read Models, Reprocess, Unknown≠0, דדופליקציה | Coverage מלא לכל מקור | DI‑3, FE‑1 | פרק 5; פרק 8; פרק 13; 18B |
| 3 Financial Engine | Current Picture, הכנסות, הוצאות, כרטיסים, בנק, העברות (מועמדים), פיוס, Review Queue | הלוואות, התחייבויות, כספים עתידיים/תזרים (B2/B3), מע״מ, הנהלת חשבונות (22C) | FE‑1…FE‑3 | פרקים 7, 9, 10, 13; 22B (B2, B3); 22C; 23A שלבים 12, 14 |
| 4 Screens | בית, B1, B4, B5, Record/Evidence, Review, קובץ, מיפוי | מסך מסמכים (22B §71), B2, B3, 22C, הגדרות (22A §51) | UI‑1…UI‑5 | 22A, 22B, 22C, 22F |
| 5 UX | RTL, מובייל, מצבים בסיסיים | Filtered‑empty, Partial עקבי, נגישות מלאה, בדיקת רוחבים 320–1280 | בכל UI‑WU | פרק 19, 20, 21; ADR‑004 |
| 6 Commands | Upload, Open, Back, Save, Retry, Reprocess, Review | Sort, Filter מלא, Search (22A §23, 22F Flow 24), Pagination, Resolve לכל סוג | UI‑1, UI‑4 | 22A §23; 22B §B4; 22F |
| 7 Verification | שרשרת מלאה במסלול א׳ הקיים | הרחבה לכל מספר חדש (B2/B3/22C) | בכל FE/UI | 22B §1 ("תשובה → פירוט → ראיה"); 18C |
| 8 Real Data | 9 דפי כאל שהועלו | שאר המקורות — רק מהעלאות של צאלה | RC‑1 | DoD §8; כלל "נתונים רק מהעלאה" |
| 9 Regression | 87 unit, 274 pgTAP, 28 E2E, קורפוס ייחוס 19/19 | הרחבה לכל WU | בכל WU | 23B |
| 10 Deployment | Production + Post‑deploy | Rollback, Backup, Restore — לא אומתו בפועל | RC‑2 | 18E; 23B; 23D §118–120; Amendment 11 |

## 2. Work Units ורצף

| # | WU | תוכן | Skills (ייטענו לפני ה־WU) | Acceptance |
|---|---|---|---|---|
| 1 | **DI‑0** Fixture manifest מקומי | 11 שדות manifest + שדות סטטוס למשפחה (matrix §Acceptance status) לכל קובץ ייחוס; מחוץ ל־git | — | כל fixture מתועד; טבלת סטטוס למשפחות |
| 2 | **DI‑1** תת־סוג + מסלול עיבוד | תת־סוג מפורש או "לא נקבע" מפורש; רישום Reader / OCR / Skills שהופעלו ולמה לא; תצוגה במסך הקובץ | `israeli-bank-connector`, `green-invoice`, `il-invoice-organizer`, `test-driven-development` | Checklist A; skill-routing §5 (1–8) |
| 3 | **DI‑2** תדפיס עו"ש PDF | הוכחת תנועות מ־PDF בנק; הסקת כיוון מהפרש יתרות רק אם דטרמיניסטית ומאומתת | `israeli-bank-connector`, `systematic-debugging` לפי צורך | Checklist B; bank-pdf-acceptance §6–§9. **חסום עד fixture** |
| 4 | **DI‑3** רגרסיה ובטיחות סמנטית | הנהלת חשבונות XLSX; רישום חלקי ≠ חסר; כל C ו־D | `israeli-bank-reconciliation`, `israeli-bookkeeping-automation` (רק אם נדרש) | Checklist C, D |
| 5 | **UI‑1** תנועות (B4) | מיון, סינונים, ניקוי, דפדוף, חזרה עם הקשר (search params), מצבים, ריק מול ריק־לסינון | `ux-heuristics`, `design-review`, `composition-patterns`, `react-best-practices`, `hebrew-rtl-best-practices`, `qa`, `verification-before-completion` | Checklist E; ui-ux §8 (1–8) |
| 6 | **UI‑2** מסמכים (22B §71) + Document Detail | Workspace מסמכים לפי 22B §71; קובץ/מסמך/ראיה | כמו UI‑1 | E + Verify chain |
| 7 | **FE‑1** B2 כספים עתידיים + B3 התחייבויות וחובות | Read Models + מסכים לפי 22B; הלוואות ממקורות שנקלטו בלבד | `israeli-bank-connector` לפי צורך; UI Skills כמו UI‑1 | 23A Stage 12 Gate (§86) |
| 8 | **FE‑2** 22C התאמות + הנהלת חשבונות + מע״מ | לפי 22C ו־23A שלב 14 (בלי הגשה) | `israeli-bank-reconciliation`, `israeli-vat-reporting`, `green-invoice`, `israeli-bookkeeping-automation`; UI Skills | Stage 14 Gate; Golden VAT Dataset (23A) |
| 9 | **UI‑3** בית + B1 | as-of ו־coverage לכל מספר; drill-down; לא מסגרת כמזומן | `design-review`, `ux-heuristics`, `israeli-ui-design-system`, `web-typography`, `hebrew-rtl-best-practices`, `react-best-practices`, `qa`, `verification-before-completion` | E |
| 10 | **UI‑4** Review / Reconciliation + Global Search | חזרה עם הקשר; Resolve לכל סוג; חיפוש לפי 22A §23 ו־22F Flow 24 | `ux-heuristics`, `design-review`, `composition-patterns`, `hebrew-rtl-best-practices`, `qa`, `verification-before-completion` | E; 22F Flow 24 |
| 11 | **UI‑5** הגדרות (22A §51) | **היקף לא מוגדר בקאנון לשלב זה — ממתין להחלטה** | UI Skills | לפי ההחלטה |
| 12 | **DI‑4** משפחות נוספות + סרוק | הלוואות, דוחות אשראי, מס, רשויות וכו' לפי matrix §7–§13; סרוק — **ממתין להחלטת ספק OCR** | לפי skill-routing | matrix §Acceptance status |
| 13 | **RC‑1** Real Data | הרצה על העלאות אמיתיות של כל המקורות | `qa`, `verification-before-completion` | DoD §8 |
| 14 | **RC‑2** Deployment readiness | Rollback, Backup, Restore בפועל | `setup-deploy`, `land-and-deploy`, `canary` | DoD §10; 18E; 23D |
| 15 | **RC‑3** Release Completion | E2E מלא (Checklist F), דוח לפי Checklist G, מעבר על כל סעיפי DoD עם הוכחה | `qa`, `verification-before-completion` | DoD §11 |

כל WU מקבל תוכנית מפורטת משלו (בפורמט writing-plans) רגע לפני ביצועו, אחרי Verify על הקיים — כי ממצאי WU קודם
משנים את הבא (23A §131). WU‑1 ו־WU‑2 מפורטים להלן.

## 3. פתוחים שחוסמים (Decision Required — לא אניח)
1. **Fixture תדפיס עו"ש PDF** — העלאה דרך האפליקציה או עותק מבודד לבדיקה (DI‑2).
2. **הגדרות (22A §51)** — הקאנון אומר "יכולות לכלול בהמשך"; אין היקף מחייב ל־DoD.
3. **ספק OCR** — תנאי ל"כל מקורות הנתונים נתמכים"; עלות → החלטה שלך.
4. **Backup / Restore** — בדיקת שחזור בפועל עשויה לדרוש סביבת שחזור (branch / פרויקט נוסף) או PITR בתשלום → אישור לפני (כלל "שאלי לפני תשתית").
5. **Real Data** — העלאת כל המקורות שלך דרך האפליקציה (בנק, bit, חשבונית ירוקה, הנהלת חשבונות, הלוואות וכו').

---

## Task DI‑0: Fixture manifest מקומי

**Files:** מקומי בלבד, מחוץ ל־repo: `<scratchpad>/ref-manifest.json` (הקיים) — הרחבה.

- [ ] **Step 1:** לכל רשומה ב־manifest להוסיף את 11 השדות של `manifest.json` (family, subtype, format, provider, layout_variant, expected_concepts, expected_outputs, expected_counts_or_totals, evidence_assertions, allowed_questions, unsupported). ערכים רק ממה שנמדד בהרצת הקבלה של 01.10 (refreport) — לא הנחות; שדה שלא נמדד = `"unknown"`.
- [ ] **Step 2:** להרחיב את `tests/reference/route-a-reference.test.ts` כך שיאמת `expected_counts_or_totals` ו־`allowed_questions` מה־manifest (במקום minRecords/maxQuestions).
- [ ] **Step 3:** להריץ `REF_DIR=… REF_MANIFEST=… npx vitest run tests/reference` — צפוי 19/19.
- [ ] **Step 4:** להפיק טבלת סטטוס למשפחות (matrix §Acceptance status) לקובץ מקומי ולצרף לדוח.
- [ ] **Step 5:** commit רק לשינוי ב־harness (ללא נתונים): `test(reference): manifest schema per readiness package`.

## Task DI‑1: תת־סוג מפורש + מסלול עיבוד

**Files:**
- Create: `src/features/processing/route.ts` (טיוטה שמורה מקומית: `di1-route.ts`, ייבדק מחדש מול matrix ו־skill-routing לפני שימוש)
- Modify: `src/features/processing/understand.ts` (שדה `route`), `process-file.ts` (summary.understanding.route), `file-detail.ts` (טיפוס), `src/app/(app)/sources/files/[fileId]/page.tsx` (תצוגה)
- Test: `src/features/processing/understanding.test.ts`

- [ ] **Step 1: Failing tests**
```ts
it("records the processing route: subtype, reader, no OCR, skills applied and not applied", async () => {
  const u = understandDocument(csv(BANK), "bank_statement", []);
  expect(u.route?.subtype).toBe("current_account_transaction_statement"); // after the currency answer the rows exist
});
it("a bank PDF with facts only is an annual / summary report, never transactions", () => {
  const u = understandDocument({ ok: true, format: "pdf", meta: {}, sheets: [factsOnlySheet] }, "bank_statement", []);
  expect(u.route?.subtype).toBe("annual_summary_report");
  expect(u.normalized).toHaveLength(0);
});
it("never routes a digital file to OCR or to the receipt scanner", () => {
  const u = understandDocument(csv(BANK), "bank_statement", []);
  expect(u.route?.ocr).toMatch(/^not used/);
  expect(u.route?.skills.find((s) => s.skill === "israeli-receipt-scanner")?.applied).toBe(false);
});
it("does not apply reconciliation on a single source", () => {
  const u = understandDocument(csv(BANK), "bank_statement", []);
  expect(u.route?.skills.find((s) => s.skill === "israeli-bank-reconciliation")?.applied).toBe(false);
});
```
- [ ] **Step 2:** `npx vitest run src/features/processing/understanding.test.ts` → FAIL (route undefined).
- [ ] **Step 3:** מימוש: `route.ts` (subtypeOf + routeOf), חיבור ב־understand, ב־process-file (reconciliation applied רק כשנוצרו מועמדים בין מקורות), ותצוגה במסך הקובץ בתוך "איך המערכת הבינה את הקובץ".
- [ ] **Step 4:** הרצה → PASS; `npx tsc --noEmit`; `npx vitest run`; קורפוס ייחוס — כל קובץ מקבל תת־סוג (bit → transaction_export, CAL → monthly_statement, מזרחי שנתי → annual_summary_report, GI PDF → expenses_pdf_report…).
- [ ] **Step 5:** WORKLOG + CHANGELOG; commit `feat(processing): explicit subtype and processing route per file (DI-1)`; branch verify → CI → ff main → פריסה ואימות.
