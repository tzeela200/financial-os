import { COUNTED_ROLES, type Adapter } from "./adapter";
import type { Family } from "./families";
import { isValidIsraeliTaxId } from "./normalize";
import type { NormalizedRow } from "./normalize-step";

// Verification (chapter 5 §23–§24; 18C; 23A §38): deterministic checks only. A failed check never deletes or corrects a
// value — it is recorded and creates an exception / review item. Extraction confidence is not verification.

export const VERIFICATION_RULE_VERSION = "verify-v1";

export type CheckStatus = "passed" | "warned" | "failed";
export type CheckResult = { code: string; status: CheckStatus; detail: string; rows: number[] };
export type RowVerdict = { promotable: boolean; reasons: string[] };
export type Verification = { checks: CheckResult[]; rows: Map<number, RowVerdict>; state: "verified" | "needs_review" };

/** Signed movement in minor units from the approved sign semantics (18B §6.2: "direction נקבע לפי schema של המקור"). */
export function signedMinor(row: NormalizedRow, adapter: Adapter): bigint | null {
  const debit = row.values.debit_amount?.minor, credit = row.values.credit_amount?.minor;
  if (debit !== undefined || credit !== undefined) {
    const d = debit ? BigInt(debit) : 0n, c = credit ? BigInt(credit) : 0n;
    return (c < 0n ? -c : c) - (d < 0n ? -d : d);
  }
  // card: the charge amount when the source states it (chapter 7 §7 "החיובים בפועל"), else the single amount column
  const amount = row.values.charge_amount?.minor ?? row.values.amount?.minor;
  if (amount === undefined) return null;
  const a = BigInt(amount);
  if (adapter.amountSign === "signed_negative_is_debit") return a;
  if (adapter.amountSign === "signed_positive_is_debit") return -a;
  if (adapter.amountSign === "all_debit") return a < 0n ? a : -a;
  if (adapter.amountSign === "all_credit") return a < 0n ? -a : a;
  const dir = row.values.direction?.text;
  if (dir === "debit") return a < 0n ? a : -a;
  if (dir === "credit") return a < 0n ? -a : a;
  return null;
}

