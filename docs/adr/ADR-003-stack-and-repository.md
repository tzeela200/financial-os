# ADR-003 — Implementation Stack & Repository Structure

- **Status:** Accepted · 2026-09-29
- **Version:** 1
- **Change Log:** CL-0003
- **Supersedes:** the open tool-agnostic stack decision (18A §4, 23D §53)

## Context
Chapter 18A §4 leaves the frontend framework open (mentions Next.js/TypeScript as a possibility). Chapter 23D §53 forbids treating TanStack Query/Tailwind/Zustand/Storybook as mandatory "unless decided otherwise in practice". A decision is required before Stage 1.

## Decision — Stack
| Concern | Choice |
|---|---|
| Frontend framework | Next.js |
| React | React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS (implements ADR-004 tokens only) |
| Base UI | shadcn/ui (implementation layer, not a source of design decisions) |
| Server state | TanStack Query |
| Shared client UI state | Zustand — only when genuinely required |
| Forms | React Hook Form |
| Validation | Zod |
| Icons | Lucide |
| Charts | Recharts — only where a chart adds analytical value |
| Backend / DB / Auth / Storage | Supabase (new dedicated project) |

### State rules
- Server state → TanStack Query. Form state → React Hook Form. Navigation state → route/search params where appropriate. Local component state → React state.
- Zustand is **not** a global store and must never duplicate server state.
- No additional state-management library without a new ADR.

## Decision — Repository
- One dedicated repository: **`financial-os`**. Single application. **Not** a monorepo.
- Forbidden without a new ADR: Turborepo, `apps/`, `packages/`, micro-frontends, multi-package architecture.

```
src/
  app/          Next.js routes (thin: compose workspaces, call server actions/route handlers)
  components/   shared (21A) and business (21B) UI components
  features/     one folder per capability: <capability>/{components,server,contracts,tests}
  lib/          cross-cutting infrastructure (supabase clients, server/db, storage, auth, security, jobs, integrations, logging, errors)
  hooks/
  types/        shared contracts: Read Models, Commands, enums (generated + hand-written)
docs/
  adr/
supabase/
  migrations/
  functions/
public/
tests/          e2e, rls, golden-dataset, regression
```

**Normalization of 18D §60 (recommended code structure).** 18D §60 suggests `src/server/modules/*` and `src/shared/contracts`. Under this ADR the same logical boundaries map to: domain modules → `src/features/<capability>/server`; infrastructure (`db`, `storage`, `auth`, `security`, `jobs`, `integrations`) → `src/lib/server/*`; contracts → `src/types/contracts` (+ per-feature `contracts/`). The logical boundaries of 18D are preserved; only paths change (permitted by 23 §6 "file division").

## Precedence
ADR-003 governs **implementation-stack selection and repository structure only**. Chapter 23D remains fully valid; its tool-agnostic prohibition applied while no stack had been approved. All domain, backend, data, security, workflow, QA, evidence, audit, migration and delivery rules of chapters 18–23 are unchanged. No library choice here overrides Thin Frontend, Canonical Truth, Evidence, RLS, Commands or Read Models.

## Consequences
- Local working copy lives **outside OneDrive** (e.g. `C:\dev\financial-os`) to avoid sync of `node_modules` and Hebrew-path tooling issues.
- New dependencies follow ADR-005.
