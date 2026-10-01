import { formatMoney } from "./money-amount";

// Money from a read model ({ minor, currency } with minor as a bigint string). null → "לא ידוע", never 0 (20D §5).
export function Amount({ value, unknownText = "לא ידוע" }: { value: { minor: string; currency: string } | null; unknownText?: string }) {
  if (!value) return <span className="money money--unknown">{unknownText}</span>;
  return <span className="money num" dir="ltr">{formatMoney(BigInt(value.minor), value.currency)}</span>;
}
