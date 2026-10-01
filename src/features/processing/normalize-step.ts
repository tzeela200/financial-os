import { columnOf, type Adapter } from "./adapter";
import { conceptByCode } from "./concepts";
import { currencyCode, hasTwoDigitYear, parseAmount, parseDate, parseNumber } from "./normalize";
import type { ExtractedRecord } from "./extract";

// Normalization (18B §6, 23A §37): turns the extracted values of mapped columns into one representation — ISO dates with
// precision, money in minor units with an explicit currency, cleaned ids — using only the rules of the approved adapter.
// The original value is always kept beside the normalized one. Nothing is merged, corrected or invented.

export const NORMALIZER_VERSION = "normalize-v1";

export type NormalizedValue = { iso?: string; precision?: "day"; minor?: string; currency?: string | null; number?: string; text?: string; role?: string };
export type RowIssue = { concept: string; code: "unparseable" | "precision" | "two_digit_year" | "unmapped_value" | "missing" };
export type NormalizedRow = {
  sheet: string; rowNumber: number;
  values: Record<string, NormalizedValue>; // by concept code
  originals: Record<string, string>;
  currency: string | null;
  issues: RowIssue[];
};

export function normalizeRows(records: ExtractedRecord[], adapter: Adapter): NormalizedRow[] {
  const currencyCol = columnOf(adapter, "currency");
  return records.filter((r) => r.kind === "data").map((r) => {
    const values: Record<string, NormalizedValue> = {};
    const originals: Record<string, string> = {};
    const issues: RowIssue[] = [];
    const currency = currencyCol !== undefined ? currencyCode(r.cells[currencyCol]) : adapter.currencyDefault;

    for (const col of adapter.columns) {
      if (!col.concept) continue;
      const raw = (r.cells[col.index] ?? "").trim();
      if (!raw) continue;
      originals[col.concept] = raw;
      const type = conceptByCode(col.concept)?.dataType ?? "text";
      if (type === "date") {
        const d = parseDate(raw, adapter.dateFormat);
        if (d) values[col.concept] = { iso: d.iso, precision: d.precision };
        else issues.push({ concept: col.concept, code: hasTwoDigitYear(raw) ? "two_digit_year" : "unparseable" });
      } else if (type === "money") {
        const a = parseAmount(raw);
        if (a && a.ok) values[col.concept] = { minor: a.minor, currency };
        else issues.push({ concept: col.concept, code: a && !a.ok ? "precision" : "unparseable" });
      } else if (type === "number" || type === "rate") {
        const n = parseNumber(raw);
        if (n !== null) values[col.concept] = { number: n };
        else issues.push({ concept: col.concept, code: "unparseable" });
      } else if (col.concept === "direction") {
        const v = adapter.values.direction?.[raw];
        if (v) values.direction = { text: v };
        else issues.push({ concept: "direction", code: "unmapped_value" });
      } else if (col.concept === "status" && adapter.values.status) {
        const v = adapter.values.status[raw];
        if (v) values.status = { text: v };
        else issues.push({ concept: "status", code: "unmapped_value" });
      } else if (col.concept === "payment_method" && adapter.values.paymentMethod) {
        values.payment_method = { text: raw };
        const v = adapter.values.paymentMethod[raw];
        if (v) values.payment_method_meaning = { text: v };
      } else if ((col.concept === "document_type" || col.concept === "document_type_code") && adapter.values.documentRole) {
        const v = adapter.values.documentRole[raw];
        if (v) values.document_role = { role: v };
        values[col.concept] = { text: raw };
      } else {
        values[col.concept] = { text: raw };
      }
    }
    return { sheet: r.sheet, rowNumber: r.rowNumber, values, originals, currency, issues };
  });
}
