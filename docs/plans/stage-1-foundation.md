# שלב 1 — Foundation: תוכנית מימוש מפורטת

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. צעדים בתחביר `- [ ]`. **תשתית בלבד** (Amendment 8): אין Features, Workspaces או קוד אפליקטיבי לפני מעבר Gate 1.

**Goal:** להקים את שלד המערכת (Repo, סביבות, Supabase נפרד, Auth, סכמת 18A + טבלאות האמון והתפעול של 18C/18D, RLS, Storage פרטי, Secrets, שגיאות, לוגים, Correlation ID ובסיס בדיקות) כך ש־Gate 1 מוכח בבדיקות אוטומטיות.

**Architecture:** Next.js (React 19) כקליפה דקה עם Login בלבד. Supabase/PostgreSQL הוא מקור האמת. כל טבלה רגישה נושאת `owner_user_id` עם RLS `owner_user_id = (select auth.uid())`. Migrations לפי סדר 18A §71. המילונים נזרעים מתוך `glossary.json` כדי שיהיה מקור שמות אחד. סביבת dev/test מקומית (Supabase ב־Docker) מופרדת מפרויקט הענן, שמשמש כ־production ולא יקבל נתונים אמיתיים עד שלב 11.

**Tech Stack:** Next.js · React 19 · TypeScript · Tailwind · @supabase/supabase-js · @supabase/ssr · Zod · React Hook Form · Supabase CLI · pgTAP (`supabase test db`) · Vitest · Playwright · GitHub Actions.

**Skills לשלב (לפי Master Plan):** `supabase` (הותקן), `supabase-postgres-best-practices`, `israeli-postgres-toolkit`, `system-design`, `clean-architecture`, `domain-driven-design`, `test-driven-development`, `verification-before-completion`.

**מקורות מפרט:** 18A §4–§73 · 18C §46–§48 · 18D §27–§33, §39–§40, §53–§58 · 23 §14–§20 · 23A §16–§25 · ADR-001…006 · `docs/stage-0/glossary.json`.

> **הערת שיטה (סטייה מודעת מ־writing-plans):** SQL מלא מופיע לכל התשתית, הדפוסים, מיגרציות 001–004 והבדיקות. למיגרציות 005–014 (טבלאות הדומיין של 18A) המפרט הוא טבלת העמודות המדויקת של 18A, יחד עם תבנית ה־SQL מ־Task 5, כי מדובר בתרגום מכני. העתקת ~60 טבלאות פעמיים (בתוכנית ובקוד) הייתה יוצרת שני מקורות אמת.

---

## החלטות טכניות שהתוכנית מקבעת (בסמכות 23 §6, ללא שינוי מוצר)

| # | החלטה | נימוק |
|---|---|---|
| T-1 | **dev/test = Supabase מקומי ב־Docker. prod = פרויקט הענן החדש.** אין פרויקט ענן שני | 18D §54: המינימום הוא סביבת בדיקה בלי נתוני production. מונע עלות של פרויקט שני |
| T-2 | אזור ענן: **eu-central-1 (Frankfurt)** | הקרוב ביותר לישראל מבין אזורי Supabase |
| T-3 | Auth: אימייל + סיסמה, **הרשמה ציבורית כבויה** אחרי יצירת המשתמשת היחידה | 18D §27. מערכת אישית, ואין לאפשר לזר להירשם |
| T-4 | בעלות: `owner_user_id uuid not null default auth.uid()` בכל טבלה רגישה | 18D §28 מתיר במפורש. טבלאות מילון: קריאה לכל מאומת, כתיבה חסומה |
| T-5 | נתיב Storage: `{owner_uid}/{source_id}/{file_id}/original.{ext}`, ו־derived: `{owner_uid}/{source_id}/{file_id}/{processing_version}/...` | יישור בין 18A §41 ל־18D §32 (18D הוא סמכות האבטחה). ה־uid ראשון כדי שמדיניות Storage תבדוק בעלות |
| T-6 | Jobs בשלב 1: טבלאות + RPC `claim_next_job` (FOR UPDATE SKIP LOCKED) + idempotency. ה־Runner עצמו בשלב 2/3, עם סוג ה־Job הראשון | 23 §14 ("בסיס Jobs"). YAGNI |
| T-7 | Views/Read Models (18A מיגרציה 017) **לא** בשלב 1 | Read Models שייכים לשלב 7 |
| T-8 | Deploy לענן דרך `supabase db push` (CLI) בלבד. Supabase MCP משמש רק לאימות read-only (tables, advisors) | היסטוריית Migrations אחת (ADR-006) |

## תיקון Glossary לפני הסכמה (Normalized, נרשם ב־CHANGELOG)

18C §46 מגדיר שמות טבלאות אמון, ומורה "למפות לשמות הקנוניים הקיימים ב־18A ולהימנע מכפילויות". ב־glossary שנעל ב־Gate 0 יש שלוש סטיות, והן מתוקנות כאן:

| ב־glossary (שגוי) | קנוני | סמכות |
|---|---|---|
| `review_items` | `review_queue_items` | 18C §46 |
| `skill_runs`, `ai_runs` | `tool_runs` (עמודה `tool_kind`: skill/ai/parser/rule_engine) | 18C §46 + §25 |
| חסרות | `evidence_links`, `provenance_edges`, `knowledge_items`, `qa_check_results`, `rule_versions` | 18C §46 |
| — (לא נוספות) | `coverage_requirements`/`coverage_results` ממופות ל־`coverage_scopes`/`coverage_periods` הקיימות, ו־`calculations` ממופה ל־`calculation_runs` | 18C §46 ("אין כפילויות סכימה") |

