# ADR-010 — Design values completed from chapter 19C (amends ADR-004)

- **Status:** Accepted · 2026-09-30 (decision by Tzeela; palette approved on the sample page)
- **Version:** 1
- **Change Log:** CL-0030, CL-0031
- **Amends:** ADR-004 (F1: ADR-004 changes only through a new ADR)

## Context
Stage 0 treated chapter 20 as silent on values and filled them in ADR-004. Chapter 20 defines the system and its rules but gives no numeric values (only Heebo, light theme, 8px grid, spacing 4…128). Chapter 19C gives the concrete values, and both books state the relationship: 19C §1 "this chapter is the basis for chapter 20, but does not replace it"; 19C closing note "19C defines the language, 20 defines the dictionary that implements it"; 20F §2, §16, §21 require compliance with chapters 19 and 20.

## Decision — source hierarchy for design
- **Chapter 20** = the design system and its rules (source of truth for the system).
- **Chapter 19C** = the concrete values that chapter 20 does not give.
- **ADR-004 / `tokens.json`** = the technical token implementation, valid as long as it does not contradict chapters 19C/20.
- **Chapter 23 §13, 23D §35** override 19C §13 on one point: **no purple / violet / lilac** (19C "AI always purple" is not adopted).

## Decision — values
| Topic | Value (19C) | Status |
|---|---|---|
| Radius | button 10 · input 10 · menu 10 · card/table 14 · dialog/drawer/sheet 16 · badge 4 (not defined in 19C; kept from ADR-004) · no pills | **Accepted** |
| Font weights | 300 (rare) · 400 text · 500 labels · 600 buttons · 700 headings · 800 main headings | **Accepted** |
| Motion | fast 150 · base 200 · slow 250 ms; reduced-motion rule unchanged | **Accepted** |
| AI color | none (no purple) | **Accepted** |
| Palette | Deep Teal primary · Slate Blue secondary · Turquoise accent · Emerald · Amber · Rose · Sky · Warm Gray neutral | **Accepted** — approved by Tzeela on the sample page; now in `tokens.json` (76/76 WCAG AA) |

## Decision — AI Panel (chapter 20C)
Not shown in Release 1 (no empty or half-built panel, 23D §113; ADR-002 defers Advanced AI). Added in Release 2 at the canonical position defined in chapter 20C.

## Consequences
- `tokens.json` radius / typography.weight / motion updated now; `tokens.css` regenerated.
- Palette locked on 2026-09-30 (CL-0031). Key values: primary `#0E5A5E`, secondary `#3E5A78`, accent `#1D9CA3`, canvas `#F7F6F4`, text `#26221F`, success `#1B6E4E`, warning `#8A5700`, error `#B0233F`, info `#1C6698`.
