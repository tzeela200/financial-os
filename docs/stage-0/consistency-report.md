# שלב 0: דוח עקביות קנוני (Canonical Consistency Pass)

- **תאריך:** 29.09.2026
- **פורמט:** 23D §7 (Confirmed / Normalized / Gap / Decision Required)
- **מקורות שנסרקו:** פרקים 1–17, 18 V2 (18A–18E), 19, 20, 21 (21A–21E), 22 (22A–22F), 23 (23A–23D), מפת ה־Skills
- **תוצרים מלווים:** [glossary.json](glossary.json) (מילון קנוני נעול), [scripts/terminology_gate.py](scripts/terminology_gate.py), [scripts/contrast_check.py](scripts/contrast_check.py), ADR-001 עד ADR-006
- **סטטוס מסמך:** **קנוני**. Gate 0 עבר ב־29.09.2026 (DR-1, DR-2 ו־DR-3 אושרו)

---

## 1. Confirmed: תקין, ללא שינוי

| # | נושא | מקורות תואמים |
|---|---|---|
| C-1 | `reconciliation_status` = unmatched/candidate/partial/matched/rejected/needs_review | 18A §36 · 23A §43 · 23D §25 |
| C-2 | `verification_status` (5 ערכים). `reported` אינו ערך אימות | 18A §36 · 18B §7 · 23A §12 · 23D §22 |
| C-3 | `context` = personal/business/mixed/unknown. mixed ≠ 50/50 | 18A §11 · פרקים 8 ו־13 |
| C-4 | `actuality_status` = planned/expected/actual/cancelled. actual ≠ verified | 18A §20 |
| C-5 | Buckets פרטיים: financial-source-files / -derived-files / -exports | 18A §41 · 23 §18 |
| C-6 | כסף כ־`bigint *_minor` + `currency_code`, ובלי float. NULL ≠ 0 | 18A §8–9 · 23A §21–22 · 23B §7–8 |
| C-7 | Canonical Promotion מפורש בלבד. אין Trigger ואין AI/UI direct write | 18A §46 · 18D §6 · 23 §33 · 23D §13–14 |
| C-8 | Review Queue ≠ DLQ | 18D §10B · 23 §28 · 23B §48 · 23D §28–29 |
| C-9 | מקרה 67 ₪ מול 349 ₪ → needs_review/contradiction | 18A §58 · 23 §31 · 23B §34 |
| C-10 | Documents Workspace שייך למסלול A כ־Workspace תומך | 23A §85 סוגר את 22A↔22B |
| C-11 | Notifications קיים ב־22A (Header) וב־18D §50. אינו תוספת Scope | 22A · 18D §50 |
| C-12 | אין כפילות הגדרת רכיבים בין 21A ל־21E. סריקת כותרות מצאה רק כותרות סעיפים חוזרות (Acceptance Criteria וכו'), לא רכיבים | 21A–21E |

## 2. Normalized: יושר לפי מקור קנוני ברור

| # | ממצא | יישור | סמכות |
|---|---|---|---|
| N-1 | Coverage: ב־18C §19 שישה ערכים, וב־18A §36 ו־23A חמישה | חמישה ערכים. `missing→none`, `substantially_complete→partial` | **ADR-001** (18A §36 הוא ההגדרה הרוחבית של 18) |
| N-2 | `verification_status` לתצפיות ב־18A §16 כולל 4 ערכים (בלי `contradicted`) | הציר הרוחבי בן 5 הערכים (18A §36) חל גם על Observations | 18A §36 |
| N-3 | State Machine: ב־18B §16 מופיעים `classification_pending`, `verification_pending`, `verified` ו־`canonical_pending`. ב־18D §5 מופיעים `rejected`, `duplicate`, `qa_pending`, `ready_for_review` ו־`canonical_ready` | איחוד לרצף אחד (`pipeline_state`, 23 ערכים). `canonical_pending→canonical_ready` | 18D הוא הבעלים של ה־State Machine (18A §3) |
| N-4 | `processing_status` (18A §36) ו־`pipeline_state` הם שני צירי סטטוס לאותו מסמך | נשמר רק `pipeline_state`. `processing_status` הוא סיכום לתצוגה שנגזר במיפוי דטרמיניסטי ואינו נשמר כעמודה שנייה | Terminology Gate (אין סטטוס כפול). החלטה טכנית לפי 23 §6 |
| N-5 | חומרת Exception: ב־18B §12.2 כוללת `info` וב־18C רק low–critical | 5 ערכים (כולל `info`, שאינו דורש פעולה) | 18B §12 הוא בעלי מנוע החריגים. Superset ללא שינוי משמעות |
| N-6 | סטטוס Finding: בפרק 8 open/verified/rejected/resolved, וב־18C open/verified/resolved/superseded/not_applicable | איחוד: open/verified/rejected/resolved/superseded/not_applicable | 18A §48 מגדיר במפורש `rejected` ל־Finding |
| N-7 | שמות Read Models: ב־18A §51 `money_overview`, `review_queue`, וב־18B §13 `financial_snapshot`, `review_queue_view` | `financial_snapshot`, `review_queue_view` (18B הוא בעל מנוע ה־Projection). ה־API `GET /api/money/overview` מחזיר `financial_snapshot` | 18B §13 |
| N-8 | שמות Workspaces: ב־19 (Today, Money, Tasks, Diagnostics…) וב־22A (בית, תמונת מצב, תור בדיקה…) | שמות 22A קנוניים. Tasks→Review Queue (22A: "תור החלטות, לא מנהל משימות"), Diagnostics→הגדרות > בריאות מערכת (18D §41B). המיפוי המלא ב־glossary | 23 §4–5: מסכים וניווט → 22 |
| N-9 | "Financial Manager Workspace" (19 §4, 14 אזכורים) אינו קיים ב־21 וב־22 | חלק ה־AI שבו (הסברים, תובנות) נכלל ב־Advanced AI Assistant, **R2**. ב־R1 ההסבר והראיות מגיעים דרך Evidence Panel ו־Calculation Explanation (21B) | ADR-002 · 22 גובר על מסכים |
| N-10 | מבנה קוד: 18D §60 מציע `src/server/modules/*`, ו־ADR-003 קובע `src/{app,components,features,lib,hooks,types}` | מיפוי גבולות 18D לנתיבי ADR-003 (מפורט ב־ADR-003) | ADR-003 (Repo בלבד) |
| N-11 | `knowledge_type` "question" בפרק 8 לעומת `open_question` ב־18C | `open_question` | 18C §8 |
| N-12 | תוכן העניינים (zip ודרייב): שמות הפרקים ותתי־פרקי 18 אינם תואמים לקבצים | הקבצים גוברים. תוכן העניינים אינו מקור אמת | 23 §4 |
| N-13 | Handoff 23.09 ("המשך אוטומטית אחרי Vertical Slice") | Superseded. Gates מחייבים | 23A §7, §96 |
| N-14 | לפרק 23 שני מספורים (Phases 1–16 ו־Stages 0–20) | מספור 23A מחייב | 23D §94 |
| N-15 | Design Tokens: פרק 20 אינו כולל ערכים | נקבעו ב־**ADR-004** (72/72 בדיקות WCAG AA עוברות) | 23 §12, 23A §14 |

## 3. Gap: חסר חוזה מהותי

| # | פער | היכן נדרש | הצעה (מחכה לאישור. לא ממומש עד אז) |
|---|---|---|---|
| **G-1** | אין Command לתיקון ערך שחולץ | פרק 22 Flow 15 · 23A Stage 3 Gate ("תיקון ערך שחולץ") · 23A Stage 13 (Extraction Review) | Command `correct_extraction(observation_id, corrected_value, reason)` → יוצר Observation חדשה עם `extraction_method=manual` ומסמן את המקורית כ־superseded. בלי לגעת ב־Raw, עם Audit, ומפעיל reconcile/reprocess לפי הצורך. זה בדיוק מה שמתואר ב־Flow 15 ו־18A §46. **Endpoint:** `POST /api/v1/observations/:id/correct` |
| **G-2** | אין Read Model לחיפוש גלובלי | פרק 22 Flow 24 · 22A Header | Read Model `global_search(query, types[], cursor)` מעל ישויות קנוניות, מסמכים ומקורות, עם RLS ותוצאות מוסוות. **Endpoint:** `GET /api/v1/search` |
| **G-3** | ערכי הסטטוס של `obligation_occurrences` לא הוגדרו במלואם. ב־18B מופיעים רק due/paid/overdue, ו־23B §68 דורש שתשלום חלקי לא יסגור | שלב 12 (Obligations) | expected/due/paid/overdue/cancelled, ותשלום חלקי מיוצג דרך `payment_allocations` בלי ערך `partial` נפרד. **או** הוספת `partial`. ראי DR-3 |

## 4. Decision Required: מרוכז בשאלה אחת (23D §7)

| # | החלטה | אפשרויות | המלצה |
|---|---|---|---|
| **DR-1** | חשבונית ירוקה ובנק ב־R1: קובץ ייצוא או API | (א) קבצי ייצוא דרך Ingestion, ו־API נדחה לשלב 18. (ב) API כבר ב־R1 | **(א)**, לפי 23A §107 ("אינטגרציות רק כשנדרשות"). הקבצים כבר קיימים בתיקייה (CSV/XLSX) |
| **DR-2** | טקסונומיית Findings: השם `finding_type` מתאר שני דברים שונים. ב־18A §33 ובפרק 8 הוא סוג ידע (fact/hypothesis…), וב־18C §21 הוא נושא הממצא (missing/mismatch/…) | (א) שני צירים נפרדים: `knowledge_type` (סוג הידע, 18C) ו־`finding_type` (נושא, 18C). הערכים `missing_evidence` ו־`recommendation` מ־18A יוצגו כ־`finding_type=missing` וכ־knowledge `interpretation`. (ב) ציר אחד לפי 18A | **(א)**. מתאים ל־18C, שהוא המפרט המפורט של שכבת הידע, ושומר את ההבחנה "עובדה ≠ פרשנות" |
| **DR-3** | G-1, G-2, G-3: אישור ההצעות | אישור, תיקון או דחייה | אישור כפי שמוצע. ל־G-3: בלי ערך `partial` (allocations בלבד) |

## 4א. החלטות שהתקבלו (29.09.2026)

- **DR-1:** קבצי ייצוא ב־R1. API של חשבונית ירוקה ובנק נדחה לשלב 18.
- **DR-2:** שני צירים לפי 18C: `knowledge_type` + `finding_type`.
- **DR-3:** G-1 `correct_extraction`, G-2 `global_search` ו־G-3 (בלי `partial`, דרך allocations) אושרו כפי שהוצעו.

## 5. Terminology Gate (Amendment 7)

`python scripts/terminology_gate.py`:
- 49 Enums, 72 ישויות, 19 Read Models, 24 Commands, 13 Workspaces
- **0 שגיאות:** אין שם Entity, Enum או Status כפול, אין התנגשות Enum/Entity, ואין ערך לא־קנוני בשימוש
- **פתוחים:** אין. כל הפריטים הוכרעו (סעיף 4א)

## 6. Checkpoint (23A §128)

| | |
|---|---|
| **נבנה** | ADR-001 עד ADR-006, tokens.json, glossary.json, דוח זה, 2 סקריפטי בדיקה, MASTER_EXECUTION_PLAN, CHANGELOG |
| **נבדק** | Contrast WCAG AA 72/72 · Terminology Gate: 0 שגיאות |
| **עבר** | Design Tokens Gate |
| **נכשל** | — |
| **Deferred** | Financial Manager AI panel → R2 (N-9). Stage 18 APIs (תלוי DR-1) |
| **Gate 0** | **עבר** ✓ (29.09.2026). אפשר להתחיל שלב 1 |