---

## Task 0: דרישות קדם (פעולות שלך, חד־פעמיות)

**מהות:** שלושה כלים חסרים במחשב: Docker, GitHub CLI ו־Supabase CLI. ה־CLI של Supabase יותקן כתלות dev של ה־Repo, ולכן לא צריך להתקין אותו כאן.

- [ ] **0.1** להתקין Docker Desktop (חינם לשימוש אישי) ולהפעיל אותו. אפשר מ־docker.com, או בטרמינל:

```bash
winget install -e --id Docker.DockerDesktop
```

- [ ] **0.2** להתקין את GitHub CLI:

```bash
winget install -e --id GitHub.cli
```

- [ ] **0.3** להתחבר ל־GitHub. זו התחברות אינטראקטיבית שאת מבצעת בעצמך, כי אני לא מזין פרטי גישה:

```bash
gh auth login
```

- [ ] **0.4** לאשר את עלות Supabase (**$10 לחודש**) ואת האזור Frankfurt. יצירת הפרויקט עצמו מתבצעת ב־Task 21.

**אימות:** `docker --version`, `gh auth status` ו־`docker info` מחזירים הצלחה.

---

## Task 1: תיקון Glossary (שמות טבלאות 18C)

**Files:** Modify `docs/stage-0/glossary.json`, `docs/CHANGELOG.md`

- [ ] **1.1** בעריכת `glossary.json`, ב־`entities.trust`, להחליף את הרשימה ב:

```json
"trust": ["evidence", "evidence_links", "provenance_edges", "entity_field_sources", "knowledge_items", "exceptions", "review_queue_items", "qa_runs", "qa_check_results", "tool_runs", "rule_versions", "audit_events"]
```

- [ ] **1.2** להוסיף תחת `$meta` את המפתח `"mapped_equivalents": {"coverage_requirements": "coverage_scopes", "coverage_results": "coverage_periods", "calculations": "calculation_runs"}`.
- [ ] **1.3** להריץ `python docs/stage-0/scripts/terminology_gate.py`. **צפוי:** 0 שגיאות ו־`OPEN: none`.
- [ ] **1.4** להוסיף ל־CHANGELOG שורה: `CL-0010 | Glossary trust-table names aligned to 18C §46 (review_queue_items, tool_runs, +evidence_links, provenance_edges, knowledge_items, qa_check_results, rule_versions); 18C coverage/calculation tables mapped to 18A equivalents. | Stage-1 plan`.

---

## Task 2: Repository ושלד Next.js

**Files:** Create `C:\dev\financial-os\` (כל השלד)

- [ ] **2.1** ליצור את השלד:

```bash
mkdir -p /c/dev && cd /c/dev && npx create-next-app@latest financial-os --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

**צפוי:** תיקייה עם `src/app`, ו־`package.json` עם `next`, `react@19` ו־`react-dom@19`.

- [ ] **2.2** להתאים את המבנה ל־ADR-003:

```bash
cd /c/dev/financial-os && mkdir -p src/components src/features src/lib/server src/hooks src/types/contracts docs/adr supabase tests/{e2e,rls,regression,golden} scripts
```

- [ ] **2.3** להעתיק את התיעוד הקנוני אל ה־Repo:

```bash
cp -r "/c/Users/Allbi/OneDrive/שולחן העבודה/פיננסי צאלה/docs/." /c/dev/financial-os/docs/
```

- [ ] **2.4** להוסיף ל־`.gitignore` את השורות הבאות, בתוספת לברירת המחדל של Next:

```gitignore
.env
.env.*
!.env.example
supabase/.temp/
supabase/.branches/
playwright-report/
test-results/
```

- [ ] **2.5** ליצור את `.env.example` (שמות בלבד, בלי ערכים, לפי 18A §54):

```dotenv
# Public (safe to expose)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Server only — never NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **2.6** לבצע Commit ראשון ולצור Repo פרטי ב־GitHub (מאושר על ידך):

```bash
git init -b main && git add -A && git commit -m "chore: scaffold financial-os (ADR-003) with canonical docs"
gh repo create financial-os --private --source . --push
```

**צפוי:** `gh repo view financial-os` מחזיר `visibility: PRIVATE`.

- [ ] **2.7** לרשום את כל התלויות שנוספו ב־CHANGELOG, לפי ADR-005: `CL-0011 | Dependencies (scaffold): next, react, react-dom, typescript, tailwindcss, eslint — ADR-003 stack. | ADR-005`.

---

## Task 3: Supabase מקומי

**Files:** Create `supabase/config.toml` (נוצר על ידי ה־CLI), Modify `package.json`

- [ ] **3.1** להתקין את ה־CLI כתלות dev ולאתחל:

```bash
npm i -D supabase && npx supabase init
```

- [ ] **3.2** ב־`supabase/config.toml` להגדיר:

```toml
[auth]
site_url = "http://localhost:3000"
enable_signup = false

[auth.email]
enable_signup = false
enable_confirmations = false

