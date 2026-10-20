/** A calendar month as a half-open range [first day, first day of the next month) — valid for every month length. */
export function monthBounds(month: string): { start: string; endExclusive: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, endExclusive: `${next}-01` };
}
