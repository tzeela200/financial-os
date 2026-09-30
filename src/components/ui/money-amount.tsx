// Money Amount (21A §9, 20D §5): amount in minor units + currency; NULL is never shown as 0.
// Formatting only (23D §12): thousands separator, 2 decimals when needed, ₪ after the amount, clear minus.
const SYMBOL: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€" };

export function formatMoney(amountMinor: number | bigint, currency: string): string {
  const n = Number(amountMinor) / 100;
  const abs = Math.abs(n);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const body = abs.toLocaleString("he-IL", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${body} ${SYMBOL[currency] ?? currency}`;
}

export function MoneyAmount({ amountMinor, currency }: { amountMinor: number | bigint | null; currency: string | null }) {
  if (amountMinor === null || currency === null) {
    return <span className="money money--unknown">לא ידוע</span>;
  }
  return <span className="money num">{formatMoney(amountMinor, currency)}</span>;
}