[db]
major_version = 17
```

- [ ] **3.3** להוסיף scripts ל־`package.json`:

```json
"db:start": "supabase start",
"db:reset": "supabase db reset",
"db:test": "supabase test db",
"db:types": "supabase gen types typescript --local > src/types/database.ts",
"seed:gen": "node scripts/generate-seed.mjs"
```

- [ ] **3.4** להריץ `npm run db:start`. **צפוי:** פלט עם `API URL`, `anon key` ו־`service_role key`. לכתוב אותם ל־`.env.local` (לא נכנס ל־Git).
- [ ] **3.5** Commit: `chore: add local supabase (dev/test env, T-1)`.

---

## Task 4: Migration 001 — Extensions, Foundation, Helpers

**Files:** Create `supabase/migrations/20260930000001_foundation.sql`, Test `supabase/tests/001_foundation_test.sql`

- [ ] **4.1** לכתוב בדיקה שנכשלת:

```sql
begin;
select plan(5);
select has_table('public', 'app_profile', 'app_profile exists');
select has_table('public', 'processing_versions', 'processing_versions exists');
select has_function('public', 'set_updated_at', 'set_updated_at exists');
select has_function('public', 'is_owner', array['uuid'], 'is_owner exists');
select col_type_is('public', 'app_profile', 'timezone', 'text', 'timezone is text');
select * from finish();
rollback;
```

- [ ] **4.2** להריץ `npm run db:test`. **צפוי:** FAIL (הטבלאות לא קיימות).
- [ ] **4.3** לכתוב את המיגרציה:

```sql
create extension if not exists pgcrypto with schema extensions;

-- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.is_owner(owner uuid) returns boolean
language sql stable set search_path = '' as $$
  select owner = (select auth.uid()) $$;