export function verifyRows(rows: NormalizedRow[], family: Family, adapter: Adapter, side: "income" | "expense" | null): Verification {
  const checks: CheckResult[] = [];
  const verdicts = new Map<number, RowVerdict>();

  // 1. required concepts present and parseable (chapter 5 §5: missing is not 0)
  const incomplete: number[] = [];
  for (const r of rows) {
    const reasons: string[] = [];
    for (const c of family.required) if (!r.values[c] && !(c === "gross_amount" && r.values.gross_amount_ils)) reasons.push(`missing:${c}`);
    if ((family.code === "bank_documents" || family.code === "credit_card_documents") && signedMinor(r, adapter) === null) reasons.push("missing:amount");
    if (family.code === "payment_apps" && r.values.amount && signedMinor(r, adapter) === null) reasons.push("missing:direction");
    for (const i of r.issues) reasons.push(`${i.code}:${i.concept}`);
    const hasMoney = Object.values(r.values).some((v) => v.minor !== undefined);
    if (hasMoney && !r.currency) reasons.push("currency_unknown");
    if (reasons.length) incomplete.push(r.rowNumber);
    verdicts.set(r.rowNumber, { promotable: reasons.length === 0, reasons });
  }
  checks.push({ code: "required_fields", status: incomplete.length ? "failed" : "passed", detail: `${rows.length - incomplete.length}/${rows.length}`, rows: incomplete });

  // 2. payment app: only executed transfers moved money (status meaning approved in the adapter)
  if (family.code === "payment_apps") {
    const notExecuted = rows.filter((r) => r.values.status?.text === "not_executed").map((r) => r.rowNumber);
    for (const n of notExecuted) { const v = verdicts.get(n)!; v.promotable = false; v.reasons.push("not_executed"); }
    checks.push({ code: "not_executed_transfers", status: notExecuted.length ? "warned" : "passed", detail: String(notExecuted.length), rows: notExecuted });
  }

  // 3. net + VAT vs gross — the difference is recorded, no tolerance is decided (Gap D6)
  const vatDiff: number[] = [];
  for (const r of rows) {
    const n = r.values.net_amount?.minor, v = r.values.vat_amount?.minor, g = r.values.gross_amount?.minor;
    if (n !== undefined && v !== undefined && g !== undefined && BigInt(n) + BigInt(v) !== BigInt(g)) vatDiff.push(r.rowNumber);
  }
  if (rows.some((r) => r.values.net_amount && r.values.vat_amount && r.values.gross_amount)) {
    checks.push({ code: "net_plus_vat_equals_gross", status: vatDiff.length ? "warned" : "passed", detail: String(vatDiff.length), rows: vatDiff });
  }

  // 4. osek number structure (18B §6.2: validated, never corrected)
  const badIds = rows.filter((r) => r.values.vat_id?.text && !isValidIsraeliTaxId(r.values.vat_id.text)).map((r) => r.rowNumber);
  if (rows.some((r) => r.values.vat_id)) checks.push({ code: "tax_id_structure", status: badIds.length ? "warned" : "passed", detail: String(badIds.length), rows: badIds });

  // 5. bank balance continuity (chapter 5 §6; chapter 6 bank-connector: balances and sequences in code)
  if (family.code === "bank_documents" && rows.some((r) => r.values.balance)) {
    const series = rows.map((r) => ({ n: r.rowNumber, bal: r.values.balance?.minor, mov: signedMinor(r, adapter) }))
      .filter((x) => x.bal !== undefined) as { n: number; bal: string; mov: bigint | null }[];
    let asc = 0, desc = 0; const ascBad: number[] = [], descBad: number[] = [];
    for (let i = 1; i < series.length; i++) {
      const p = series[i - 1], c = series[i];
      if (c.mov !== null) { asc++; if (BigInt(p.bal) + c.mov !== BigInt(c.bal)) ascBad.push(c.n); }
      if (p.mov !== null) { desc++; if (BigInt(c.bal) + p.mov !== BigInt(p.bal)) descBad.push(p.n); }
    }
    const bad = ascBad.length <= descBad.length ? ascBad : descBad;
    if (asc + desc > 0) checks.push({ code: "balance_continuity", status: bad.length ? "warned" : "passed", detail: String(bad.length), rows: bad });
  }

  // 6. income / expense documents: role and the "invoice + receipt of the same deal" duplicate candidates (chapter 9 §10)
  if (side) {
    const noRole = rows.filter((r) => !r.values.document_role).map((r) => r.rowNumber);
    for (const n of noRole) { const v = verdicts.get(n)!; v.promotable = false; v.reasons.push("document_role_unmapped"); }
    checks.push({ code: "document_role", status: noRole.length ? "failed" : "passed", detail: String(noRole.length), rows: noRole });
    const counted = rows.filter((r) => r.values.document_role && COUNTED_ROLES[side].includes(r.values.document_role.role as never));
    const key = (r: NormalizedRow) => `${r.values.supplier?.text ?? r.values.customer?.text ?? ""}|${r.values.gross_amount?.minor ?? ""}`;
    const groups = new Map<string, NormalizedRow[]>();
    for (const r of counted) { const k = key(r); if (!k.endsWith("|")) groups.set(k, [...(groups.get(k) ?? []), r]); }
    const dupRows: number[] = [];
    for (const g of groups.values()) {
      const roles = new Set(g.map((r) => r.values.document_role!.role));
      if (g.length > 1 && roles.has("receipt") && (roles.has("tax_invoice") || roles.has("invoice_receipt"))) dupRows.push(...g.map((r) => r.rowNumber));
    }
    checks.push({ code: "invoice_receipt_duplicate_candidates", status: dupRows.length ? "warned" : "passed", detail: String(dupRows.length), rows: dupRows });
  }

  const state = checks.some((c) => c.status !== "passed") ? "needs_review" : "verified";
  return { checks, rows: verdicts, state };
}
