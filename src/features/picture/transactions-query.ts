// B4 list state (22B §51–§52, §79, §91; readiness ui-ux §3). Pure: parses / serialises the URL state of the transactions
// list so filters, search, sort and page survive opening a transaction and coming back. No sensitive data goes into the
// URL (22B §80): only filter values the user typed or picked. Invalid input is dropped, never guessed.

export const PAGE_SIZE = 50;
export type TxSort = "date" | "amount" | "account";
export type TxQuery = {
  month: string | null; account: string | null; dir: "in" | "out" | null;
  recon: "unmatched" | "candidate" | "matched" | null;
  min: number | null; max: number | null; // minor units
  q: string | null; sort: TxSort; order: "asc" | "desc"; page: number;
};
type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toMinor = (v: string | undefined) => {
  if (!v || !/^\d+(\.\d{1,2})?$/.test(v.trim())) return null;
  const [i, f = ""] = v.trim().split(".");
  return Number(i) * 100 + Number((f + "00").slice(0, 2));
};

export function parseTxQuery(p: Params): TxQuery {
  const month = one(p.month), account = one(p.account), dir = one(p.dir), recon = one(p.recon);
  const sort = one(p.sort), order = one(p.order), page = Number(one(p.page));
  const q = (one(p.q) ?? "").replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    month: month === "all" || (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) ? month : null,
    account: account && UUID.test(account) ? account : null,
    dir: dir === "in" || dir === "out" ? dir : null,
    recon: recon === "unmatched" || recon === "candidate" || recon === "matched" ? recon : null,
    min: toMinor(one(p.min)), max: toMinor(one(p.max)),
    q: q || null,
    sort: sort === "amount" || sort === "account" ? sort : "date",
    order: order === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

const fromMinor = (m: number) => (m % 100 ? (m / 100).toFixed(2) : String(m / 100));

/** URL query for the state; any override other than `page` returns to page 1. Defaults are omitted. */
export function txQueryString(s: TxQuery, override: Partial<TxQuery> = {}): string {
  const changesList = Object.keys(override).some((k) => k !== "page");
  const v: TxQuery = { ...s, ...override, page: override.page ?? (changesList ? 1 : s.page) };
  const p = new URLSearchParams();
  if (v.month) p.set("month", v.month);
  if (v.account) p.set("account", v.account);
  if (v.dir) p.set("dir", v.dir);
  if (v.recon) p.set("recon", v.recon);
  if (v.min !== null) p.set("min", fromMinor(v.min));
  if (v.max !== null) p.set("max", fromMinor(v.max));
  if (v.q) p.set("q", v.q);
  if (v.sort !== "date") p.set("sort", v.sort);
  if (v.order !== "desc") p.set("order", v.order);
  if (v.page > 1) p.set("page", String(v.page));
  const str = p.toString();
  return str ? `?${str}` : "";
}

/** A return path is honoured only when it is an internal app path (no open redirect). */
export function safeBack(v: string | string[] | undefined): string | null {
  const s = one(v);
  if (!s || !s.startsWith("/") || s.startsWith("//") || s.includes("\\")) return null;
  return s.slice(0, 500);
}

/** Filters that narrow the list (sort and page do not) — tells "no results for this filter" apart from "no data". */
export function activeFilters(s: TxQuery): { key: keyof TxQuery; label: string }[] {
  const out: { key: keyof TxQuery; label: string }[] = [];
  if (s.account) out.push({ key: "account", label: "חשבון" });
  if (s.dir) out.push({ key: "dir", label: s.dir === "in" ? "כניסות" : "יציאות" });
  if (s.recon) out.push({ key: "recon", label: s.recon === "matched" ? "הותאמו" : s.recon === "candidate" ? "התאמה מוצעת" : "ללא התאמה" });
  if (s.min !== null) out.push({ key: "min", label: `מ־${fromMinor(s.min)} ₪` });
  if (s.max !== null) out.push({ key: "max", label: `עד ${fromMinor(s.max)} ₪` });
  if (s.q) out.push({ key: "q", label: `חיפוש: ${s.q}` });
  return out;
}
