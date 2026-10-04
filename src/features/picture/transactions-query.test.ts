import { describe, it, expect } from "vitest";
import { parseTxQuery, txQueryString, safeBack, activeFilters, PAGE_SIZE } from "./transactions-query";

// B4 list state (22B §51–§52, §79, §91; readiness ui-ux §3): filters, search, sort and page live in the URL so that
// opening a transaction and coming back restores the same list. Invalid input never throws and never guesses.

describe("parseTxQuery", () => {
  it("defaults: newest first, page 1, no filters", () => {
    expect(parseTxQuery({})).toEqual({ month: null, account: null, dir: null, recon: null, min: null, max: null, q: null, sort: "date", order: "desc", page: 1 });
  });
  it("reads valid values", () => {
    const q = parseTxQuery({ month: "2026-09", account: "11111111-1111-1111-1111-111111111111", dir: "out", recon: "candidate", min: "10", max: "250.5", q: "  קפה  ", sort: "amount", order: "asc", page: "3" });
    expect(q).toMatchObject({ month: "2026-09", dir: "out", recon: "candidate", min: 1000, max: 25050, q: "קפה", sort: "amount", order: "asc", page: 3 });
  });
  it("'all' is an explicit whole-period choice", () => {
    expect(parseTxQuery({ month: "all" }).month).toBe("all");
    expect(txQueryString(parseTxQuery({ month: "all" }))).toBe("?month=all");
  });
  it("drops invalid values instead of guessing", () => {
    const q = parseTxQuery({ month: "2026-13", account: "x", dir: "sideways", recon: "maybe", min: "abc", sort: "hack", order: "up", page: "-2" });
    expect(q).toMatchObject({ month: null, account: null, dir: null, recon: null, min: null, sort: "date", order: "desc", page: 1 });
  });
  it("strips characters that would break the server filter syntax from the search text", () => {
    expect(parseTxQuery({ q: "a,b(c)%*" }).q).toBe("a b c");
    expect(parseTxQuery({ q: "x".repeat(200) }).q?.length).toBe(80);
  });
});

describe("txQueryString", () => {
  it("round-trips the state and omits defaults", () => {
    const s = parseTxQuery({ month: "2026-09", dir: "in", q: "שכר", sort: "amount", order: "asc", page: "2" });
    expect(txQueryString(s)).toBe("?month=2026-09&dir=in&q=%D7%A9%D7%9B%D7%A8&sort=amount&order=asc&page=2");
    expect(parseTxQuery(Object.fromEntries(new URLSearchParams(txQueryString(s))))).toEqual(s);
    expect(txQueryString(parseTxQuery({}))).toBe("");
  });
  it("changing a filter returns to page 1", () => {
    const s = parseTxQuery({ page: "4" });
    expect(txQueryString(s, { dir: "out" })).toBe("?dir=out");
  });
});

describe("safeBack — return path after opening a record", () => {
  it("accepts only internal app paths", () => {
    expect(safeBack("/transactions?dir=out&page=2")).toBe("/transactions?dir=out&page=2");
    expect(safeBack("/snapshot/details?metric=money_out")).toBe("/snapshot/details?metric=money_out");
    expect(safeBack("https://evil.example")).toBeNull();
    expect(safeBack("//evil.example")).toBeNull();
    expect(safeBack("/\\evil")).toBeNull();
    expect(safeBack(undefined)).toBeNull();
  });
});

describe("activeFilters", () => {
  it("lists what narrows the list (so filtered-empty can be told apart from empty)", () => {
    expect(activeFilters(parseTxQuery({}))).toEqual([]);
    expect(activeFilters(parseTxQuery({ dir: "out", q: "קפה", sort: "amount" })).map((f) => f.key)).toEqual(["dir", "q"]);
  });
  it("page size is fixed", () => { expect(PAGE_SIZE).toBe(50); });
});

describe("canonicalTxRedirect", () => {
  it("asks to redirect when the raw query has empty or invalid fields (e.g. a submitted filter form)", async () => {
    const { canonicalTxRedirect } = await import("./transactions-query");
    expect(canonicalTxRedirect({ month: "2026-08", q: "", account: "", dir: "out", recon: "", min: "", max: "" })).toBe("/transactions?month=2026-08&dir=out");
    expect(canonicalTxRedirect({ dir: "sideways" })).toBe("/transactions");
  });
  it("does not redirect an already canonical query (no loop), whatever the parameter order", async () => {
    const { canonicalTxRedirect } = await import("./transactions-query");
    expect(canonicalTxRedirect({ month: "2026-08", dir: "out" })).toBeNull();
    expect(canonicalTxRedirect({ dir: "out", month: "2026-08" })).toBeNull();
    expect(canonicalTxRedirect({})).toBeNull();
  });
});
