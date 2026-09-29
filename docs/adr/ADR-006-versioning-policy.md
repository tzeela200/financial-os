# ADR-006 — Versioning Policy

- **Status:** Accepted · 2026-09-29
- **Version:** 1
- **Change Log:** CL-0006
- **Supersedes:** —

## Context
Governance decision only: one consistent, simple versioning strategy for ADRs, database migrations, API contracts and releases (18D §25, 18E, 23D §110).

## Decision
| Artifact | Scheme | Rules |
|---|---|---|
| **ADRs** | `ADR-NNN-kebab-title.md`, sequential, never renumbered | Header: Status (Proposed/Accepted/Superseded), Version, Change Log ref, Supersedes. A changed decision = new ADR that supersedes (or amends, for ADR-004); the old ADR is marked `Superseded by ADR-XXX`, never deleted. |
| **Change Log** | `CL-NNNN` sequential entries in `docs/CHANGELOG.md` | Each entry references its ADR; each ADR references its CL entry (bidirectional traceability, F5). |
| **DB migrations** | Supabase CLI timestamp `YYYYMMDDHHMMSS_description.sql` | Forward-only; never edited after being applied to any shared environment; tested on fresh DB and on upgrade (23B §14); dangerous migrations require backup + plan (23 §104). |
| **Processing / formula / rule versions** | `component@MAJOR.MINOR` stored in `processing_versions` / `formula_version` | MAJOR when a result can change; stored on every run (18A §47). |
| **API contracts** (Read Models & Commands) | URL prefix `/api/v1` (one method, 18D §25) | Adding an optional field = non-breaking. Removing/renaming a field or changing an enum value's meaning = breaking → `/api/v2` route or coordinated migration. Enums are part of the contract. |
| **Releases** | SemVer `MAJOR.MINOR.PATCH` + git tag `vX.Y.Z` | Release 1 = `1.0.0`. MINOR for new capabilities, PATCH for fixes. Every release records schema version, processing versions and the migration range. |

## Consequences
- No additional tooling is required (no release automation framework needed; `release-it` skill may be used at release time).
