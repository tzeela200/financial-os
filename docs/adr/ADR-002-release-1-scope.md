# ADR-002 — Canonical Release 1 Scope (Release = Capabilities)

- **Status:** Accepted · 2026-09-29
- **Version:** 1
- **Change Log:** CL-0002, CL-0008, CL-0009
- **Supersedes:** open "Release Scope" in Chapter 23C

## Context
Chapter 23C refers to a "Release Scope" but does not define it. Chapter 23A defines implementation Stages 0–20.

## Decision
1. **Release = Capabilities. Stages = implementation order.** Release readiness is determined by capability completion, never by stage numbers. Future releases are expressed as capability sets first, then mapped to stages.
2. **Release 1 MUST include:** Sources · Document Intake · Processing · Evidence · Canonical Model · Reconciliation · Current Financial Picture · Accounting · VAT · Coverage · Review Queue · Mobile · RTL · Security · Backup · Restore.
3. **Release 2 (Deferred — not Release 1 blockers):** Historical Investigation · Planning · Forecast · Scenarios · Recovery · Advanced AI Assistant.

## Mapping to Chapter 23A stages (normalized)
The mapping table supplied with the decision used a numbering that differs from 23A (e.g. "Reconciliation 6–9"). The capability list above is authoritative; the mapping below uses the 23A numbering:

| Capability | 23A Stage(s) |
|---|---|
| Consistency / Foundation / Security baseline | 0, 1 |
| Sources, Document Intake, Evidence | 2 |
| Processing | 3 |
| Reconciliation | 4 (engine), 13 (workspace) |
| Canonical Model | 5 |
| Coverage (+ calculations) | 6 |
| Read Models & Commands | 7 |
| Mobile / RTL / Design System | 8, 9 (+ every UI stage) |
| App Shell | 10 |
| Golden Path (Source → Snapshot → Evidence) | 11 |
| Current Financial Picture | 12 |
| Review Queue | 13 |
| Accounting & VAT | 14 |
| Backup & Restore, Security hardening | 19 |
| Real-data validation | 20 |
| Historical Investigation — **R2** | 15 |
| Planning / Forecast / Scenarios / Recovery — **R2** | 16 |
| Advanced AI Assistant — **R2** | 17 |
| External API integrations — **Deferred** | 18 |

Release 1 = Stages **0–14, 19, 20**.

## Derived decision (from 23A §107 "integrations only when actually needed")
In Release 1, Green Invoice (Morning) and bank data enter as **exported files through the standard Ingestion path** (Stage 2–3). API adapters (Stage 18) are deferred. This does not change the capability list. **Confirmed 2026-09-29 (Stage 0 DR-1, CL-0008).**

## Consequences
- Chapter 23C receives a section "Canonical Release 1 Scope" with this content.
- Deferred capabilities are marked explicitly "Deferred — not part of Release 1" (23D §113). No half-built R2 code ships in R1.
- The "Plan ≠ Reality" validation chain (23B §141) applies in R1 as separation of Actual / Expected (obligations, receivables, future money); Planned/Scenario layers arrive with R2.