-- foundation (18A §12)
create table public.app_profile (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text,
  locale text not null default 'he-IL',
  timezone text not null default 'Asia/Jerusalem',
  default_currency char(3) not null default 'ILS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_app_profile_updated before update on public.app_profile
  for each row execute function public.set_updated_at();

create table public.system_settings (
  key text primary key,
  value_json jsonb not null,
  scope text not null default 'app',
  owner_user_id uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.schema_versions (
  id uuid primary key default gen_random_uuid(),
  component text not null,
  version text not null,
  effective_from timestamptz not null default now(),
  notes text,
  unique (component, version)
);

create table public.processing_versions (
  id uuid primary key default gen_random_uuid(),
  component_type text not null check (component_type in ('parser','normalizer','calculator','reconciler','qa','projection')),
  component_name text not null,
  version text not null,
  released_at timestamptz not null default now(),
  active boolean not null default true,
  unique (component_type, component_name, version)
);
```

- [ ] **4.4** להריץ `npm run db:reset && npm run db:test`. **צפוי:** PASS 5/5.
- [ ] **4.5** Commit: `feat(db): foundation tables and helpers (18A §12)`.

---

## Task 5: דפוס טבלה קנוני (תבנית לכל שאר המיגרציות)

**מהות:** כל טבלה רגישה נבנית באותו אופן. הדפוס נקבע פעם אחת ונבדק כאן. בתבנית מופיעים `<table>` ו־`<domain columns>` כמשתני הדפוס בלבד, ובכל Task מופיעות העמודות בפועל.

```sql
create table public.<table> (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  -- <domain columns per 18A>
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index on public.<table> (owner_user_id);
create trigger trg_<table>_updated before update on public.<table>
  for each row execute function public.set_updated_at();
alter table public.<table> enable row level security;
alter table public.<table> force row level security;
create policy <table>_owner_select on public.<table> for select to authenticated using (public.is_owner(owner_user_id));
create policy <table>_owner_insert on public.<table> for insert to authenticated with check (public.is_owner(owner_user_id));
create policy <table>_owner_update on public.<table> for update to authenticated using (public.is_owner(owner_user_id)) with check (public.is_owner(owner_user_id));
-- no DELETE policy: no hard delete (18A §2, §48)
```

**חוקי עמודות מחייבים (18A §7–§10, Glossary):**
- סכום: `<name>_minor bigint` ולצידו `currency_code char(3)` עם `check (<name>_minor is null or currency_code is not null)`
- תקופה: `check (period_end is null or period_start is null or period_end >= period_start)`
- כל Enum מה־glossary: `text not null check (<col> in (...values from glossary...))`. ה־check נוצר מה־glossary דרך הסקריפט ב־Task 6, ואין כתיבה ידנית של ערכים
- שדה context: `context text not null default 'unknown'`
- אין `float`/`real`/`double` בשום מקום (בדיקה אוטומטית ב־Task 15)

**טבלאות קנוניות (שכבת Canonical):** אין להן policies של insert/update ל־`authenticated`. כתיבה מתבצעת רק דרך RPC/Server מבוקר (18C §53, 23D §13). הן מקבלות select בלבד.

---

## Task 6: Migration 002 — מילונים + Seed מתוך ה־Glossary

**Files:** Create `scripts/generate-seed.mjs`, `supabase/migrations/20260930000002_dictionaries.sql`, `supabase/seed.sql` (generated), `scripts/enum-checks.mjs`, Test `supabase/tests/002_dictionaries_test.sql`

- [ ] **6.1** בדיקה שנכשלת:

```sql
begin;
select plan(4);
select has_table('public', 'dictionary_values', 'dictionary table exists');
select is((select count(*)::int from public.dictionary_values where dictionary = 'coverage_status'), 5, 'coverage_status has 5 values (ADR-001)');
select is_empty($$select 1 from public.dictionary_values where code in ('substantially_complete','missing','reported','likely_verified')$$, 'no forbidden values');
select is((select count(*)::int from public.dictionary_values where dictionary = 'verification_status'), 5, 'verification_status has 5 values');
select * from finish();
rollback;
```

- [ ] **6.2** מיגרציה: טבלת מילון אחת (18A §35: code, label_he, label_en, description, active, sort_order):

```sql
create table public.dictionary_values (
  dictionary text not null,
  code text not null,
  label_he text,
  label_en text,
  description text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (dictionary, code)
);
alter table public.dictionary_values enable row level security;
create policy dictionary_read on public.dictionary_values for select to authenticated using (true);
-- writes only via migrations/seed (no insert/update policy)
```

- [ ] **6.3** מחולל ה־Seed (`scripts/generate-seed.mjs`):

```js
import { readFileSync, writeFileSync } from "node:fs";
const g = JSON.parse(readFileSync("docs/stage-0/glossary.json", "utf8"));
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const rows = [];
for (const [dict, spec] of Object.entries(g.enums)) {
  spec.values.forEach((code, i) => rows.push(`(${q(dict)}, ${q(code)}, ${i})`));
}
const sql = `-- GENERATED from docs/stage-0/glossary.json — do not edit by hand\n` +
  `insert into public.dictionary_values (dictionary, code, sort_order) values\n${rows.join(",\n")}\n` +
  `on conflict (dictionary, code) do update set sort_order = excluded.sort_order, active = true;\n`;
writeFileSync("supabase/seed.sql", sql);
console.log(`seed: ${rows.length} values in ${Object.keys(g.enums).length} dictionaries`);
```

- [ ] **6.4** מחולל ה־checks (`scripts/enum-checks.mjs`). מדפיס `check (col in (...))` לכל enum, כדי שהמיגרציות יעתיקו את הערכים ממקור אחד:

```js
import { readFileSync } from "node:fs";
const g = JSON.parse(readFileSync("docs/stage-0/glossary.json", "utf8"));
const [dict, col = dict] = process.argv.slice(2);
const v = g.enums[dict]?.values;
if (!v) { console.error(`unknown enum ${dict}`); process.exit(1); }
console.log(`check (${col} in (${v.map((x) => `'${x}'`).join(", ")}))`);
```

**שימוש:** `node scripts/enum-checks.mjs coverage_status` → `check (coverage_status in ('unknown', 'none', 'partial', 'complete', 'stale'))`

- [ ] **6.5** להריץ `npm run seed:gen && npm run db:reset && npm run db:test`. **צפוי:** PASS 4/4.
- [ ] **6.6** Commit: `feat(db): dictionaries seeded from canonical glossary (18A §35, §64)`.

---

## Task 7: Migration 003 — Sources & Files (18A §13)

**Files:** Create `supabase/migrations/20260930000003_sources_files.sql`, Test `supabase/tests/003_sources_test.sql`

- [ ] **7.1** בדיקה שנכשלת (18A §72: "קובץ מקור נשמר עם hash ו־FK ל־source". "User report נשמר כלא מאומת"):

```sql
begin;
select plan(4);
select has_table('public','source_files','source_files exists');
select col_not_null('public','source_files','sha256','sha256 required');
select fk_ok('public','source_files','source_id','public','sources','id');
select col_default_is('public','user_reports','verification_status','unverified','user_report defaults to unverified');
select * from finish();
rollback;
```

- [ ] **7.2** מיגרציה לפי דפוס Task 5, עם העמודות:

```sql
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_type text not null,              -- check from glossary source_type; unknown labels -> 'needs_mapping' handled via metadata (18A §14)
  source_name text not null,
  provider text,
  context text not null default 'unknown',
  external_ref text,
  acquired_at timestamptz not null default now(),
  effective_period_start date,
  effective_period_end date,
  verification_status text not null default 'unverified',
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (effective_period_end is null or effective_period_start is null or effective_period_end >= effective_period_start)
);
create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_id uuid not null references public.sources(id) on delete restrict,
  storage_bucket text not null check (storage_bucket in ('financial-source-files')),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count int,
  uploaded_at timestamptz not null default now(),
  pipeline_state text not null default 'uploaded',
  processing_version text,
  duplicate_of_file_id uuid references public.source_files(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index on public.source_files (owner_user_id, sha256);   -- exact-duplicate lookup, NOT unique (18A §50)
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_type text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  input_count int, accepted_count int, rejected_count int,
  status text not null default 'queued',
  processing_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_id uuid not null references public.sources(id),
  import_batch_id uuid references public.import_batches(id),
  source_row_key text,
  raw_json jsonb not null,
  row_number int,
  record_hash text not null,
  observed_at timestamptz not null default now(),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (source_id, record_hash)
);
create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_id uuid not null references public.sources(id),
  reported_at timestamptz not null default now(),
  subject_type text not null,
  statement text not null,
  structured_payload jsonb,
  verification_status text not null default 'unverified',
  created_at timestamptz not null default now()
);
```

ועוד: ה־checks של `source_type`, `context`, `verification_status` ו־`pipeline_state` מ־`enum-checks.mjs`, וגם triggers, RLS ו־policies לפי Task 5 (Raw: owner select/insert. update רק על `pipeline_state`, `processing_version`, `duplicate_of_file_id` ו־`archived_at`, דרך RPC בשלב 2).

- [ ] **7.3** להריץ `npm run db:reset && npm run db:test`. **צפוי:** PASS.
- [ ] **7.4** Commit: `feat(db): raw source layer (18A §13)`.

---

## Task 8: Migration 004 — Documents & Observations (18A §15–§16)

**Files:** `supabase/migrations/20260930000004_documents_observations.sql`, Test `supabase/tests/004_observations_test.sql`

- [ ] **8.1** בדיקה (18A §72: "Observation יכולה להתקיים בלי Canonical link". 18A §73 תרחיש 1: "מקור עם שתי גרסאות סותרות נשמר בלי overwrite"): הכנסת שתי Observations עם אותו `document_id` ו־`concept_code='gross_amount'` וערכים 6700 ו־34900, ובדיקה ששתיהן קיימות ו־`canonical_entity_id is null`. ההכנסה מתבצעת תחת `set local role authenticated` ו־`set local request.jwt.claims` של משתמשת בדיקה, שנוצרת ב־`supabase/tests/000_helpers.sql` (Task 15).
- [ ] **8.2** מיגרציה: `documents` (כל העמודות של 18A §15; `pipeline_state` במקום `extraction_status`, לפי N-4) ו־`observations` (18A §16. `verification_status` בציר של 5 ערכים, לפי N-2. `confidence_score numeric(5,4)` nullable. `unmapped boolean not null default false`). אין Trigger שמקדם ל־Canonical (18A §46).
- [ ] **8.3** reset + test → PASS. Commit: `feat(db): documents and observations (18A §15-16)`.

---

## Tasks 9–14: Migrations 005–014 — הדומיין הקנוני, קשרים, פיוס, חישוב, כיסוי וידע

כל Task בנוי באותו מבנה: **(1) בדיקת pgTAP שנכשלת** לתרחיש 18A §72 הרלוונטי, **(2) מיגרציה לפי דפוס Task 5 והעמודות המדויקות בסעיף 18A המצוין**, עם checks מה־glossary, **(3) `db:reset && db:test` → PASS**, **(4) Commit**.

| Task | Migration | טבלאות (שמות מה־glossary) | עמודות לפי | בדיקת 18A §72/§73 מחייבת |
|---|---|---|---|---|
| 9 | 005_parties_accounts_transactions | parties, party_aliases, party_roles, party_identifiers, accounts, transactions | 18A §17–§19 | currency חסר עם סכום → נכשל. `period_end < period_start` → נכשל |
| 10 | 006_income_expenses_payments | income, expenses, allocations, payments, payment_transactions, payment_allocations | 18A §11, §20–§21 | **Payment מתחלק לכמה יעדים.** `actuality_status` ו־`verification_status` נפרדים |
| 11 | 007_obligations_receivables | obligations, obligation_occurrences, receivables | 18A §22–§23, glossary `occurrence_status` | **Planned occurrence מתחבר ל־Actual בלי מחיקה** (תרחיש 3 של §73) |
| 12 | 008–010 loans/debts/facilities · agreements/legal/events · assets/taxes/authorities | loans, loan_terms, loan_schedules, debts, credit_facilities, agreements, agreement_installments, legal_cases, events, assets, taxes, government_records | 18A §24–§32 | `date_precision='month'` נשמר בלי יום מומצא |
| 13 | 011_relationship_tables + 012_reconciliation_scaffold | כל 11 טבלאות ה־links של glossary + reconciliations, reconciliation_members, match_candidates, entity_field_sources | 18A §37–§38, §45 | **שני Documents מקושרים לאותו Expense** (תרחיש 2 של §73). Canonical entity עם כמה מקורות |
| 14 | 013_calculation_scaffold + 014_coverage_knowledge_scaffold | calculation_runs, calculation_inputs, calculation_results, coverage_scopes, coverage_periods, data_gaps, investigations, findings, contradictions, knowledge_items | 18A §33–§34, §39 · 18C §46 · glossary (DR-2: `knowledge_type` + `finding_type`) | `coverage_status` מקבל רק את 5 ערכי ADR-001 |

**כלל טבלאות קנוניות (Tasks 9–13):** `transactions`, `income`, `expenses`, `payments`, `obligations`, `receivables`, `loans`, `debts`, `agreements`, `legal_cases`, `events`, `assets`, `taxes`, `government_records` ו־`credit_facilities` מקבלות policy של **select בלבד** ל־`authenticated`. כל כתיבה אליהן תעבור דרך RPC בשלב 5. בדיקה מחייבת ב־Task 15: insert ישיר של `authenticated` לטבלה קנונית נכשל.

---

## Task 15: Trust & Operations (18C §46, 18D §7, §10B) + בדיקות רוחב

**Files:** `supabase/migrations/20260930000015_trust_operations.sql`, `supabase/tests/000_helpers.sql`, `supabase/tests/015_trust_ops_test.sql`, `supabase/tests/099_global_invariants_test.sql`

- [ ] **15.1** עזרי בדיקה (`000_helpers.sql`) שיוצרים שתי משתמשות, owner ו־stranger:

```sql
create or replace function tests_create_user(email text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, instance_id)
  values (uid, email, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  return uid;
end $$;
create or replace function tests_login_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
```

- [ ] **15.2** מיגרציה: `evidence` (status לפי glossary `evidence_status`), `evidence_links`, `provenance_edges`, `knowledge_items`, `exceptions` (severity 5 ערכים, N-5), `review_queue_items`, `qa_runs`, `qa_check_results`, `tool_runs` (`tool_kind` skill/ai/parser/rule_engine), `rule_versions`, `processing_runs` (from_state, to_state, reason, correlation_id), `jobs` (18D §7: כל השדות, `idempotency_key text not null unique`), `dead_letter_jobs` (job_id, error_history jsonb, attempt_history jsonb, correlation_id), `audit_events`.
- [ ] **15.3** `audit_events` בלתי ניתן לשינוי (append-only, 18C §26):

```sql
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id),
  event_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('user','system','rule','skill','ai')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  reason text,
  correlation_id uuid not null
);
create index on public.audit_events (entity_type, entity_id, event_at desc);
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
create policy audit_owner_read on public.audit_events for select to authenticated using (public.is_owner(owner_user_id));
create or replace function public.forbid_audit_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'audit_events is append-only'; end $$;
create trigger trg_audit_immutable before update or delete on public.audit_events
  for each row execute function public.forbid_audit_mutation();
