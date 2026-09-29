# מערכת פיננסית אישית (financial-os): Master Execution Plan

> **סטטוס: קנוני ויציב.** אושר עם Amendments 1–16 ועם Final Amendments F1–F6 ב־29.9.2026. זהו מפרט הביצוע הקנוני של הפרויקט. אין צורך בביקורת ארכיטקטונית נוספת של התוכנית לפני שלב 0.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (לכל Work Unit) ו־superpowers:subagent-driven-development רק כשהמשתמשת מבקשת. צעדים בתחביר `- [ ]`.

**Goal:** לממש את המערכת הפיננסית האישית בדיוק לפי החבילה הקנונית (פרקים 1–23), שלב אחר שלב לפי 23A, בלי להמציא לוגיקה.
**Architecture:** Source → Evidence → Processing → Normalization/Verification → Reconciliation → Canonical Truth → Calculations/Coverage → Read Models/Commands → Components → Workspaces. Thin Frontend. אמת קנונית ב־Supabase/PostgreSQL עם RLS.
**Tech Stack (ADR-003, אושר):** Next.js · **React 19** · TypeScript · Tailwind · shadcn/ui · TanStack Query · RHF · Zod · Lucide · Recharts · Zustand (רק UI state משותף, לא Global Store, לא משכפל Server State) · Supabase.

**עקרון־על (Amendment 1): אי־תלות בפלטפורמה.** כל החלטה קנונית נשמרת בתיעוד הקנוני של הפרויקט: ADRs, Change Log ומסמך זה. שום שלב ביצוע אינו תלוי במערכת זיכרון של עוזר AI כלשהו.

---

## 0. הקשר: למה התוכנית קיימת

**מהות:** החבילה הקנונית הושלמה ב־29.9.2026 (פרקים 1–23). פרק 23 קובע במפורש שזהו סוף האפיון ושמעכשיו Claude Code הוא סוכן מימוש. זה לא תפקיד של מעצב.
**מה נדרש כאן:** לקבע את חוזה הביצוע, כלומר שלבים, Gates, Skills לכל שלב, החלטות פתוחות וסתירות, **לפני** כתיבת קוד.
**מה לא נמצא כאן:** קוד, ותוכניות TDD מפורטות לשלבים 2–20. לפי ה־Scope Check של writing-plans ולפי 23A §131, כל שלב מקבל תוכנית מפורטת משלו רק אחרי שה־Gate של השלב הקודם עבר, כי שלב 0 עלול לשנות שמות ישויות ו־Enums.

**בסיס הקריאה:** כל 36 מסמכי ה־zip (תואמים את תיקיית הדרייב), USER_PROFILE.md, ו־CLAUDE_CODE_HANDOFF מ־23.09. תמלולי הטקסט נמצאים ב־scratchpad (`t/01..36.txt`, מפתח ב־`index.txt`).

---

## 1. מפת מקורות האמת: סטטוס כל מסמך

| מסמך | סטטוס | נימוק |
|---|---|---|
| פרקים 01–17 (קבצים בודדים) | **קנוני** | זהים שורה־בשורה ל־MASTER 01–17 (0 הבדלים). |
| MASTER 01–17 מאוחד | קנוני, כפילות | אותו תוכן. משמש לקריאה רציפה. |
| **MASTER פרק 18 V2 (משולב)** | **קנוני** | מכיל את כל 18A–18E ועוד 117 שורות: Stateless, Circuit Breaker, DLQ, Distributed Trace, AI Quality Metrics, System Health. נוצר מאוחר יותר (11:56 לעומת 11:32). |
| MASTER 18 (18A–18E) + חמשת קבצי 18A–18E | **Superseded** | תת־קבוצה מלאה של V2. |
| פרקים 19, 20, 21, 22 | **קנוני** | יחידים. |
| פרק 23 (23A–23D) | **קנוני: חוזה הביצוע** | 23D §94: "Claude פועל לפי 23A". |
| מפת שימוש ב־Skills (29.9) | **אמת עבודה מחייבת** | אינה מחליפה פרקים (כך מוצהר בה). |
| Master_Skills_Matrix + סקירות חלקים 4–7 | רקע | קטלוג בלבד. |
| "תוכן עניינים" (zip ודרייב) | **לא עדכני** | שמות הפרקים ותתי־פרקי 18 אינם תואמים לקבצים בפועל (למשל "18A Backend Foundations" לעומת "18A Backend+DB+Storage"). הקבצים גוברים. |
| HANDOFF 23.09 + BLUEPRINT 23.09 | **Superseded** | קודם לחבילה. סותר את 23 ("אל תעצור אחרי Vertical Slice, המשך אוטומטית" לעומת Gates מחייבים). פרק 23 גובר. |
| רשימת 12 השלבים בהודעה שלך | תקציר, לא חלופה | ממופה ל־23A בסעיף 4. |

