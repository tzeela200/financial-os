# Checkpoint — Stage 1 Foundation (23A §128)

- **Date:** 2026-09-30
- **Gate 1 status:** **OPEN — pending cloud deployment (Task 21)**. Everything provable in CI has passed.

| | |
|---|---|
| **Built** | 19 migrations (foundation, anon revoke, dictionaries from glossary, raw sources, extracted layer, canonical core, obligations/receivables, loans/debts/facilities, agreements/legal/events, assets/taxes/authorities, N:M links, reconciliation, calculation, coverage/knowledge, evidence/provenance, quality/review, operations/audit, storage). Infra: error contract, correlation id, redacting logger, env split, Supabase clients, `proxy.ts` (getClaims), RTL root, tokens.css generator, login screen, CI pipeline. |
| **Tested** | pgTAP 219/219 (21 files, incl. global invariants and storage) · unit 9/9 · E2E 8/8 (desktop + 320px) · bundle secret scan · terminology gate · contrast 72/72 |
| **Passed (Gate 1 items)** | Migration on empty DB (CI) · Login works (E2E) · RLS tested in practice (owner/stranger/anon) · Storage private, raw immutable · Secrets not in bundle · Logs redact sensitive data · Environment rebuilt from scratch on every CI run · No application code (only login + authenticated shell) |
| **Failed → fixed** | anon received empty sets instead of denial (CL-0016) · email sign-in disabled by config (CL-0025) · over-broad test assertions corrected, never the code bent to a test |
| **Deferred** | Jobs runner (Stage 2/3) · Read Models/views (Stage 7) · loan_terms/loan_schedules (Stage 6, CL-0018) · MFA (Stage 19) · Backup/Restore test (Stage 19) |
| **Open gaps** | G-4 status fields without values (decision before Stage 4, CL-0017) · 23C paste into Google Doc (CL-0009) |
| **Process deviation** | Stage 1 Skills were not loaded (audit 2026-09-30). Corrected by ADR-008: Skills are mandatory; Stage 1 closes only after they are loaded and reviewed. |
| **Remaining for Gate 1** | Task 21: Supabase connector authorized for the new org → `db push` to the empty cloud project → Data API grants check → auth settings (sign-up off, owner invited) → security advisors → cloud smoke test |