```

- [ ] **15.4** `claim_next_job` (T-6):

```sql
create or replace function public.claim_next_job(p_lock_owner text)
returns public.jobs language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  select * into j from public.jobs
   where status in ('queued','retry_wait') and available_at <= now()
   order by priority desc, created_at
   for update skip locked limit 1;
  if not found then return null; end if;
  update public.jobs set status = 'running', locked_at = now(), lock_owner = p_lock_owner,
         attempt_count = attempt_count + 1, started_at = coalesce(started_at, now())
   where id = j.id returning * into j;
  return j;
end $$;
revoke execute on function public.claim_next_job(text) from public, anon, authenticated;
```

(זמין ל־service role של ה־runner בלבד. `authenticated` לא יכולה לקרוא לה.)

- [ ] **15.5** בדיקות רוחב (`099_global_invariants_test.sql`). אלה הליבה של Gate 1:

```sql
begin;
select plan(6);
-- every public table has RLS enabled and forced
select is_empty($$select tablename from pg_tables where schemaname='public' and not rowsecurity$$, 'RLS enabled on every public table');
-- no float money anywhere
select is_empty($$select table_name||'.'||column_name from information_schema.columns
  where table_schema='public' and data_type in ('real','double precision')$$, 'no float columns');
-- every *_minor column is bigint
select is_empty($$select table_name||'.'||column_name from information_schema.columns
  where table_schema='public' and column_name like '%\_minor' and data_type <> 'bigint'$$, 'all *_minor are bigint');