**סתירה פנימית בפרק 23:** לפרק שני מספורים. בגוף הפרק יש Phases 1–16, וב־23A יש Stages 0–20. **החלטה:** מספור 23A הוא המחייב, כי הוא מפורט יותר ו־23D §94 מפנה אליו. ה־Phases בגוף הפרק הם תקציר.

---

## 2. החלטות שהתקבלו (ADRs): **אמת קנונית מרגע הרישום**

| ADR | החלטה | מקור |
|---|---|---|
| **ADR-001 Coverage** | `unknown / none / partial / complete / stale`. `substantially_complete` מוסר, ו־`missing` של 18 V2 הופך ל־`none`. פרק 18 V2 §19 מסומן לעדכון. | תשובתך |
| **ADR-002 Release 1 Scope** | Release מוגדר לפי **Capabilities** ולא לפי מספרי שלבים. **R1:** Sources, Document Intake, Processing, Evidence, Canonical, Reconciliation, Current Picture, Accounting, VAT, Coverage, Review Queue, Mobile, RTL, Security, Backup/Restore. **R2 (Deferred):** Historical Investigation, Planning/Recovery, Forecast, Scenarios, Advanced AI. | תשובתך |
| **ADR-003 Stack & Repo** | ה־Stack שלמעלה, כולל React 19 וכללי ה־State: Server→TanStack Query, Forms→RHF, Navigation→route/search params, Local→React state, Zustand רק ל־UI משותף. Repo יחיד בשם `financial-os`, בלי monorepo, בלי Turborepo, `apps/`, `packages/` או micro-frontends. מבנה: `src/{app,components,features,lib,hooks,types}`, `docs/adr`, `supabase/{migrations,functions}`, `public`, `tests`. **Precedence:** ADR-003 גובר על ניסוח Tool-agnostic בפרקים 18 ו־23 **לבחירת Stack ומבנה Repo בלבד**. 23D נשאר תקף במלואו, וכל כללי הדומיין, Backend, Security, QA, Evidence, Audit ו־Delivery ללא שינוי. | אושר |
| **ADR-004 Design Tokens** | סט Tokens **קנוני** (לא הצעה): Typography, Colors, Semantic Colors (כולל Financial ו־Reliability), Spacing, Radius, Elevation, Motion, Breakpoints, Icon sizing, Border system, Interaction states. כל מימוש צורך אותם בלבד. הערכים נכתבים בשלב 0, כי פרק 20 אינו מכיל HEX (ממצא #5). | Amendment 6 |
| **ADR-005 Dependency Policy** | אין Dependency ללא הצדקה. לפני הוספה בודקים: אין פתרון קיים, מצב תחזוקה, תאימות RTL, השפעה על Bundle ויציבות לטווח ארוך. אם לא נחוץ, לא מוסיפים. **תמיד מעדיפים תלות מאושרת קיימת. מתעדים למה ה־Stack המאושר אינו מספיק. אין תלות רק כי היא חדשה או פופולרית.** | Amendments 15, F2 |
| **ADR-006 Versioning Policy** | אסטרטגיה אחידה ופשוטה ל־ADRs (מספור רץ, סטטוס, Supersedes), Migrations (timestamp של Supabase CLI), API Contracts (Read Models ו־Commands, גרסה בשם החוזה רק בשבירה) ו־Releases (SemVer + tag). Governance בלבד. | F6 |

**ADR-004 בלתי ניתן לשינוי אחרי אישור (F1):** אין שינוי ישיר של ערכי צבע, ריווח, טיפוגרפיה, Radius או Motion במימוש. שינוי חזותי רק דרך ADR חדש שמעדכן את ADR-004.
**Traceability (F5):** כל ADR שמשנה התנהגות קנונית מפנה לרשומת ה־CHANGELOG שלו, וכל רשומת CHANGELOG מפנה ל־ADR שיצר אותה.

**החלטה קנונית (Amendment 12):** Release = Capabilities. Stages = סדר מימוש. מוכנות Release נקבעת לפי השלמת Capabilities, לא לפי מספרי שלבים.
**Release 2 (Amendment 13):** Historical Investigation, Planning, Forecast, Scenarios, Recovery, Advanced AI Assistant.

**⚠ תיקון שנדרש ב־ADR-002 (Normalized, לא שינוי החלטה):** טבלת המיפוי ששלחת משתמשת במספור שאינו של 23A (למשל Reconciliation 6–9, בעוד שב־23A פיוס הוא שלב 4 ושלב 13). ה־ADR יירשם עם רשימת ה־Capabilities שלך כפי שהיא, כי היא קובעת, ועם מיפוי מתוקן לפי 23A:
R1 = שלבים **0–14 + 19 + 20**. שלבים **15, 16, 17** ב־R2. שלב **18** (אינטגרציות API) נדחה. ב־R1 חשבונית ירוקה נקלטת כקובץ ייצוא דרך Ingestion. זו החלטה שנגזרת מ־23A §107 ("אינטגרציות רק כשנדרשות בפועל") ותוצג לאישורך בשלב 0.

---

## 3. סתירות ופערים שכבר זוהו: קלט לדוח שלב 0

פורמט הדוח לפי 23D §7: Confirmed / Normalized / Gap / Decision Required.

| # | ממצא | מקורות | סיווג |
|---|---|---|---|
| 1 | Coverage enum | 18 V2 §19 ↔ 23A §11/58, 23D §24 | **נפתר ב־ADR-001** |
| 2 | `reconciliation_status` = unmatched/candidate/partial/matched/rejected/needs_review | 18 V2 ↔ 23A §43, 23D §25 | Confirmed |
| 3 | `verification_status` = unverified/verified/rejected/needs_review/contradicted. אין `reported` ואין `likely_verified` | 18 V2 ↔ 23A §12, 23D §22/26 | Confirmed |
| 4 | Buckets: financial-source-files / -derived-files / -exports (private) | 18 V2 ↔ 23 §18 | Confirmed |
| 5 | **ערכי HEX לא הוגדרו.** פרק 20 §7 דורש "לכל צבע ערך HEX מדויק" ואין אף ערך. גם Radius, Shadow, Motion ו־Breakpoints חסרים. מוגדרים רק Spacing (4…128) ו־Grid 8px | 20 ↔ 23 §12, 23A §14 | **נסגר ב־ADR-004** (הערכים נכתבים בשלב 0) |
| 6 | שמות תתי־הפרקים בתוכן העניינים אינם תואמים לקבצים | TOC ↔ קבצים | Normalized (הקבצים גוברים) |
| 7 | Handoff 23.09 מתיר "המשך אוטומטי אחרי Vertical Slice" | Handoff ↔ 23A §7, §96 | Normalized (23 גובר) |
| 8 | שני מספורים בפרק 23 | 23 גוף ↔ 23A | Normalized (23A) |
| 9 | Documents Workspace: שייכות בין 22A ל־22B | 23A §85 כבר סוגר | Confirmed |
| 10 | חשבונית ירוקה ב־R1: API או קובץ | ADR-002 ↔ 23A §107 | Decision Required (המלצה: קובץ) |

שלב 0 ישלים את הסריקה לפי 23A §10: Entities, Fields, Enums, Statuses, State machines, Read Models, Commands, Components (21A מול 21D), Workspace names, Navigation, Evidence, Coverage, Verification, Financial semantics, Security.

---

## 4. חוזה הביצוע: שלבי 23A, Gates ו־Skills

**כלל טעינת Skills:** Skill נטען רק בשלב שמופיע בטבלה (לפי 23 ולפי מפת ה־Skills).

**סיווג Skills (Amendment 2).** אין רשימה שטוחה. אין התקנה של Skill לפני שהוא נדרש בפועל.

| קטגוריה | Skills | מתי מותקן |
|---|---|---|
| **Required** | `writing-plans`, `executing-plans`, `verification-before-completion`, `test-driven-development`, `systematic-debugging`, `qa`, `review`, `supabase-postgres-best-practices` + Supabase Agent Skills*, `israeli-postgres-toolkit`* | לפני שלב 0/1. כולם מותקנים חוץ מ־* |
| **Optional** | `design-review`, `ux-heuristics`, `refactoring-ui`, `top-design`, `web-typography`, `israeli-ui-design-system`, `hebrew-rtl-best-practices`, `hebrew-tailwind-preset`, `react-best-practices`, `composition-patterns`, `system-design`, `clean-architecture`, `domain-driven-design`, `benchmark`, `cso`, `browse`, deploy skills | מותקנים. נטענים בשלב שלהם |
| **Conditional** | `green-invoice`, `israeli-bank-connector`, `israeli-bank-reconciliation`, `israeli-receipt-scanner`, `il-invoice-organizer` (OCR/מסמכים), `israeli-expense-categorizer`, `israeli-vat-reporting`, `israeli-bookkeeping-automation`*, `israeli-financial-reports`*, `israeli-tax-withholding`*, `shekel-currency-converter`*, `boi-economic-data`*, `israeli-bituach-leumi`*, `israeli-bureaucracy-decoder`*, `hashavshevet-data-tools`* (רק אם חשבשבת מקור), `israeli-budget-planner`, `claude-api` | רק כש־Capability ספציפית דורשת. * מותקן באותה נקודה |

**רוחביים (Required) בכל שלב:** `writing-plans` בתחילת שלב. `executing-plans` לביצוע. `test-driven-development` ללוגיקה דטרמיניסטית. `systematic-debugging` רק בכשל. `qa` ו־`review` לפני סגירת Capability. `verification-before-completion` לפני כל "Done".

**תפקיד `autoplan` (Amendment 14):** ביקורת ארכיטקטונית בלבד. מפיק ממצאים, מזהה אי־עקביות ומציע שיפורים. **לעולם לא** כותב קוד Production, לא משנה את ה־Roadmap ולא גובר על ADRs מאושרים. לפי Amendment 16 לא נדרשת ביקורת נוספת של תוכנית זו לפני שלב 0. `autoplan` יופעל לפי צורך על תוכניות השלבים המפורטות.

| שלב 23A | מה נבנה | פרקי מפרט | Skills לשלב (סיבה) | Gate (תמצית) | R |
|---|---|---|---|---|---|
| **0 Consistency** | דוח עקביות, ADRs 001–005, Tokens קנוניים (ADR-004), Glossary | כל 1–23 | `using-superpowers`, `writing-plans`, `israeli-ui-design-system` + `web-typography` (רק לערכי ADR-004, 23A §14) | אין סתירה מהותית פתוחה + **Terminology Gate** (Amendment 7): אין שמות Entity, Enum או Status כפולים, אין התנגשות מינוח או שמות קנוניים פתוחה. **שלב 1 לא מתחיל לפני מעבר** | R1 |
| **1 Foundation** | Repo, Envs, **Supabase חדש ונפרד**, Auth, Migrations, RLS, Storage, Secrets, Errors, Logging, Correlation ID, בסיס בדיקות. **תשתית בלבד** | 18 V2 (18A, 18D, 18E), 23 §14–20 | `system-design`, `clean-architecture`, `domain-driven-design` (גבולות שכבות), `supabase-postgres-best-practices` + כלי Supabase MCP + Supabase Agent Skills*, `israeli-postgres-toolkit`* | Migration על DB ריק, Login, RLS נחסם ישירות, Storage מוגן, אין Secrets בדפדפן, סביבה ניתנת להקמה מחדש. **(Amendment 8) אין קוד אפליקציה לפני מעבר Gate 1** | R1 |
| **2 Sources & Evidence** | Upload → Raw immutable (sha256) → Source/File/Document metadata → Evidence link → Processing Pending | 4, 18 V2 (18A, 18C) | `domain-driven-design`, `supabase-postgres-best-practices` | מציאה, פתיחה, זיהוי, Processing State, קובץ מקור, הוכחת אי־שינוי | R1 |
| **3 Processing** | Classification → Extraction (Observations) → Normalization → Verification. Provider Adapter, Retry/Backoff, Circuit Breaker, DLQ | 5, 18 V2 (18B, 10A, 10B) | `israeli-receipt-scanner`, `il-invoice-organizer` (מסמכים סרוקים בלבד. CSV/XLSX מפורסרים דטרמיניסטית) | מסמך תקין, לא מוכר, חלקי, שגוי, Timeout, Retry, כשל קבוע, תיקון ערך | R1 |
| **4 Reconciliation** | Match, Candidate, Partial, Rejected, Contradiction, Duplicate candidate | 7, 18 V2 (18B) | `israeli-bank-reconciliation` | כל המצבים + **67 ₪ מול 349 ₪ → needs_review** + Audit | R1 |
| **5 Canonical Truth** | Canonical Promotion בלבד, Provenance, בלי direct write | 2, 8, 18 V2 | `domain-driven-design` | Canonical → Explanation → Evidence → Document → Raw, על רשומות אמיתיות | R1 |
| **6 Calc & Coverage** | Calculation Engine דטרמיניסטי, Coverage (ADR-001), Freshness, Exceptions, Explanation | 8, 9, 13, 18 V2 | `shekel-currency-converter`* (רק אם יש מט"ח) | Complete/Partial/None/Unknown/Stale, **NULL≠0**, Known zero, Recalc | R1 |
| **7 Read Models & Commands** | חוזי Backend↔Frontend, Idempotency, Error contract | 18 V2 (18D), 19 | `clean-architecture` | Read Models ו־Commands מספיקים ל־Golden Path. אין direct canonical writes | R1 |
| **8 Design Foundation** | Tokens → Primitives → Base → Composite (הרשימה ב־23A §70) | 20, 21A | `israeli-ui-design-system`, `hebrew-rtl-best-practices`, `hebrew-tailwind-preset`, `web-typography`, `react-best-practices` | RTL, Mobile (320/360/375/390), Keyboard, Focus, WCAG AA, Tokens בלבד | R1 |
| **9 Business Components** | רק רכיבי 21B שה־Golden Path צריך | 21B | `composition-patterns`, `react-best-practices` | אין Business Logic ברכיב | R1 |
| **10 App Shell** | 22A: Header, Nav, Sidebar, Bottom Nav, Deep links, Context | 19, 22A | `react-best-practices` | Nav desktop/mobile, Back, Deep link, Auth redirect | R1 |
| **11 Golden Path 1** | Login → Upload → … → Snapshot → Drill-down → Evidence (קובץ אמיתי) | 22B, 22F | `qa`, `browse`, `design-review`, `ux-heuristics` | "העליתי → עובד → הופיע → פתחתי מספר → הגעתי למסמך" | R1 |
| **12 Current Picture** | 22B בסדר של 23A §84, כולל Documents Workspace | 13, 22B | `ux-heuristics`, `design-review` | כמה יש, מה ייכנס, מה ייצא, התחייבויות, כיסוי, וכל מספר נפתח | R1 |
| **13 Review & Reconciliation** | Reconciliation Workspace, Review Queue (≠ DLQ) | 7, 21D, 22C | `israeli-bank-reconciliation`, `israeli-expense-categorizer`, `ux-heuristics` | Review Item → למה → Evidence → החלטה → אישור Backend → חזרה | R1 |
| **14 Accounting & VAT** | Period → Coverage → … → VAT Summary → Readiness (בלי הגשה) | 9, 10, 22C | `green-invoice` (ייבוא קובץ), `israeli-vat-reporting`, `israeli-bookkeeping-automation`*, `israeli-financial-reports`*, `israeli-tax-withholding`* (רק אם רלוונטי) | Golden VAT Dataset: הכנסות, הוצאות, זיכוי, כפילות, מסמך ללא תנועה ולהפך, פער, מקור חלקי | R1 |
| 15 Historical Investigation | 22D | 11, 12, 15, 16 | `boi-economic-data`*, `israeli-bituach-leumi`*, `israeli-bureaucracy-decoder`*, `israel-gov-api` | "לא ניתן לקבוע" כתוצאה חוקית | **R2** |
| 16 Planning & Recovery | 22E | 14 | `israeli-budget-planner` | Scenario לא משנה Actual | **R2** |
| 17 AI Assistance | Explain/Summarize | 13 (AI), 18 V2 §41A | `claude-api` | AI לא כותב Canonical | **R2** |
| 18 External Integrations | Adapters ל־API | 18 V2 | `israeli-bank-connector`, `green-invoice` (API) | אין Provider shortcut | נדחה |
| **19 Hardening** | Security, Perf, A11y, RTL, Mobile, Backup, **Restore Test** | 23B | `cso`/`security-review`, `benchmark`, `design-review`, `refactoring-ui`, `top-design` (בדיקה מול Nordic Calm בלבד) | Restore מתועד, Storage כלול. **Performance Budget Gate (Amendment 10):** יעדים מדידים ל־First Load, Bundle Size, LCP ו־DB Query Budget. הערכים יכולים להתעדכן, אבל ה־Gate חובה. **Baseline נלכד בתחילת שלב 19 (F4)**, וכל אימות ביצועים שאחריו משווה אליו | R1 |
| **20 Real Data** | Inventory → Golden Dataset → Seed → הרחבה → Opening Position → Parallel Run → Cutover | 23C | `israeli-bank-reconciliation`, `verification-before-completion` | 4 הוכחות: Completeness, Integrity, Correctness, Recoverability | R1 |
| **Deploy** (כל שינוי Production) | Deployment Gate → Deploy → Post-deploy validation (23D §118–120) | 23D | `setup-deploy`, `land-and-deploy`, `canary`, `release-it` | Login, Home, Read Model, מסמך, חיפוש, Drill-down, Logs + **(Amendment 11) Backup verification, Restore verification, Rollback verification. Rollback אינו אופציונלי** | R1 |

\* = Skill שאינו מותקן. מותקן לפי הקטגוריה שלו: Required לפני שלב 1, Conditional רק כשהוא נדרש.

**מיפוי 12 השלבים שלך ל־23A:** מפרט ותכנון = 0 · ארכיטקטורה ו־Supabase = 1 · Skills פיננסיים לפי Capability = בתוך 3/4/13/14 · Work Units = כל שלב · Debug/QA/Verification = רוחביים בכל שלב, ו־19 · Design Review = 8–12 ו־19 · Deployment ו־Post-deploy = שורת Deploy.

---

## 5. סדר הפעולות מיד אחרי אישור התוכנית

- [ ] **5.1 תיעוד קנוני (Amendment 1):** שמירת מסמך זה כ־`docs/MASTER_EXECUTION_PLAN.md`, ופתיחת `docs/CHANGELOG.md` עם רישום Amendments 1–16. זמני, בתיקיית הפרויקט `פיננסי צאלה\docs\`, עד שה־Repo ייווצר בשלב 1 ואז יועבר אליו.
- [ ] **5.2 התקנת Required Skills חסרים:** Supabase Agent Skills (`npx skills add supabase/agent-skills`) ו־`israeli-postgres-toolkit` דרך `SearchSkills`/`skill-installer`, באישורך. Conditional Skills לא מותקנים עכשיו.
- [ ] **5.3 ביצוע שלב 0** (Task 0 למטה).
- [ ] **5.4 עדכון פרק 23C בדרייב** (Doc `1bdHfhZe…`) עם סעיף "Canonical Release 1 Scope" (Capabilities של R1/R2 + Release = Capabilities). הטקסט יוצג לפני הכתיבה.
- [ ] **5.5 Gate 0 + Terminology Gate**, ואז תוכנית מפורטת לשלב 1 (writing-plans) וביצוע תשתית בלבד.

---

## Task 0: Canonical Consistency Pass (שלב 0, מפורט)

**קבצים שייווצרו** (ב־repo אחרי יצירתו בשלב 1, ועד אז ב־`docs/` זמני בתיקיית הפרויקט):
- `docs/adr/ADR-001-coverage-states.md`
- `docs/adr/ADR-002-release-1-scope.md`
- `docs/adr/ADR-003-stack-and-repository.md`
- `docs/stage-0/consistency-report.md` (בפורמט 23D §7)
- `docs/adr/ADR-004-design-tokens.md` (קנוני) + `docs/design/tokens.json` (מקור אחד שממנו ייגזרו Tailwind ו־CSS vars בשלב 8)
- `docs/adr/ADR-005-dependency-policy.md`
- `docs/adr/ADR-006-versioning-policy.md`
- `docs/CHANGELOG.md`
- `docs/stage-0/canonical-glossary.md`: Entities/Enums/Statuses בשם אחד, לשימוש בשלבים 1 ואילך

- [ ] **0.1** כתיבת ADR-001, 002, 003, 005 ו־006 בפורמט Context / Decision / Reason / Consequences (23D §110), כולל המיפוי המתוקן של ADR-002 ו־Precedence של ADR-003.
- [ ] **0.2** חילוץ כל ה־Enums וה־State machines מ־18 V2 (טבלאות בתמלול `t/20.txt`) והצלבה מול 19/21/22/23. תוצאה: טבלה ב־glossary.
- [ ] **0.3** חילוץ רשימת Read Models ו־Commands מ־18 V2 (18D) והצלבה מול צרכני המסכים ב־22A–22F. כל מסך שצריך נתון שאין לו Read Model מסומן Gap.
- [ ] **0.4** השוואת רכיבים 21A↔21B↔21D. רכיב שמופיע פעמיים מאוחד (23 §11).
- [ ] **0.5** שמות Workspaces וניווט: 19C ↔ 22A.
- [ ] **0.6** Evidence, Security ו־Semantic safety: בדיקה שאין בשום פרק מעבר אסור (Unknown→0 וכו').
- [ ] **0.7** ADR-004 Design Tokens, קנוני (Nordic Calm, Heebo, Light בלבד, בלי סגול או לילך): Background, Surface, Text, Border, Brand, Success, Warning, Error, Info, Financial semantics (חיובי/שלילי/עתידי), Reliability semantics, Typography scale, Radius (מעט מרובע, לא Pill), Shadow, Breakpoints (320/360/375/390/768/1024/1280+), Motion ו־Reduced Motion, Icon sizing, Border system, Interaction states (hover/focus/pressed/disabled/selected). בדיקת ניגודיות WCAG AA לכל זוג טקסט/רקע, באמצעות סקריפט שמחשב יחס ניגודיות.
- [ ] **0.8** דוח עקביות: Confirmed / Normalized / Gap / Decision Required. כל ה־Decision Required מרוכזים בשאלה אחת מובנית אלייך (לא שאלות מפוזרות).
- [ ] **0.9 Gate 0:** אין סתירה מהותית פתוחה, ADR-004 נכתב, ו־glossary נעול. **Terminology Gate:** בדיקה אוטומטית על ה־glossary (אין שם Entity, Enum או Status כפול, ואין ערך Enum שמופיע בשתי הגדרות סותרות). Checkpoint לפי 23A §128: נבנה, נבדק, עבר, נכשל, Deferred, Gate.

## Task 1: Foundation (שלב 1, מסגרת בלבד. תוכנית מפורטת אחרי Gate 0)

- מיקום Repo מקומי: **מחוץ ל־OneDrive**, למשל `C:\dev\financial-os`, כדי למנוע סנכרון node_modules ובעיות נתיב עברי. יצירת Repo ב־GitHub (פעולה חיצונית) רק באישורך.
- **Supabase: כלל קבוע (Amendment 9).** לעולם לא עושים שימוש חוזר בפרויקט Supabase קיים. תמיד פרויקט חדש וייעודי למערכת זו. יצירה רק באישורך, כולל הצגת עלות (`get_cost`/`confirm_cost`). **מיד אחרי היצירה (F3):** Project ID ו־Project URL נרשמים ב־`docs/PROJECT_IDENTITY.md` וב־CHANGELOG.
- **Amendment 8:** בשלב 1 נכתבים רק תשתית, מיגרציות, מדיניות וקונפיגורציה. קוד אפליקציה (Features, Workspaces) רק אחרי מעבר Gate 1.
- כל Dependency שנוסף נבדק לפי ADR-005 ומתועד ב־CHANGELOG.
- סדר: scaffold (Next.js/TS/Tailwind/shadcn, `<html lang="he" dir="rtl">`, Heebo) → `supabase/migrations` מתוך 18A ו־glossary → RLS על כל טבלה מהמיגרציה הראשונה → buckets פרטיים → error contract, correlation_id ו־logger בלי PII → Vitest, Playwright ו־pgTAP (או בדיקות RLS דרך supabase-js עם משתמש לא מורשה).
- בדיקות Gate 1 כקוד: migration על DB ריק (`supabase db reset`), בדיקת RLS עם anon ועם משתמש זר, בדיקת bundle שאין בו `service_role`, ו־upload לא מורשה שנחסם.

---

## 6. גבולות קבועים לכל הביצוע (מתוך 23/23D, תקציר)

אין Unknown→0 · Candidate→Matched · Partial→Complete · Expected→Actual · Reported→Verified · Scenario→Actual · Missing Coverage→"לא נמצא".
אין direct canonical write מ־UI או מ־AI. אין Business Logic ב־Frontend. אין Mock בפרודקשן. אין Silent Fallback. אין Big Bang Import. אין הכרזת Done לפני Gate. אין Multi-tenant, Enterprise RBAC או Microservices. סכום כסף תמיד `_minor` + currency, לא float. Raw Source בלתי משתנה.
**עדיפויות בהתנגשות** (23A §123): Data integrity → Security → Financial correctness → Evidence → Core flow → Error recovery → Usability → Mobile/RTL → Performance → Polish.

## 7. אימות (Verification)

- **התוכנית עצמה:** אושרה (Amendments 1–16). אין ביקורת נוספת לפני שלב 0.
- **כל שלב:** ה־Gate בטבלה של סעיף 4, מוכח בבדיקות אוטומטיות (unit, integration, component, E2E לפי 23B) ובבדיקה ידנית ב־Mobile וב־RTL עם נתונים אמיתיים. Checkpoint קצר בסוף כל שלב.
- **Release 1:** חמש שרשראות האימות (23B §141): Source→Truth, Truth→Answer, Answer→Evidence, Conflict→Review, ו־Plan≠Reality (ב־R1: שכבות Actual/Expected נפרדות). בנוסף Golden Dataset, Golden VAT Dataset, Restore Test, ו־Launch Checklist מ־23C §91.
