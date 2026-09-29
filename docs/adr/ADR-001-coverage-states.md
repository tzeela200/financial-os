# ADR-001 — Coverage States

- **Status:** Accepted · 2026-09-29
- **Version:** 1
- **Change Log:** CL-0001
- **Supersedes:** —

## Context
Chapter 18 V2 contains two different definitions of `coverage_status`:
- 18A §36 (cross-cutting status axes) and 18B §11.3: `unknown / none / partial / complete / stale`.
- 18C §19 (Coverage table): `complete / substantially_complete / partial / missing / unknown / stale`.

Chapter 23A §11 and 23D §24 name the five-value set as canonical, and cite `substantially_complete` as an example of a deviation to align in Stage 0.

## Decision
The canonical `coverage_status` enum is:

| code | meaning |
|---|---|
| `unknown` | Coverage has not been assessed / cannot be assessed. |
| `none` | The required source/period is known to be absent. (Replaces 18C `missing`.) |
| `partial` | Some required sources/periods are present, some are not. (Absorbs 18C `substantially_complete`.) |
| `complete` | All required sources for the defined scope are present and passed QA. `complete` refers to the defined scope only (18B §11.3). |
| `stale` | Coverage was established but the data is older than the freshness policy. |

`substantially_complete` and `missing` are not valid values anywhere (DB, API, UI, fixtures).

## Reason
- The five-value set already appears in 18A §36, which is the cross-cutting status definition of chapter 18; 18C §19 is the outlier. This ADR aligns chapter 18 with itself, not over it.
- `substantially_complete` blurs the Partial≠Complete rule (23D §21). A non-material gap is still a gap; materiality is expressed through Exceptions/Materiality (18C §23), not by a softer Coverage value.

## Consequences
- 18C §19 is to be read with `missing → none` and `substantially_complete → partial`.
- Read Models expose `meta.coverage_status` with these five values only (18D §23).
- UI "Coverage Indicator" (21B) renders exactly five states, using `color.reliability.coverage_*` tokens (ADR-004) plus text/icon (never color alone).
- Regression test required: no code path produces `substantially_complete`/`missing`, and missing data never yields `complete`.