-- stranger cannot read owner's source
select tests_create_user('owner@test.local') \gset owner_
-- (implemented with explicit uuids in file: owner inserts a source, stranger sees 0 rows)
select is((select count(*)::int from public.sources where owner_user_id <> (select auth.uid())), 0, 'stranger sees no foreign rows');
-- authenticated cannot insert canonical directly
select throws_ok($$insert into public.transactions (account_id, transaction_date, direction, amount_minor, currency_code) values (gen_random_uuid(), current_date, 'debit', 100, 'ILS')$$, '42501', null, 'direct canonical insert blocked');
-- audit is append-only
select throws_like($$update public.audit_events set reason = 'x'$$, '%append-only%', 'audit immutable');
select * from finish();
rollback;
```

(שורת ה־`\gset` מסמנת את המבנה בלבד. בקובץ עצמו המשתמשות נוצרות עם UUID קבוע דרך `tests_create_user` ו־`tests_login_as` לפני כל assert.)

- [ ] **15.6** reset + test → **כל הקבצים PASS**. Commit: `feat(db): trust and operations layer, global invariants (18C §46, 18D §7)`.

---

## Task 16: Storage — Buckets ומדיניות (18A §40–§41, 18D §31–§32, T-5)

**Files:** `supabase/migrations/20260930000016_storage.sql`, Test `tests/rls/storage.test.ts`

- [ ] **16.1** מיגרציה:

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('financial-source-files','financial-source-files', false, 52428800),
       ('financial-derived-files','financial-derived-files', false, 52428800),
       ('financial-exports','financial-exports', false, 52428800)
on conflict (id) do update set public = false;

create policy fin_owner_read on storage.objects for select to authenticated
  using (bucket_id in ('financial-source-files','financial-derived-files','financial-exports')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy fin_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('financial-source-files','financial-exports')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
-- no update/delete policy: raw source is immutable (23 §23); derived files written server-side only
```

- [ ] **16.2** בדיקת אינטגרציה ב־Vitest מול Supabase המקומי (`tests/rls/storage.test.ts`). owner מעלה ל־`{uid}/s/f/original.pdf` → הצלחה. stranger מנסה לקרוא → נכשל. owner מנסה overwrite (`upsert: true`) → נכשל. `getPublicUrl` + fetch → 400/404. Signed URL עם `expiresIn: 1` → נכשל אחרי 2 שניות.
- [ ] **16.3** להריץ `npx vitest run tests/rls`. **צפוי:** PASS. Commit: `feat(storage): private buckets and owner policies`.

---

## Task 17: Types, Supabase Clients ו־Env מאובטח

**Files:** `src/types/database.ts` (generated), `src/lib/env.ts`, `src/lib/server/env.server.ts`, `src/lib/supabase/{browser,server}.ts`, Test `src/lib/env.test.ts`

- [ ] **17.1** `npm i @supabase/supabase-js @supabase/ssr zod && npm i -D vitest` (CL לפי ADR-005: חלק מה־Stack המאושר).
- [ ] **17.2** `npm run db:types`.
- [ ] **17.3** בדיקה שנכשלת: `env.server.ts` זורק שגיאה כשחסר `SUPABASE_SERVICE_ROLE_KEY`, ו־`env.ts` (public) **אינו** מכיל מפתח service.

```ts
import { describe, it, expect } from "vitest";
describe("public env", () => {
  it("never exposes the service role key", async () => {
    const mod = await import("./env");
    expect(JSON.stringify(mod.publicEnv)).not.toMatch(/service/i);
  });
});
```

