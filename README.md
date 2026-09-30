# financial-os

מערכת פיננסית אישית: מקור → ראיה → עיבוד → נרמול ואימות → פיוס → אמת קנונית → חישובים וכיסוי → Read Models → מסכים.
המפרט הקנוני: פרקים 1–23 · `docs/MASTER_EXECUTION_PLAN.md` · `docs/adr/` · `docs/CHANGELOG.md`.

## Stack (ADR-003)
Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, Storage) · Zod · Vitest · Playwright · pgTAP.

## מבנה
```
src/app        routes (thin)              supabase/migrations   schema (18A/18C/18D)
src/lib        infra (supabase, env,      supabase/tests        pgTAP (DB, RLS, storage)
               errors, logger, corr. id)  tests/e2e             Playwright
src/features   capabilities (Route A)     docs/                 canonical docs, ADRs, plans
```

## Setup
```bash
npm ci
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable key)
```
`SUPABASE_SERVICE_ROLE_KEY` is server-only and never goes into `NEXT_PUBLIC_*` (18D §29).

## Run
```bash
npm run dev
```

## Test
- CI (GitHub Actions) is the test environment (T-1): every push starts an ephemeral Supabase, runs all migrations on an empty DB, pgTAP, unit tests, build, bundle secret scan and E2E.
- Locally without Docker: `npm test` (unit), `npm run lint`, `npm run typecheck`.
- Locally with Docker (optional): `npm run db:start && npm run db:reset && npm run db:test`.
- Canonical gates: `python docs/stage-0/scripts/terminology_gate.py`, `python docs/stage-0/scripts/contrast_check.py`.

## Build
```bash
npm run build
```

## Generated files (never edit by hand)
- `supabase/seed.sql` ← `npm run seed:gen` (from `docs/stage-0/glossary.json`)
- `src/app/tokens.css` ← `node scripts/generate-tokens-css.mjs` (from `docs/design/tokens.json`, ADR-004)

## Deploy
Vercel (ADR-007) — see `docs/PROJECT_IDENTITY.md` for project identifiers. Database changes only via migrations (`supabase db push`), never manual.
