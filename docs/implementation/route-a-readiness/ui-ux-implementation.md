# UI/UX Implementation — Route A

## מטרה
לתקן את חוויית השימוש **בלי לשנות את האמת הפיננסית**. Frontend מציג Read Models וסטטוסים; אינו מחשב אמת מחדש.

## 1. עקרונות
- RTL native + Heebo.
- Nordic Calm + ADR-004 tokens בלבד.
- Mobile + Desktop.
- color is not the only status signal.
- Actual / Expected / Unknown / Needs Review מובחנים טקסטואלית.
- כל מספר מהותי ניתן לפתיחה ל-Evidence/Drill-down.
- loading/reprocessing אינו מציג data ישן כאילו הוא עדכני.

## 2. Home / Current Picture
### חובה
- היררכיה ברורה: "כמה יש עכשיו / מה צפוי להיכנס / מה צפוי לצאת / התחייבויות / Coverage".
- ליד כל מספר: as-of + coverage/trust state.
- Unknown/Partial לעולם לא מוצגים כ-0.
- כל KPI מהותי clickable/drill-down.
- לא להציג credit limit כ-cash.
- לא להציג source total כאילו הוא financial truth אם Coverage חלקי.

## 3. Transactions
### Controls
- sort by date / amount / source.
- filters: period, source, direction, category/status, reconciliation status.
- clear filters.
- pagination או cursor navigation עם Previous/Next.
- preserve filter/sort/page context after opening transaction and returning.
- query/search state ב-route/search params כאשר מתאים.

### Row content
- date
- description/counterparty
- amount + currency
- direction
- source
- classification status
- reconciliation status
- evidence/drill-down affordance

### States
- loading
- queued/reprocessing
- empty
- filtered-empty
- partial coverage
- error
- stale
- needs review

## 4. File / Document screen
- "איך המערכת הבינה את הקובץ" נשאר section ברור.
- automatic decisions read-only.
- open questions בלבד editable/actionable.
- results may appear for resolved parts even if question remains, אבל עם trust/coverage ברור.
- reprocess state חוסם הצגת summary ישן כאילו הוא current.

## 5. Review / Reconciliation
- Review item → reason → Evidence → candidate(s) → decision → backend confirmation → return preserving context.
- Review Queue ≠ DLQ.
- no silent auto-match.
- same amount/different entity and same entity/different amount visible as different mismatch reasons.

## 6. Accessibility / RTL QA
- keyboard navigation.
- visible focus.
- correct arrow/icon direction.
- tabular numerals for money.
- bidi-safe merchant/English text.
- responsive widths: 320/360/375/390/768/1024/1280.
- no horizontal loss of critical transaction info on mobile.
- touch targets consistent with tokens.

## 7. React implementation rules
- Server state: approved server-state layer.
- Form state: form library.
- URL/search params: filters/sort/page when shareable/restorable.
- Local state: React state.
- no duplicated server truth in global client store.
- reuse shared/business components before new components.
- no business logic in component rendering.

## 8. UI acceptance
A user must be able to:
1. upload a representative source;
2. know whether it is processing / ready / blocked;
3. find the produced transaction/fact;
4. filter/sort/navigate without losing context;
5. open it;
6. see status and explanation;
7. reach the exact source evidence;
8. return to the same list context.