- [ ] **17.4** מימוש:

```ts
// src/lib/env.ts — safe for client
import { z } from "zod";
export const publicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
}).parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
```

```ts
// src/lib/server/env.server.ts — server only
import "server-only";
import { z } from "zod";
export const serverEnv = z.object({ SUPABASE_SERVICE_ROLE_KEY: z.string().min(20) })
  .parse({ SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY });
```

- [ ] **17.5** יצירת clients עם `createBrowserClient`/`createServerClient` מ־`@supabase/ssr` ו־cookies של Next. **אין** client עם service role מחוץ ל־`src/lib/server`.
- [ ] **17.6** `npx vitest run src/lib` → PASS. Commit.

---

## Task 18: שגיאות, Logger ו־Correlation ID (18D §13, §39–§40, 23D §66–§67)

**Files:** `src/lib/errors.ts`, `src/lib/server/logger.ts`, `src/lib/correlation.ts`, `src/middleware.ts`, Tests `src/lib/*.test.ts`

- [ ] **18.1** בדיקות שנכשלות: (א) `redact()` מסתיר מספר חשבון, IBAN, token ו־`*_minor` מלאים. (ב) `AppError.toJSON()` מחזיר `{type, code, message, correlation_id}` בלי stack. (ג) `getCorrelationId(headers)` מחזיר את הערך הקיים או UUID חדש.

```ts
import { describe, it, expect } from "vitest";
import { redact } from "./server/logger";
describe("redact", () => {
  it("masks sensitive values", () => {
    const out = redact({ iban: "IL620108000000099999999", token: "abc.def.ghi", account_number: "123456789", amount_minor: 6700, entity_id: "x" });
    expect(out).toEqual({ iban: "[REDACTED]", token: "[REDACTED]", account_number: "[REDACTED]", amount_minor: "[REDACTED]", entity_id: "x" });
  });
});
```

- [ ] **18.2** מימוש:

```ts
// src/lib/errors.ts
export const ERROR_TYPES = ["validation","business_rule","conflict","provider","processing","authorization","system"] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];
export class AppError extends Error {
  constructor(public type: ErrorType, public code: string, message: string, public correlationId: string) { super(message); }
  toJSON() { return { type: this.type, code: this.code, message: this.message, correlation_id: this.correlationId }; }
}
```

```ts
// src/lib/server/logger.ts
import "server-only";
const SENSITIVE = /(iban|token|password|secret|account_number|card|_minor$|authorization|cookie)/i;
export function redact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SENSITIVE.test(k) ? "[REDACTED]" : v]));
}
type Kind = "request_log" | "job_log" | "integration_log" | "security_log";
export function log(kind: Kind, correlationId: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ kind, correlation_id: correlationId, at: new Date().toISOString(), ...redact(fields) }));
}
```

```ts
// src/lib/correlation.ts
export const CORRELATION_HEADER = "x-correlation-id";
export function getCorrelationId(h: Headers): string {
  const v = h.get(CORRELATION_HEADER);
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : crypto.randomUUID();
}
```

- [ ] **18.3** `src/middleware.ts`: מוסיף `x-correlation-id` לכל request ו־response, מרענן את ה־session של Supabase (`@supabase/ssr`), ומפנה ל־`/login` כל route מלבד `/login` כשאין session (23A §79: Auth redirect).
- [ ] **18.4** `npx vitest run` → PASS. Commit: `feat(infra): error contract, redacting logger, correlation id`.

---

## Task 19: Login ו־RTL Root (התשתית היחידה עם UI)

**Files:** `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/page.tsx`, Test `tests/e2e/auth.spec.ts`

- [ ] **19.1** `npm i react-hook-form @hookform/resolvers && npm i -D @playwright/test && npx playwright install chromium` (CL לפי ADR-005).
- [ ] **19.2** בדיקת E2E שנכשלת:

```ts
import { test, expect } from "@playwright/test";
test("unauthenticated user is redirected to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
});
test("owner logs in and sees authenticated shell", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel("סיסמה").fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("מחוברת")).toBeVisible();
});
test("wrong password shows a clear error, not a generic one", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel("סיסמה").fill("wrong-password");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByRole("alert")).toContainText("פרטי הכניסה שגויים");
});
```

(משתמשת ה־E2E נוצרת ב־global setup דרך admin API **מקומי בלבד**. הערכים ב־`.env.test.local` ולא ב־Git.)

- [ ] **19.3** `layout.tsx`: `<html lang="he" dir="rtl">`, Heebo דרך `next/font/google`, ו־CSS variables שנוצרים מ־`docs/design/tokens.json` (רק צבעי canvas/text/brand/error שנדרשים ל־login; מחולל ה־tokens המלא בשלב 8).
- [ ] **19.4** `login/page.tsx` + `actions.ts`: טופס RHF + Zod, Server Action `signInWithPassword`, ושגיאת authorization מתורגמת להודעה בעברית עם `role="alert"`. `page.tsx` מציג רק "מחוברת" וכפתור יציאה. **אין Home, אין Features.**
- [ ] **19.5** `npx playwright test tests/e2e/auth.spec.ts` → 3 PASS. בדיקה ידנית ב־320px וב־390px. Commit: `feat(auth): login and RTL root (infra only)`.

---

## Task 20: בדיקות אבטחת Build ו־CI

**Files:** `scripts/check-bundle-secrets.mjs`, `.github/workflows/ci.yml`

- [ ] **20.1** סורק bundle (18D §56: "service role exposed client-side → בדיקת build נכשלת"):

