# ADR-011: Calm Finance — design values

- **Status:** Accepted (Tzeela, 20.10.2026)
- **Amends:** ADR-004 (design tokens), ADR-010 (values from 19C). One token source stays: `docs/design/tokens.json`.
- **Source:** `Financial_OS_Calm_Finance_Design_System_2026-10-20.docx` and the approved mockup (20.10.2026). CHANGELOG CL-0056.

## Context
The previous visual pass met the tokens and the tests but was not acceptable to the product owner (status report F-10). She chose a new direction, Calm Finance, which keeps the core palette and calls for a denser, clearer type scale, cooler neutrals and a systemic layout with shared components.

## Decision
**Unchanged** (already equal to Calm Finance):
- Brand #0E5A5E, secondary #3E5A78, accent #1D9CA3.
- Canvas #F7F6F4, surface #FFFFFF, text.primary #26221F.
- Semantic success / warning / error / info, and the financial and reliability colours.
- Radii 10 / 14 / 16 / 4 (no pills), elevation, motion 150 / 200 / 250 with reduced motion.
- Heebo only, tabular numerals, light theme only.

**Changed:**

| Token | Before | Calm Finance |
|---|---|---|
| color.neutral.surface-subtle | #F0EEEB | #F0F4F3 |
| color.neutral.surface-sunken | #E8E5E0 | #E3EAE8 |
| color.text.secondary | #57514B | #5B6567 |
| color.text.tertiary | #6B645D | #5F6A6B |
| color.border.subtle / divider | #E6E2DD | #E4EAE8 |
| color.border.default | #D5D0C9 | #D9E2DF |
| color.interaction.focus-ring | #0E5A5E | #1D9CA3 |
| spacing.5 | — | 20 |
| typography body | 16/24 | 14/22 |
| typography caption | 12/16 | 12/18 |
| typography title-sm (card title) | 18/26 600 | 16/24 600 |
| typography title (section) | 20/28 600 | 20/28 700 |
| typography display (screen title) | 30/38 800 | 28/36 700 |
| typography amount-lg (KPI) | 36/44 600 | 32/40 700 |

All text/background pairs pass WCAG AA in the contrast gate (`docs/stage-0/scripts/contrast_check.py`, 76/76).

## Consequences
- Shared components and screens use the new values through the generated CSS variables. No values are hard-coded and there is no parallel token set.
- Further visual changes go through a new ADR that amends this one.
