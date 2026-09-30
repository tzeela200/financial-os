# ADR-007 — Route A Live Now (delivery sequencing)

- **Status:** Accepted · 2026-09-30 (decision by Tzeela)
- **Version:** 1
- **Change Log:** CL-0024
- **Supersedes:** the strict "UI only after Stages 2–7" sequencing of 23A for Route A delivery
- **Does not change:** canonical architecture, Route A definition (chapter 13, 22B), Stages 2–14 content, any Gate content, any ADR-001…006 rule

## Context
23A orders Design System and UI after Stages 2–7. Tzeela requires a usable, persistent Route A web application now, with backend capabilities continuing incrementally behind it.

## Decision
1. **Sequencing only.** Immediately after Gate 1, build the live Route A application and expose each stable backend capability through it as it lands. Stages 2–7 continue behind the screens.
2. **Explicit Route A source model.** A shared internal ingestion engine is preferred, but every upload enters with an explicit `source_type` and source context. No generic upload experience that hides the category. Route A sources:
   - Bank / current accounts → `bank_statement`
   - Credit cards → `credit_card_statement`
   - bit → `p2p_payment`
   - Green Invoice — income → `business_income_export`; expenses → `business_expense_export`
   - Other defined income/expense sources → existing glossary `source_type` values only
   - Current loans, debts, obligations → `loan_document`, `debt_collection`, `enforcement`, `user_report`
   - Future money / receivables → `user_report` / documents (no new source type)
3. **Workspaces to build now:** Home (Current Financial Picture) · Bank & Current Accounts · Credit Cards · bit · Green Invoice (Income & Expenses) · Transactions · Documents & Sources · Current Obligations & Debts · Future Money · Coverage / Source Status. Canonical Design System (ADR-004), Heebo, RTL, Nordic Calm, mobile + desktop.
4. **Current Picture rule.** Home shows only values supported by canonical data / read models. Missing, partial, unknown or stale sources and periods are shown explicitly. Never zero for missing. **No mock financial data** in the usable environment.
5. **Minimum backend contracts now:** source-specific intake · current source coverage · transaction lists · current financial summary · obligations · future money · drill-down to source/evidence.
6. **Hosting:** as soon as auth, App Shell and the first Route A screens compile — connect `financial-os` to Vercel, configure Supabase env vars and Auth redirect URLs for the production domain, deploy. A persistent URL; no dependency on the local computer.

## Milestone (Definition of Done)
Open the Vercel URL on desktop or mobile → sign in → choose the correct Route A source → upload its file → see coverage/status → view the imported financial information → see the resulting current financial picture. Real, responsive, connected to Supabase.

## Canonical rules that remain in force (explicitly)
- Imported bank/card/bit/Green Invoice rows become canonical only through the server-side import path with Evidence and Audit (23D §13; 18A §46). A single-source deterministic import may create canonical `transactions` for that account; cross-source matching stays `unmatched` until the reconciliation engine (Stage 4) runs — it is never inferred.
- Anything not yet verified/reconciled is labeled as such in the UI (verification / reconciliation / coverage states), not hidden.
- Route B, historical investigation, advanced AI and API integrations stay out of scope (ADR-002).

## Consequences
- 23A Stages 8–12 work (Design System, App Shell, Route A screens) starts in parallel with Stages 2–7, limited to what the listed screens need (23A §44 lean library still applies).
- Each screen is accepted against real data only (23 §48, §91); a screen whose backend contract is not yet ready shows its real empty/unknown/coverage state, never placeholders with numbers.
