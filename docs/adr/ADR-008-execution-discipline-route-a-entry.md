# ADR-008 — Mandatory Skills protocol, Route A entry point, per-source intake

- **Status:** Accepted · 2026-09-30 (decision by Tzeela, after the Stage 1 audit)
- **Version:** 2 (decision 3 amended 2026-10-04, CL-0051)
- **Change Log:** CL-0026, CL-0051
- **Supersedes:** the "recommended" wording of Skills in the Master Execution Plan §4
- **Amends:** ADR-007 (clarifies the first Route A task and the intake model; no scope change)

## Context
The Stage 1 audit found that the Stage 1 Skills listed in the Master Execution Plan were not loaded (TDD was applied in practice, but the Skills themselves did not shape the work). The Skills were selected deliberately to influence how work is done, not to sit in a document.

## Decision 1 — Skills are mandatory, per stage, in a fixed protocol
Every Stage (and every ADR-007 Route A task) runs:

1. **Load Skills** — every Skill listed for the stage in the Master Execution Plan §4 / Skills matrix is loaded before work starts.
2. **Review Skills** — their rules are applied to the stage plan; conflicts with the canon are recorded as gaps (the canon wins).
3. **Execute** — TDD, small units (Stage 1 working rules remain in force).
4. **Verification Skill** — `verification-before-completion`; for any stage with UI also `design-review`.
5. **Change Log** entry.
6. **Checkpoint** (23A §128).
7. **Stage Complete** — only after 4–6.

No step may be skipped. A stage that did not load its Skills is not complete.

## Decision 2 — The first Route A task is App Shell + Home + Navigation (one task)
Immediately after Gate 1: **App Shell + Home (Current Financial Picture) + Navigation**, delivered together, then Vercel, then the Route A source workspaces. Home is the first Route A screen; it shows only canonical/read-model values and explicit coverage/unknown states — never zero for missing, no mock data (ADR-007 §4).

## Decision 3 — Intake is per known source (neither generic, nor ten separate systems)
- The user always enters intake from a **known Route A source context** (Bank, Credit card, bit, Green Invoice income, Green Invoice expenses, …). There is no generic "upload anything" screen.
- One **shared intake engine** (upload → raw storage → source/file record → job) with a **source-specific parser** per source type (bank parser, credit-card parser, bit parser, Green Invoice parsers).
- One shared, source-configured upload component in the UI (chapter 21 reuse rule), not ten bespoke upload experiences.
- Flow per source: `Route A → <source> → Upload → <source> parser → Observations → canonical (server-side, evidence + audit)`.

## Decision 3 — amendment (2026-10-04, decision by Tzeela, CL-0051) — supersedes the parser-per-source wording above
The original wording conflicted with chapter 5 §1–§2, §20 and MASTER_SPEC 19.09 §6.1 (flagged in CL-0039, left unresolved until now).
- Upload stays inside a source context (bank, credit card, bit, Green Invoice …) as the **interface entry point**. The source context is a **hint, not the determination**.
- Every file goes through **one shared semantic engine** (chapter 5 §1): a **document classifier** identifies family, subtype and issuer from the concepts actually found in the content (chapter 5 §2–§4; MASTER_SPEC §6.1; `docs/implementation/route-a-readiness/Expected_Semantic_Concepts_Matrix.xlsx`) — never from the file name or the upload folder alone; then a Source Adapter where one exists.
- When the content does not match the upload source, the file is read as identified and the user is told. A family without a reading path yet is identified and kept as evidence, never misread. A focused question only if ambiguity remains after reading the full content.
- "A source-specific parser per source type" is replaced by "Source Adapters per known structure inside one engine" (chapter 5 §20).

## Consequences
- Master Execution Plan §4 wording changes from recommended to mandatory, with the protocol above.
- Stage closure checklist gains: verification-before-completion → design-review (UI stages) → Change Log → Checkpoint.
- Stage 1 closes under this protocol (its Skills are loaded and reviewed retroactively before Gate 1 is declared).
