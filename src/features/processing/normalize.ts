// Deterministic value normalization (18B §6.2; chapter 5 §22: the original text is kept; the normalized value is stored
// separately). Nothing is guessed: a value that does not parse cleanly returns null, never 0 (chapter 5 §5, §27).

export type DateFormat = "dmy" | "dmy_two_digit_year_20" | "iso";
export type ParsedDate = { iso: string; precision: "day" };

/** Amount text → minor units (agorot) as a bigint string, or null. Handles 1,234.56 · -1,234.56 · 1,234.56- · (1,234.56) · ₪. */
export function parseAmountMinor(text: string | null | undefined): string | null {
  const r = parseAmount(text);
  return r && r.ok ? r.minor : null;
}

/** Like parseAmountMinor, but tells apart "empty / not a number" from "more precision than agorot" (never rounded silently). */
export function parseAmount(text: string | null | undefined): { ok: true; minor: string } | { ok: false; reason: "precision" } | null {
  if (text == null) return null;
  let s = String(text).trim().replace(/[‎‏‪-‮ \s]/g, "");
  if (s === "" || s === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/₪|ש"ח|ש״ח/g, "");
  if (s.endsWith("-")) { negative = !negative; s = s.slice(0, -1); }
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[0-9][0-9,]*(\.[0-9]+)?$/.test(s)) return null;
  const [intPart, frac = ""] = s.replace(/,/g, "").split(".");
  if (frac.length > 2 && !/^0+$/.test(frac.slice(2))) return { ok: false, reason: "precision" };
  const minor = BigInt(intPart) * 100n + BigInt((frac + "00").slice(0, 2));
  return { ok: true, minor: minor === 0n ? "0" : (negative ? -minor : minor).toString() };
}

/**
 * Date text → ISO date, or null. Israeli order is day-first. A two-digit year is NOT expanded unless the approved
 * adapter for this source says so (18B §6.2 "אין המצאת יום"; Stage 3 D7).
 */
export function parseDate(text: string | null | undefined, format: DateFormat = "dmy"): ParsedDate | null {
  if (text == null) return null;
  const s = String(text).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return day(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (m) return day(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (m && format === "dmy_two_digit_year_20") return day(2000 + +m[3], +m[2], +m[1]);
  return null;
}

/** True when the text is a day-first date written with a two-digit year (needs an explicit decision before use). */
export function hasTwoDigitYear(text: string): boolean {
  return /^\d{1,2}[./-]\d{1,2}[./-]\d{2}(\s|$)/.test(String(text).trim());
}

export const parseDateIso = (text: string | null | undefined, format: DateFormat = "dmy") => parseDate(text, format)?.iso ?? null;

function day(y: number, mo: number, d: number): ParsedDate | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { iso: dt.toISOString().slice(0, 10), precision: "day" };
}

/** Plain decimal number (quantity, rate) as a string, or null. */
export function parseNumber(text: string | null | undefined): string | null {
  if (text == null) return null;
  const s = String(text).trim().replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? s : null;
}

/** Header text → comparison key: no quotes/geresh/punctuation, single spaces, lower case. Used for adapter signatures only. */
export function headerKey(text: string): string {
  return String(text)
    .replace(/[‎‏‪-‮]/g, "")
    .replace(/["'״׳`]/g, "")
    .replace(/[()[\]{}:;,.*_\-/\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Israeli osek / company number structure check: 9 digits with a Luhn-style (ID) check digit. Never "corrected" (18B §6.2). */
export function isValidIsraeliTaxId(text: string): boolean {
  const d = String(text).replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let x = Number(d[i]) * ((i % 2) + 1);
    if (x > 9) x -= 9;
    sum += x;
  }
  return sum % 10 === 0;
}

/** Currency text written in the source → ISO code, or null (18B §6.2: ₪/שח/ILS → ILS; the original is kept). */
export function currencyCode(text: string | null | undefined): string | null {
  const t = String(text ?? "").trim();
  if (/^(₪|ש"?ח|ש״ח|ils|nis)$/i.test(t)) return "ILS";
  if (/^(\$|usd)$/i.test(t)) return "USD";
  if (/^(€|eur)$/i.test(t)) return "EUR";
  return /^[A-Z]{3}$/.test(t) ? t : null;
}
