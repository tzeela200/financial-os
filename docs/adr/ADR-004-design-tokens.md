# ADR-004 — Design Tokens

- **Status:** Accepted · **Immutable** · 2026-09-29
- **Version:** 1
- **Change Log:** CL-0004
- **Source of truth:** [`docs/design/tokens.json`](../design/tokens.json)
- **Supersedes:** —

## Context
Chapter 20 §7 requires "an exact HEX value for every color" and §8 requires all components to use tokens only, but chapter 20 defines no values (only the 8px grid and the spacing scale 4…128). Chapters 23 §12 and 23A §14 require tokens to be fixed before significant UI (Design Tokens Gate), in the already-decided direction: **Nordic Calm**, Heebo, light theme only, RTL native, no purple/lilac, no pill buttons, calm and sparse color.

## Decision
The canonical token set is `docs/design/tokens.json`. It defines:

| Group | Summary |
|---|---|
| Neutral / surfaces | canvas `#F5F6F7`, surface `#FFFFFF`, subtle `#EEF1F3`, sunken `#E7EBEE`, overlay 40% ink |
| Text | primary `#1C2530`, secondary `#4A5563`, tertiary `#5F6B78`, disabled `#9AA3AD`, inverse `#FFFFFF`, link `#2F5D7C` |
| Border | subtle `#E1E5E9`, default `#CDD3D9`, strong `#86919C` |
| Brand (fjord slate-blue) | 50 `#EAF1F6` · 100 `#D3E2EC` · 600 `#2F5D7C` · 700 `#244A63` · 800 `#1B3A4E` |
| Semantic | success `#236B4B`, warning `#8A5A00`, error `#B3261E`, info `#2F6690` — each with bg + border |
| Financial semantics | positive `#236B4B`, negative `#9C3B2E`, neutral = text.primary, expected `#4F6479`, planned `#6B5B3E`, unknown `#5F6B78` |
| Reliability semantics | verified / unverified / needs_review / contradicted and the 5 coverage states of ADR-001 |
| Interaction | hover 4% ink, pressed 8% ink, selected bg brand-50 + 2px brand-600 border, focus ring 2px + 2px offset brand-600, disabled bg/fg |
| Typography | Heebo only; 400/500/600/700; scale caption 12 → amount-lg 36; **tabular-nums** for all money |
| Spacing | 0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 96, 128 (copied from chapter 20 §11) |
| Radius | xs 2, sm 4 (badge), md 6 (button/input), lg 8 (card/table), xl 12 (dialog/drawer/sheet). No fully rounded components; `dot` only for status dots |
| Elevation | 0 none, 1 card, 2 menu/popover, 3 dialog/drawer/sheet — subtle shadows only |
| Motion | 0 / 120 / 200 / 280 ms; standard & exit easing; reduced-motion → instant (opacity 120ms) |
| Breakpoints | mobile ≥320, tablet 768, laptop 1024, desktop 1280, wide 1536; QA widths 320/360/375/390/768/1024/1280 |
| Icons | Lucide 16/20/24, stroke 1.75, touch target 48×48 |
| Z-index | base → sticky → dropdown → overlay → drawer → dialog → toast |

### Semantic rules bound to the tokens
- Color never carries meaning alone: every financial/reliability state also has text and/or icon (chapter 23B §104).
- Negative money shows a minus sign; `financial.negative` is muted and distinct from `semantic.error` (a debit is not an error).
- Expected / planned values use their own tokens so they can never render like Actual (23B §26).

## Verification
`docs/stage-0/scripts/contrast_check.py`: 72 WCAG AA checks (text ≥ 4.5:1, UI ≥ 3:1) across surfaces, semantic, financial, reliability, buttons, focus and input borders — **72/72 pass**.

## Immutability (Final Amendment F1)
After approval, no color, spacing, typography, radius, elevation or motion value may be changed directly in implementation. Any visual change requires a **new ADR that amends ADR-004** and a new version of `tokens.json`. Components consume tokens only; hard-coded values are defects (23D §33).

## Consequences
- Stage 8 generates Tailwind theme + CSS variables from `tokens.json` (no hand-copied values).
- Dark mode is out of scope for Release 1; a future theme = a new token set, not component changes (chapter 20 §21).
