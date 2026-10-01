import type { Adapter } from "../adapter";
import type { Extraction, ExtractedRecord, RecordKind } from "../extract";
import type { NormalizedRow } from "../normalize-step";
import type { ReadSheet } from "../readers-types";
import type { CheckResult } from "../validate";
import { CAL_ADAPTER_ID, CAL_ADAPTER_VERSION, checkCalTotals, type CalStatement } from "./cal-statement";

// Bridges the CAL statement adapter into the shared pipeline: the whole file is still stored row by row (chapter 5 §5),
// transaction rows carry concept observations, and the rows become normalized card records with the charge amount and
// charge date stated by the statement (chapter 7 §7). The statement's own totals are a completeness check.

const SYMBOL: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€", GBP: "£" };
const shown = (m: { minor: string; currency: string } | null) => {
  if (!m) return null;
  const n = BigInt(m.minor), abs = n < 0n ? -n : n;
  return `${SYMBOL[m.currency] ?? m.currency} ${n < 0n ? "-" : ""}${(abs / 100n).toLocaleString("en-US")}.${String(abs % 100n).padStart(2, "0")}`;
};

export const CAL_PSEUDO_ADAPTER: Adapter = {
  id: CAL_ADAPTER_ID, version: CAL_ADAPTER_VERSION, sourceType: "credit_card_statement", signature: CAL_ADAPTER_ID, headerRow: 0,
  columns: [], dateFormat: "dmy", amountSign: "signed_positive_is_debit", currencyDefault: null, values: {},
};

export function calArtifacts(sheet: ReadSheet, st: CalStatement): { extraction: Extraction; normalized: NormalizedRow[]; checks: CheckResult[] } {
  const byRow = new Map(st.transactions.map((t) => [t.rowNumber, t]));
  const records: ExtractedRecord[] = sheet.rows.map((cells, i) => {
    const rowNumber = i + 1;
    const kind = (st.rowKinds.get(rowNumber) ?? "metadata") as RecordKind | "summary";
    const t = byRow.get(rowNumber);
    const obs = t
      ? ([
          ["transaction_date", "תאריך העסקה", t.transactionDate], ["supplier", "שם בית העסק", t.supplier], ["merchant_category", "ענף", t.category],
          ["note", "פירוט", t.details], ["card_presented", "כרטיס הוצג", t.cardPresented],
          ["transaction_amount", "סכום העסקה", shown(t.transactionAmount)],
          ["charge_date", "תאריך חיוב", t.chargeDate], ["charge_amount", "סכום חיוב", shown(t.chargeAmount)],
        ] as const).filter(([, , v]) => v).map(([concept, header, v], col) => ({ col, header, concept: concept as string, original: String(v) }))
      : cells.filter(Boolean).map((original, col) => ({ col, header: "", concept: null, original }));
    return { sheet: sheet.name, rowNumber, kind: (kind === "summary" ? "note" : kind) as RecordKind, cells, locator: sheet.locators?.[i] ?? null, observations: obs };
  });
  const normalized: NormalizedRow[] = st.transactions.map((t) => ({
    sheet: sheet.name, rowNumber: t.rowNumber,
    values: {
      transaction_date: { iso: t.transactionDate, precision: "day" },
      ...(t.supplier ? { supplier: { text: t.supplier } } : {}),
      ...(t.category ? { merchant_category: { text: t.category } } : {}),
      ...(t.details ? { note: { text: [t.details, ...t.notes].join(" · ") } } : t.notes.length ? { note: { text: t.notes.join(" · ") } } : {}),
      ...(t.transactionAmount ? { transaction_amount: { minor: t.transactionAmount.minor, currency: t.transactionAmount.currency } } : {}),
      ...(t.chargeAmount ? { charge_amount: { minor: t.chargeAmount.minor, currency: t.chargeAmount.currency } } : {}),
      ...(t.chargeDate ? { charge_date: { iso: t.chargeDate, precision: "day" } } : {}),
      ...(st.cardLast4 ? { card_identifier: { text: st.cardLast4 } } : {}),
    },
    originals: { supplier: t.supplier ?? "", description: t.supplier ?? "" },
    currency: t.chargeAmount?.currency ?? null,
    issues: t.chargeAmount ? [] : [{ concept: "charge_amount", code: "missing" }],
  }));
  const totals = checkCalTotals(st);
  const bad = totals.filter((x) => !x.ok);
  const checks: CheckResult[] = [{
    code: "statement_totals", status: totals.length === 0 ? "warned" : bad.length ? "failed" : "passed",
    detail: totals.length === 0 ? "no totals found" : bad.length ? bad.map((b) => `${b.chargeDate}: ${b.sum}≠${b.total}`).join("; ") : `${totals.length}`,
    rows: bad.flatMap((b) => st.transactions.filter((x) => x.chargeDate === b.chargeDate).map((x) => x.rowNumber)),
  }];
  return { extraction: { tables: [], records, adapterId: CAL_ADAPTER_ID, needsMapping: false }, normalized, checks };
}
