# UI / UX Skill Routing — מתי מפעילים איזה Skill במסכים

**מעמד:** מסמך מימוש בלבד.  
**מקור אמת:** פרקים 19–23, ADR-004, Master Execution Plan ומפת ה-Skills המאושרת.  
המסמך אינו משנה Design System, רכיבים, מסכים או התנהגות מוצרית.

## 1. כלל יסוד
Skills של UI/UX אינם מחליפים את המפרט הקנוני. הם משמשים לבדיקה, מימוש ובקרת איכות של מה שכבר הוגדר.

סדר העבודה המומלץ:

`Existing Screen / Reference → design-review → ux-heuristics → Design System / RTL / Typography → React composition → QA → verification-before-completion`

לא כל Skill חייב לפעול בכל שינוי. מפעילים רק את מה שרלוונטי ל-Work Unit.

---

## 2. Routing לפי שלב

| Skill | מתי להפעיל | מה הוא עושה במשימה | מה אסור לו לעשות | פלט צפוי |
|---|---|---|---|---|
| `design-review` | לפני שינוי UI משמעותי, ואחרי מימוש | משווה מסך קיים לצילומים, פרק 20, פרק 21, פרק 22 ו-ADR-004; מזהה hierarchy, spacing, layout, consistency | לא להמציא שפת עיצוב חדשה; לא לשנות tokens | רשימת פערים מדויקת + before/after criteria |
| `ux-heuristics` | לפני מימוש Flow או שינוי שימושיות | בודק הבנה, discoverability, cognitive load, feedback, error prevention, navigation, context retention | לא לשנות חוקים פיננסיים או workflow עסקי קנוני | רשימת בעיות UX + הצעת תיקון התנהגותי |
| `israeli-ui-design-system` | כשמממשים/מתקנים רכיבים ועיצוב | מיישם את השפה הקנונית של המערכת הפיננסית | לא ליצור theme חלופי; לא לעקוף ADR-004 | התאמה לרכיבים/טוקנים המאושרים |
| `hebrew-rtl-best-practices` | בכל מסך עברי/RTL, במיוחד טבלאות, סכומים וניווט | בודק כיוון, alignment, bidi, icons/arrows, dates, numbers, Hebrew-English mixing | לא "לתקן" data; רק presentation/interaction | RTL checklist + תיקונים |
| `hebrew-tailwind-preset` | רק אם הוא חלק מסביבת המימוש המאושרת | מסייע ליישם RTL/Tailwind patterns עקביים | לא להכניס utility/custom values שסותרים tokens | classes/patterns תואמי המערכת |
| `web-typography` | בבניית היררכיית טקסט, KPI, table density ו-money display | שומר Heebo, scale, readability, tabular numerals | לא להחליף font או scale קנוני | typography QA / implementation guidance |
| `react-best-practices` | בזמן מימוש/Refactor של React/Next | בודק component structure, state, hooks, accessibility, performance | לא להעביר business logic ל-Frontend; לא לשכפל server state | implementation review |
| `composition-patterns` | כשיש צורך לבנות/לפרק מסכים ורכיבים | מונע שכפול; משתמש ב-shared/business components קיימים | לא ליצור abstraction מיותר או component system חדש | component composition plan |
| `qa` | אחרי המימוש ולפני סגירת Work Unit | בודק בפועל sort/filter/clear/pagination/back/context, states, mobile, RTL, errors | לא להסתפק בקריאת קוד | QA report עם pass/fail |
| `verification-before-completion` | אחרון, לפני Done | מאמת רק מה שבאמת הורץ ונבדק | לא לסמן Done על בסיס build/code/screenshot בלבד | completion evidence |

---

## 3. התאמה למסכים שנמצאים כרגע בטיפול

### Home / Current Picture
מומלץ:
1. `design-review`
2. `ux-heuristics`
3. `israeli-ui-design-system`
4. `web-typography`
5. `hebrew-rtl-best-practices`
6. `react-best-practices`
7. `qa`
8. `verification-before-completion`

דגשים:
- hierarchy של Actual / Expected / Obligations / Coverage.
- as-of ו-trust metadata.
- Unknown ≠ 0.
- drill-down לכל מספר מהותי.
- לא להציג credit limit כ-cash.

### Transactions
מומלץ:
1. `ux-heuristics`
2. `design-review`
3. `composition-patterns`
4. `react-best-practices`
5. `hebrew-rtl-best-practices`
6. `qa`
7. `verification-before-completion`

דגשים:
- sort
- filters
- clear filters
- pagination / Previous-Next
- preserving list context
- source/status/evidence visibility
- mobile table/list behavior
- filtered-empty vs true-empty

### File / Document Understanding Screen
מומלץ:
1. `ux-heuristics`
2. `design-review`
3. `composition-patterns`
4. `react-best-practices`
5. `qa`
6. `verification-before-completion`

דגשים:
- automatic decisions read-only.
- only unresolved questions actionable.
- processing/reprocessing state ברור.
- stale previous result לא נראה כ-current.
- "איך המערכת הבינה את הקובץ" ברור ולא עמוס.

### Review / Reconciliation
מומלץ:
1. `ux-heuristics`
2. `design-review`
3. `composition-patterns`
4. `hebrew-rtl-best-practices`
5. `qa`
6. `verification-before-completion`

דגשים:
- reason → evidence → candidates → decision → backend confirmation → return.
- Review Queue ≠ DLQ.
- Candidate ≠ Matched.
- context preserved after decision.

---

## 4. כללים שחייבים להישמר
- UI אינו מחשב מחדש אמת פיננסית.
- UI אינו קובע reliability; הוא מציג status מה-Backend.
- אין hard-coded colors/spacing/typography שסותרים ADR-004.
- אין "שיפור עיצוב" שמחליף flow או business rule בלי אישור.
- אין יצירת component חדש אם רכיב משותף קיים מתאים.
- אין Done בלי QA אמיתי.
- כל בעיית UI נבדקת קודם האם היא UI בלבד או נובעת מ-Read Model/Backend/Data.

---

## 5. Acceptance ל-UI Skill Routing
לכל Work Unit יש לתעד:

- `skills_selected`
- `why_each_skill_is_relevant`
- `skills_not_used_and_why`
- `design_reference`
- `canonical_sources_checked`
- `qa_scenarios`
- `browser/manual_checks`
- `mobile_widths_checked`
- `rtl_checked`
- `accessibility_checked`
- `evidence_drilldown_checked`
- `known_gaps`
- `completion_status`

---

## 6. היחס ל-skill-routing.md
- `skill-routing.md` = מסמכים, בנק, חשבוניות, מס, הנהלת חשבונות ו-Reconciliation.
- `ui-skill-routing.md` = מסכים, UX, Design System, React, QA ו-Verification.

שני המסמכים יחד מגדירים **מתי להשתמש באיזה Skill**, אך שניהם כפופים למפרט הקנוני ואינם משנים אותו.
