# ADR-009 — Single production environment and deploy flow

- **Status:** Accepted · 2026-09-30 (decision by Tzeela)
- **Version:** 1
- **Change Log:** CL-0027
- **Supersedes:** Stage-1 plan T-8 ("deploy via `supabase db push` only"); refines T-1 and ADR-006 migration rules
- **Does not change:** the ephemeral CI test database (T-1); migration discipline (18D §53, ADR-006)

## Decision
1. **One Supabase project only:** `financial-os` (production). No separate dev DB, no Supabase branch DBs, unless a real future need is approved by a new ADR.
2. **`main` is the real code.** The Supabase GitHub integration ("Deploy to production" from `main`, working directory `.`) applies every migration merged into `main` to production.
3. **No migration reaches `main` before CI is green.** Because there is no local database, a commit containing a migration is first pushed to a temporary **Git** branch `verify/<name>`; CI runs there (ephemeral database, all migrations from empty, pgTAP, unit, build, bundle scan, E2E). Only after green is it fast-forwarded into `main`. Commits without migrations (tests, docs, UI) may go to `main` directly, still under CI.
4. **No manual schema changes in the Dashboard.** An emergency fix must be recorded immediately as a migration (no drift).
5. **Dangerous changes** (drop column/table, type change, destructive data change) require Tzeela's explicit approval before the migration is merged.
6. **Vercel runs against the same Supabase project** — the app is the product, not a demo.
7. **Region: Sydney (ap-southeast-2)** is kept deliberately (Tzeela's decision); latency from Israel accepted.

Flow: `Claude Code → verify/<branch> CI green → main → Supabase production → Vercel`.

## Consequences
- The Supabase connector must be authorized for the `tzeelapersonal` organization so the deployed schema can be verified (tables, security advisors, Data API grants).
- Seed data: whether the production integration applies `supabase/seed.sql` must be verified after the first deploy; if not, dictionaries are delivered by a migration (never by manual inserts).
- Free-plan constraints (pausing, backups) remain an open decision before Stage 19 (Backup/Restore is a Release 1 capability).
