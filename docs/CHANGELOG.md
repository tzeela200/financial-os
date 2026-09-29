# Change Log — financial-os

Every entry references the ADR that introduced it; every ADR references its entry (ADR-006, Final Amendment F5).

| ID | Date | Change | ADR / Source |
|---|---|---|---|
| CL-0000 | 2026-09-29 | Master Execution Plan approved as the canonical execution specification (Amendments 1–16, Final Amendments F1–F6). Stored at `docs/MASTER_EXECUTION_PLAN.md`. Platform-independence rule: decisions live in ADRs + this log, not in any assistant memory. | MASTER_EXECUTION_PLAN |
| CL-0001 | 2026-09-29 | `coverage_status` fixed to unknown/none/partial/complete/stale; `substantially_complete` and `missing` removed. | ADR-001 |
| CL-0002 | 2026-09-29 | Release = Capabilities; Stages = implementation order. Release 1 and Release 2 capability sets defined; mapped to 23A stages (R1 = 0–14, 19, 20). Chapter 23C to receive "Canonical Release 1 Scope". | ADR-002 |
| CL-0003 | 2026-09-29 | Implementation stack (Next.js, React 19, TS, Tailwind, shadcn/ui, TanStack Query, Zustand-limited, RHF, Zod, Lucide, Recharts, Supabase) and single-app repository `financial-os` fixed. 18D §60 code paths mapped to ADR-003 structure. | ADR-003 |
| CL-0004 | 2026-09-29 | Canonical, immutable Design Tokens (Nordic Calm) — `docs/design/tokens.json`; 72/72 WCAG AA checks pass. | ADR-004 |
| CL-0005 | 2026-09-29 | Dependency policy: justify every dependency; prefer approved stack; no dependency for novelty/popularity. | ADR-005 |
| CL-0006 | 2026-09-29 | Versioning policy for ADRs, Change Log, migrations, processing versions, API contracts (`/api/v1`), releases (SemVer). | ADR-006 |
| CL-0007 | 2026-09-29 | Stage 0 consistency report and canonical glossary produced (15 normalizations, 3 gaps, 3 decisions pending). | Stage-0 report |
| CL-0008 | 2026-09-29 | Stage 0 decisions: DR-1 file exports in R1 (API → Stage 18); DR-2 findings = knowledge_type + finding_type (18C); DR-3 new contracts `correct_extraction` command, `global_search` read model; occurrence_status without `partial`. Glossary locked; **Gate 0 passed**. | ADR-002 (DR-1), Stage-0 report §4א |
| CL-0009 | 2026-09-29 | Section "Canonical Release 1 Scope" for Chapter 23C stored as canonical amendment `docs/canonical-amendments/23C-canonical-release-1-scope.md` (canonical until merged into the 23C Google Doc). **Pending manual paste into the Google Doc** (Drive connector cannot edit document content). | ADR-002 |
| CL-0010 | 2026-09-29 | Glossary trust-table names aligned to 18C §46 (review_queue_items, tool_runs; added evidence_links, provenance_edges, knowledge_items, qa_check_results, rule_versions); 18C coverage/calculation tables mapped to 18A equivalents (no duplicate schema). | Stage-1 plan (docs/plans/stage-1-foundation.md) |
| CL-0011 | 2026-09-29 | Stage 1 detailed plan written: local Supabase (Docker) = dev/test, new cloud project = production (T-1); region eu-central-1 (T-2); public sign-up disabled (T-3); owner_user_id + RLS pattern (T-4); storage path {owner_uid}/{source_id}/{file_id}/... (T-5, aligns 18A §41 with 18D §32). | Stage-1 plan |
| CL-0012 | 2026-09-29 | Dependencies (scaffold, ADR-003 stack; ADR-005 record): next 16.3.7, react 19.2.8, react-dom 19.2.8, typescript 5, tailwindcss 4, @tailwindcss/postcss 4, eslint 9, eslint-config-next. Canonical docs moved into repo `financial-os/docs` (OneDrive copy becomes a read-only snapshot). | ADR-003, ADR-005 |
