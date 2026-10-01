import { createHash } from "node:crypto";
import { COUNTED_ROLES, type Adapter } from "./adapter";
import type { Family } from "./families";
import type { NormalizedRow } from "./normalize-step";
import { signedMinor, type Verification } from "./validate";

// Import-path promotion plan (ADR-007: "a single-source deterministic import may create canonical transactions for that
// account; cross-source matching stays unmatched until the reconciliation engine runs"; 18A §46: only server-side with
// Evidence + Audit). Builds the candidate canonical records from verified-complete rows only. Nothing is matched across
// sources here (reconciliation_status = unmatched), and nothing incomplete is promoted.

export type TransactionCandidate = {
  key: string; rowNumber: number; date: string; valueDate: string | null; chargeDate: string | null;
  direction: "debit" | "credit"; amountMinor: string; currency: string;
  description: string | null; reference: string | null; balanceAfterMinor: string | null; feeMinor: string | null;
  typeCode: string | null;
};
export type DocumentCandidate = {
  key: string; side: "income" | "expense"; rowNumbers: number[]; role: string;
  date: string; documentNumber: string; party: string | null;
  grossMinor: string; netMinor: string | null; vatMinor: string | null; currency: string;
};
export type PromotionPlan = {
  accountType: "checking" | "payment_app" | "credit_card" | null;
  transactions: TransactionCandidate[];
  documents: DocumentCandidate[];
  notPromoted: { rowNumber: number; reasons: string[] }[];
};

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export function planPromotion(rows: NormalizedRow[], family: Family, adapter: Adapter, verification: Verification, side: "income" | "expense" | null): PromotionPlan {
  const notPromoted: PromotionPlan["notPromoted"] = [];
  const ok = rows.filter((r) => {
    const v = verification.rows.get(r.rowNumber);
    if (!v?.promotable) { notPromoted.push({ rowNumber: r.rowNumber, reasons: v?.reasons ?? ["unverified"] }); return false; }
    return true;
  });
  if (family.promotes === "transaction") {
    const seen = new Map<string, number>();
    const transactions = ok.map((r): TransactionCandidate => {
      const signed = signedMinor(r, adapter)!;
      const content = [r.values.transaction_date?.iso, signed.toString(), r.currency, r.originals.description ?? "", r.originals.counterparty ?? "", r.originals.reference ?? "", r.originals.balance ?? ""].join("|");
      const n = (seen.get(content) ?? 0) + 1; // identical lines in one file are separate events; re-uploads dedupe (18 V2 §9)
      seen.set(content, n);
      return {
        key: hash(`${content}#${n}`), rowNumber: r.rowNumber,
        date: r.values.transaction_date!.iso!, valueDate: r.values.value_date?.iso ?? null, chargeDate: r.values.charge_date?.iso ?? null,
        direction: signed < 0n ? "debit" : "credit", amountMinor: (signed < 0n ? -signed : signed).toString(), currency: r.currency!,
        description: r.originals.description ?? r.originals.supplier ?? r.originals.counterparty ?? null, reference: r.originals.reference ?? null,
        balanceAfterMinor: r.values.balance?.minor ?? null, feeMinor: r.values.fee_amount?.minor ?? null,
        typeCode: r.values.payment_method_meaning?.text ? `funded_by:${r.values.payment_method_meaning.text}` : null,
      };
    });
    const accountType = family.code === "payment_apps" ? "payment_app" : family.code === "credit_card_documents" ? "credit_card" : "checking";
    return { accountType, transactions, documents: [], notPromoted };
  }
  if (family.promotes === "income_or_expense" && side) {
    // a document may span several line rows (chapter 5 §9 line items): grouped by role + number + party
    const groups = new Map<string, NormalizedRow[]>();
    for (const r of ok) {
      const role = r.values.document_role!.role!;
      if (!COUNTED_ROLES[side].includes(role as never)) { notPromoted.push({ rowNumber: r.rowNumber, reasons: [`role_not_counted:${role}`] }); continue; }
      const party = r.originals.customer ?? r.originals.supplier ?? "";
      const k = `${side}|${role}|${r.originals.document_number ?? ""}|${party}|${r.values.document_date?.iso ?? ""}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const documents: DocumentCandidate[] = [];
    for (const [k, g] of groups) {
      const sum = (c: string) => g.every((r) => r.values[c]?.minor !== undefined) ? g.reduce((s, r) => s + BigInt(r.values[c]!.minor!), 0n).toString() : null;
      const ilsGross = sum("gross_amount_ils"), ilsNet = sum("net_amount_ils");
      const gross = ilsGross ?? sum("gross_amount");
      if (gross === null) { for (const r of g) notPromoted.push({ rowNumber: r.rowNumber, reasons: ["missing:gross_amount"] }); continue; }
      const currency = ilsGross !== null ? "ILS" : g[0].currency!;
      documents.push({
        key: hash(k), side, rowNumbers: g.map((r) => r.rowNumber), role: g[0].values.document_role!.role!,
        date: g[0].values.document_date!.iso!, documentNumber: g[0].originals.document_number ?? "",
        party: g[0].originals.customer ?? g[0].originals.supplier ?? null,
        grossMinor: gross, netMinor: ilsGross !== null ? ilsNet : sum("net_amount"), vatMinor: ilsGross !== null ? null : sum("vat_amount"), currency,
      });
    }
    return { accountType: null, transactions: [], documents, notPromoted };
  }
  for (const r of ok) notPromoted.push({ rowNumber: r.rowNumber, reasons: ["family_not_promoted_yet"] });
  return { accountType: null, transactions: [], documents: [], notPromoted };
}