```js
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const roots = [".next/static"]; const bad = [/service_role/i, /SUPABASE_SERVICE_ROLE_KEY/, /eyJ[^"']{20,}\.[^"']{20,}\.[^"']{10,}/];
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
let hits = 0;
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f);
  if (statSync(p).isDirectory()) return walk(p);
  const s = readFileSync(p, "utf8");
  for (const r of bad) { const m = s.match(r); if (m && m[0] !== anon) { console.error(`SECRET PATTERN in ${p}: ${r}`); hits++; } } });
roots.forEach(walk);
if (hits) process.exit(1); console.log("bundle clean");
```

- [ ] **20.2** CI (GitHub Actions, runner עם Docker):

```yaml
name: ci
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint && npx tsc --noEmit
      - run: npx supabase start
      - run: npx supabase db reset
      - run: npx supabase test db
      - run: python3 docs/stage-0/scripts/terminology_gate.py
      - run: python3 docs/stage-0/scripts/contrast_check.py
      - run: npx vitest run
      - run: npm run build && node scripts/check-bundle-secrets.mjs
      - run: npx playwright install --with-deps chromium && npx playwright test
```

(מפתחות מקומיים מוזרקים מפלט `supabase status -o env`. אין secrets אמיתיים ב־CI בשלב 1.)

- [ ] **20.3** Push → CI ירוק. Commit: `ci: lint, types, migrations, pgTAP, RLS, unit, build secret scan, e2e`.

---

## Task 21: פרויקט Supabase בענן (production), **רק אחרי אישור העלות**

- [ ] **21.1** להציג שוב: ארגון `hhmqevwurlkjwqjgjycm`, **$10 לחודש**, אזור eu-central-1, שם `financial-os`, ולקבל "כן" מפורש.
- [ ] **21.2** `confirm_cost` → `create_project(name='financial-os', region='eu-central-1')` דרך Supabase MCP.
- [ ] **21.3** **מיד (F3):** ליצור `docs/PROJECT_IDENTITY.md` עם Project ID, Project URL, Region, Organization, תאריך ומזהה Repo, ולהוסיף רשומת CL.
- [ ] **21.4** פעולות שלך (פרטי גישה, ולכן לא אני): `npx supabase login` ו־`npx supabase link --project-ref <id>` (סיסמת DB שתבחרי).
- [ ] **21.5** `npx supabase db push` → כל המיגרציות רצות על DB ריק בענן (**הוכחה שנייה ל־"Migration על DB ריק"**). ואז `npx supabase db push --include-seed` עבור המילונים.
- [ ] **21.6** Auth בענן: הרשמה ציבורית כבויה (Dashboard → Auth → Providers → Email → "Allow new users to sign up" = off), ויצירת המשתמשת שלך דרך "Invite user". אני לא מזין את הסיסמה.
- [ ] **21.7** אימות read-only דרך MCP: `list_tables` (כל הטבלאות, RLS enabled) ו־`get_advisors(type='security')` → **0 ERROR**. כל WARN מתועד.

---

## Task 22: Gate 1 — אימות, Checkpoint ורישום

להריץ את `verification-before-completion`. כל שורה מוכחת בפקודה:

| תנאי Gate 1 (23 §20, 23A §25) | הוכחה |
|---|---|
| Migration מלאה רצה על DB ריק | `supabase db reset` מקומי + `db push` לענן ריק (21.5) + CI |
| Login עובד | Playwright `auth.spec.ts` 3/3 · כניסה ידנית שלך לענן |
| RLS נבדק, ומשתמש לא מורשה אינו קורא מידע | `099_global_invariants_test.sql` + `tests/rls/storage.test.ts` |
| Storage מוגן, Upload מאובטח אפשרי | `storage.test.ts`: owner מעלה, stranger נחסם, אין public URL, אין overwrite |
| Secrets אינם בדפדפן | `check-bundle-secrets.mjs` ב־CI + בדיקת `env.test.ts` |
| Logs אינם חושפים מידע רגיש | `logger.test.ts` (redact) |
| Environment ניתן להקמה מחדש | Clone נקי → `npm ci && npm run db:start && npm run db:reset && npm test` עובר לפי README |
| אין קוד אפליקטיבי | Review: `src/features/` ריק, ו־`src/app/` מכיל רק login ומעטפת מאומתת |

- [ ] **22.1** README קצר: מה המערכת, Stack, Setup, Run, Test, Build (23D §102).
- [ ] **22.2** Checkpoint (23A §128) ב־`docs/checkpoints/stage-1.md`: נבנה, נבדק, עבר, נכשל, Deferred, Gate.
- [ ] **22.3** CHANGELOG: רשומת "Gate 1 passed" עם הפניה ל־Checkpoint.
- [ ] **22.4** Commit + push + CI ירוק. **רק אז** שלב 2.

---

## Deferred משלב 1 (במפורש, 23D §113)

- Runner של Jobs: שלב 2/3, עם `process_source`.
- Views ו־Read Models: שלב 7.
- מחולל Tokens מלא ל־Tailwind, ו־shadcn/ui, TanStack Query, Lucide, Zustand ו־Recharts: שלב 8 ואילך (YAGNI, ADR-005).
- Backup ו־Restore Test: שלב 19. מדיניות הגיבוי בפועל תלויה בתוכנית הארגון ב־Supabase, שלא ניתן היה לאמת בשלב 1 (שגיאת 503), ותיבדק ב־Task 21.
- MFA: לבחינה בשלב 19 (Security hardening).
