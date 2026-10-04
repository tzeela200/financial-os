import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { parseTxQuery, txQueryString, activeFilters, canonicalTxRedirect, PAGE_SIZE, type TxQuery, type TxSort } from "@/features/picture/transactions-query";
import { Amount } from "@/components/ui/amount";
import "@/components/ui/ui.css";
import "@/components/business/business.css";
import "@/components/interaction/interaction.css";

export const dynamic = "force-dynamic";

const RECON: Record<string, { text: string; tone: string }> = {
  unmatched: { text: "ללא התאמה", tone: "neutral" }, candidate: { text: "התאמה מוצעת", tone: "warn" }, matched: { text: "הותאם", tone: "ok" },
  rejected: { text: "נדחתה", tone: "neutral" }, partial: { text: "חלקית", tone: "warn" }, needs_review: { text: "דורש בדיקה", tone: "warn" },
};
const PENDING = new Set(["candidate", "partial", "needs_review"]);
type Row = { id: string; transaction_date: string; description_original: string | null; reference: string | null; direction: string; amount_minor: number; currency_code: string; reconciliation_status: string; source_record_id: string | null; accounts: { id: string; account_name: string; account_type_code: string } };

// B4 Transactions (22B §47–§58, §79, §91, §100; readiness ui-ux §3). Canonical money movements from every source, read
// through RLS. Filtering, search, sort and paging run on the server; the whole list state lives in the URL so opening a
// transaction and coming back restores it. No category or context is inferred (§56) — unknown stays "לא סווג".
export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const canonical = canonicalTxRedirect(sp); // a submitted filter form carries empty fields → one clean, shareable URL
  if (canonical) redirect(canonical);
  const s = parseTxQuery(sp);
  const supabase = await createClient();
  const [{ data: monthsData }, { data: accountsData }] = await Promise.all([
    supabase.from("transactions").select("transaction_date").is("archived_at", null).order("transaction_date", { ascending: false }).limit(20000),
    supabase.from("accounts").select("id, account_name").is("archived_at", null).order("account_name"),
  ]);
  const months = [...new Set(((monthsData ?? []) as { transaction_date: string }[]).map((r) => r.transaction_date.slice(0, 7)))];
  const accounts = (accountsData ?? []) as { id: string; account_name: string }[];
  const hasAnyData = months.length > 0;
  // period: an explicit month, "all", or (default) the latest month with data (22B §79 period consistency)
  const month = s.month === "all" ? null : s.month ?? months[0] ?? null;
  const state: TxQuery = { ...s, month: s.month === "all" ? "all" : month };

  let q = supabase.from("transactions")
    .select("id, transaction_date, description_original, reference, direction, amount_minor, currency_code, reconciliation_status, source_record_id, accounts!inner(id, account_name, account_type_code)", { count: "exact" })
    .is("archived_at", null);
  if (month) {
    const [y, mo] = month.split("-").map(Number);
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    q = q.gte("transaction_date", `${month}-01`).lt("transaction_date", next);
  }
  if (s.account) q = q.eq("account_id", s.account);
  if (s.dir) q = q.eq("direction", s.dir === "in" ? "credit" : "debit");
  if (s.recon === "candidate") q = q.in("reconciliation_status", [...PENDING]);
  else if (s.recon) q = q.eq("reconciliation_status", s.recon);
  if (s.min !== null) q = q.gte("amount_minor", s.min);
  if (s.max !== null) q = q.lte("amount_minor", s.max);
  if (s.q) {
    // server-side search (§52): description, reference, and an exact amount when the text is a number — no local guessing
    const amount = /^\d+(\.\d{1,2})?$/.test(s.q) ? Math.round(Number(s.q) * 100) : null;
    q = q.or([`description_original.ilike.*${s.q}*`, `reference.ilike.*${s.q}*`, ...(amount !== null ? [`amount_minor.eq.${amount}`] : [])].join(","));
  }
  const col = s.sort === "amount" ? "amount_minor" : s.sort === "account" ? "account_id" : "transaction_date";
  q = q.order(col, { ascending: s.order === "asc" }).order("id", { ascending: true }).range((s.page - 1) * PAGE_SIZE, s.page * PAGE_SIZE - 1);
  const { data, error, count } = await q;
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filters = activeFilters(state);
  const cleared = `/transactions${txQueryString({ ...state, account: null, dir: null, recon: null, min: null, max: null, q: null })}`;
  const listPath = `/transactions${txQueryString(state)}`;
  const open = (id: string) => `/records/transaction/${id}?back=${encodeURIComponent(listPath)}`;
  const sortLink = (key: TxSort) => `/transactions${txQueryString(state, { sort: key, order: state.sort === key && state.order === "desc" ? "asc" : "desc" })}`;
  const ariaSort = (key: TxSort) => (state.sort === key ? (state.order === "asc" ? "ascending" : "descending") : "none");
  const arrow = (key: TxSort) => (state.sort === key ? (state.order === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="ws">
      <header className="ws-header">
        <div><h1 className="ws-title">תנועות</h1><p className="ws-sub">כל תנועות הכסף מכל המקורות שהעלית. פתיחת תנועה מובילה למקור שלה.</p></div>
      </header>

      {hasAnyData ? (
        <nav className="month-nav" aria-label="בחירת תקופה">
          <Link href={`/transactions${txQueryString(state, { month: "all" })}`} className={`chip${state.month === "all" ? " chip--active" : ""}`} aria-current={state.month === "all" ? "page" : undefined}>כל התקופה</Link>
          {months.slice(0, 12).map((m) => <Link key={m} href={`/transactions${txQueryString(state, { month: m })}`} className={`chip${m === month ? " chip--active" : ""}`} aria-current={m === month ? "page" : undefined}>{monthLabel(m)}</Link>)}
        </nav>
      ) : null}

      {hasAnyData ? (
        <form method="get" action="/transactions" className="card tx-filters" role="search" aria-label="חיפוש וסינון תנועות">
          {state.month ? <input type="hidden" name="month" value={state.month} /> : null}
          {state.sort !== "date" ? <input type="hidden" name="sort" value={state.sort} /> : null}
          {state.order !== "desc" ? <input type="hidden" name="order" value={state.order} /> : null}
          <div className="tx-search">
            <label className="field">
              <span className="field-label">חיפוש</span>
              <input className="field-input" type="search" name="q" defaultValue={state.q ?? ""} placeholder="תיאור, אסמכתא או סכום" data-testid="tx-search" />
            </label>
            <button type="submit" className="btn btn-primary">חיפוש</button>
          </div>
          <details className="tx-more" open={filters.some((f) => f.key !== "q")}>
            <summary>עוד סינונים</summary>
            <div className="tx-filter-grid">
              {accounts.length > 1 ? (
                <label className="field"><span className="field-label">חשבון / כרטיס</span>
                  <select className="field-input" name="account" defaultValue={state.account ?? ""} data-testid="tx-account">
                    <option value="">כל החשבונות</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="field"><span className="field-label">כיוון</span>
                <select className="field-input" name="dir" defaultValue={state.dir ?? ""} data-testid="tx-dir">
                  <option value="">הכול</option><option value="in">כניסות</option><option value="out">יציאות</option>
                </select>
              </label>
              <label className="field"><span className="field-label">התאמה</span>
                <select className="field-input" name="recon" defaultValue={state.recon ?? ""} data-testid="tx-recon">
                  <option value="">הכול</option><option value="unmatched">ללא התאמה</option><option value="candidate">התאמה מוצעת / בבדיקה</option><option value="matched">הותאמו</option>
                </select>
              </label>
              <label className="field"><span className="field-label">סכום מ־ (₪)</span><input className="field-input num" name="min" inputMode="decimal" defaultValue={state.min !== null ? String(state.min / 100) : ""} /></label>
              <label className="field"><span className="field-label">סכום עד (₪)</span><input className="field-input num" name="max" inputMode="decimal" defaultValue={state.max !== null ? String(state.max / 100) : ""} /></label>
            </div>
            <button type="submit" className="btn-secondary">החלת סינון</button>
          </details>
          {filters.length ? (
            <div className="tx-active" aria-label="סינונים פעילים">
              {filters.map((f) => <Link key={f.key} href={`/transactions${txQueryString(state, { [f.key]: null } as Partial<TxQuery>)}`} className="chip chip--active" aria-label={`הסרת סינון: ${f.label}`}>{f.label} ✕</Link>)}
              <Link href={cleared} className="file-link" data-testid="tx-clear">ניקוי כל הסינונים</Link>
            </div>
          ) : null}
        </form>
      ) : null}

      {error ? <div className="error-state" role="alert">לא ניתן היה לטעון את התנועות. המידע השמור לא נפגע. אפשר לרענן את העמוד.</div>
        : !hasAnyData ? <p className="card muted-note" data-testid="tx-empty">עדיין אין תנועות. הן יופיעו אחרי קליטת מקור בנק, כרטיס אשראי או bit ב„חשבונות ומקורות”.</p>
        : rows.length === 0 ? (
          <div className="card muted-note" data-testid="tx-filtered-empty" role="status">
            {filters.length ? <>אין תנועות שמתאימות לסינון הזה{month ? ` ב${monthLabel(month)}` : ""}. <Link href={cleared} className="file-link">ניקוי הסינון</Link></> : <>אין תנועות ב{month ? monthLabel(month) : "תקופה הזו"}.</>}
          </div>
        ) : (
          <>
            <p className="muted-note tx-count" role="status" data-testid="tx-count"><span className="num">{total}</span> תנועות{month ? ` · ${monthLabel(month)}` : " · כל התקופה"}{pages > 1 ? ` · עמוד ${state.page} מתוך ${pages}` : ""}</p>
            <div className="table-scroll card tx-table-wrap">
              <table className="data-table" data-testid="transactions-table">
                <caption className="visually-hidden">תנועות, ממוינות לפי {state.sort === "amount" ? "סכום" : state.sort === "account" ? "מקור" : "תאריך"}</caption>
                <thead><tr>
                  <th scope="col" aria-sort={ariaSort("date")}><Link href={sortLink("date")} className="th-sort" data-testid="sort-date">תאריך{arrow("date")}</Link></th>
                  <th scope="col">תיאור</th>
                  <th scope="col" aria-sort={ariaSort("account")}><Link href={sortLink("account")} className="th-sort">חשבון / מקור{arrow("account")}</Link></th>
                  <th scope="col" aria-sort={ariaSort("amount")}><Link href={sortLink("amount")} className="th-sort" data-testid="sort-amount">סכום{arrow("amount")}</Link></th>
                  <th scope="col">כיוון</th><th scope="col">קטגוריה</th><th scope="col">התאמה</th><th scope="col">מסמך</th><th scope="col">מצב בדיקה</th>
                </tr></thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td><span className="num">{dayLabel(t.transaction_date)}</span></td>
                      <td><Link href={open(t.id)} className="file-link"><bdi>{t.description_original || "ללא תיאור"}</bdi></Link></td>
                      <td>{t.accounts.account_name}</td>
                      <td className={t.direction === "credit" ? "fin-pos" : "fin-neg"}><Amount value={{ minor: String(t.amount_minor), currency: t.currency_code }} /></td>
                      <td>{t.direction === "credit" ? "כניסה" : "יציאה"}</td>
                      <td className="muted">לא סווג</td>
                      <td><span className={`badge badge--${RECON[t.reconciliation_status]?.tone ?? "neutral"}`}>{RECON[t.reconciliation_status]?.text ?? t.reconciliation_status}</span></td>
                      <td>{t.source_record_id ? <Link href={open(t.id)} className="file-link">שורת מקור</Link> : "—"}</td>
                      <td>{PENDING.has(t.reconciliation_status) ? <Link href="/review" className="file-link">ממתין להחלטתך</Link> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="tx-cards" data-testid="transactions-cards">
              {rows.map((t) => (
                <li key={t.id} className="card tx-card">
                  <Link href={open(t.id)} className="tx-card-link">
                    <span className="tx-card-title"><bdi>{t.description_original || "ללא תיאור"}</bdi></span>
                    <span className="tx-card-meta"><span className="num">{dayLabel(t.transaction_date)}</span> · {t.accounts.account_name}</span>
                    <span className={`tx-card-amount ${t.direction === "credit" ? "fin-pos" : "fin-neg"}`}>{t.direction === "credit" ? "כניסה " : "יציאה "}<Amount value={{ minor: String(t.amount_minor), currency: t.currency_code }} /></span>
                    <span className="tx-card-status">
                      <span className="muted">לא סווג</span>
                      <span className={`badge badge--${RECON[t.reconciliation_status]?.tone ?? "neutral"}`}>{RECON[t.reconciliation_status]?.text ?? t.reconciliation_status}</span>
                      {t.source_record_id ? <span className="muted">יש שורת מקור</span> : null}
                      {PENDING.has(t.reconciliation_status) ? <span className="badge badge--warn">נדרשת בדיקה</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {pages > 1 ? (
              <nav className="tx-pager" aria-label="דפדוף בין עמודים">
                {state.page > 1 ? <Link href={`/transactions${txQueryString(state, { page: state.page - 1 })}`} className="btn-secondary" rel="prev" data-testid="tx-prev">הקודם</Link> : <span className="btn-secondary" aria-disabled="true">הקודם</span>}
                <span className="muted num">עמוד {state.page} מתוך {pages}</span>
                {state.page < pages ? <Link href={`/transactions${txQueryString(state, { page: state.page + 1 })}`} className="btn-secondary" rel="next" data-testid="tx-next">הבא</Link> : <span className="btn-secondary" aria-disabled="true">הבא</span>}
              </nav>
            ) : null}
          </>
        )}
    </div>
  );
}
