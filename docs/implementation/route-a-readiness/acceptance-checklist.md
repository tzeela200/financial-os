# Acceptance Checklist — Document Intelligence + UI

## A. Document Intelligence Gate
- [ ] Family detected.
- [ ] Subtype detected or explicit ambiguity retained.
- [ ] Format reader selected correctly.
- [ ] Whole document processed, not only expected fields.
- [ ] Expected concepts extracted where present.
- [ ] Unmapped relevant observations preserved.
- [ ] Normalization does not overwrite source value.
- [ ] Validation results persisted.
- [ ] Evidence locator exists.
- [ ] Processing/tool version persisted.
- [ ] Unknown remains unknown.
- [ ] Reprocess does not duplicate canonical truth.

## B. Bank PDF Transaction Acceptance
- [ ] Representative transaction-statement PDF included locally.
- [ ] Table rows reconstructed.
- [ ] Transaction count > 0 when source contains transactions.
- [ ] Date/value date handled distinctly when present.
- [ ] Debit/credit direction proven or asked narrowly.
- [ ] Amount/currency exact.
- [ ] Running balances validated when possible.
- [ ] Raw lines not exposed as transactions.
- [ ] Each transaction drill-down reaches source evidence.

## C. Regression on already-covered families
- [ ] Credit card PDFs.
- [ ] Credit card XLSX.
- [ ] Payment app CSV.
- [ ] Morning expenses CSV.
- [ ] Morning expenses PDF.
- [ ] Morning income PDF/CSV.
- [ ] Accounting XLS/XLSX.
- [ ] Bank annual/summary PDF.

## D. Semantic safety
- [ ] Receipt not auto-counted as income.
- [ ] Refund/credit not counted as normal charge.
- [ ] Credit-card bank payment not double-counted with card transactions.
- [ ] Payment-app transfer not double-counted with bank movement.
- [ ] Partial accounting posting not labelled fully missing.
- [ ] Credit facility/limit not treated as cash.
- [ ] Missing coverage not rendered as zero.
- [ ] No canonical write directly from Skill/AI/UI.

## E. UI/UX Gate
- [ ] Home hierarchy clear.
- [ ] as-of / coverage visible for material numbers.
- [ ] Transactions sort works.
- [ ] Filters work.
- [ ] Clear filters works.
- [ ] Previous/Next or pagination works.
- [ ] Back preserves context.
- [ ] Empty vs filtered-empty distinct.
- [ ] Processing/reprocessing state cannot show stale result as current.
- [ ] RTL checked.
- [ ] Keyboard/focus checked.
- [ ] Mobile widths checked.
- [ ] Evidence drill-down works.

## F. End-to-End Gate
- [ ] Source → Document.
- [ ] Document → Observation.
- [ ] Observation → Validation.
- [ ] Validation → Canonical candidate/promotion according to rules.
- [ ] Canonical → Read Model.
- [ ] Read Model → Screen.
- [ ] Screen → Evidence.
- [ ] Conflict → Review Queue.
- [ ] Return path preserves user context.

## G. Completion report
Do not say Done without:
- fixture names/types tested;
- commit/version tested;
- exact automated test suites executed;
- manual/browser checks executed;
- failures and known unsupported cases;
- open ambiguities;
- deployment/environment tested.

## Known open items to keep explicit
- OCR/vision provider for scanned PDFs/images: not assumed.
- Bank PDF transaction statement: must be proven as a dedicated acceptance case.
- Any bank table with no sign/direction semantics may legitimately require a narrow question.
