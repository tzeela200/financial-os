# ADR-005 — Dependency Policy

- **Status:** Accepted · 2026-09-29
- **Version:** 1
- **Change Log:** CL-0005
- **Supersedes:** —

## Context
23D §54 requires checking every external library. The project is a personal system where each dependency adds maintenance, security and bundle cost.

## Decision
1. No dependency is introduced without justification.
2. **Existing approved dependencies (ADR-003 stack) are always preferred** over new libraries.
3. Before adding a dependency, document in the PR/commit and in `docs/CHANGELOG.md`:
   - why the approved stack is insufficient;
   - that no existing solution is available;
   - maintenance status (recent releases, open security issues);
   - RTL compatibility (for UI);
   - bundle impact (for client code);
   - long-term stability.
4. No dependency is added because it is newer or more popular.
5. If it is not necessary, it is not added.
6. Dependency upgrades are not done opportunistically inside a feature; they are checked for breaking changes, security, RTL, build and tests (23D §124).

## Consequences
- Dev-only tooling (test runners, linters, Supabase CLI) follows the same record-keeping, with a lighter bundle criterion.
- Stage plans list the dependencies each stage expects to add.
