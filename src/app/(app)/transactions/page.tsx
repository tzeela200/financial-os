import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import "@/components/ui/ui.css";
import "@/components/business/business.css";

export const dynamic = "force-dynamic";

const RECON: Record<string, { text: string; tone: string }> = {
  unmatched: { text: "ללא התאמה", tone: "neutral" }, candidate: { text: "התאמה מוצעת", tone: "warn" }, matched: { text: "הותאם", tone: "ok" },
  rejected: { text: "נדחתה", tone: "neutral" }, partial: { text: "חלקית", tone: "warn" }, needs_review: { text: "דורש בדיקה", tone: "warn" },
};

// B4 Transactions (22B §B4): canonical money movements from every source, read through RLS. Category is shown only when
// known (none is inferred). Each row opens the record → evidence → source row.
export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: monthsData } = await supabase.from("transactions").select("transaction_date").is("archived_at", null).order("transaction_date", { ascending: false }).limit(20000);
  const months = [...new Set(((monthsData ?? []) as { transaction_date: string }[]).map((r) => r.transaction_date.slice(0, 7)))];
  const month = typeof sp.month === "string" && months.includes(sp.month) ? sp.month : months[0] ?? null;
  const account = typeof sp.account === "string" ? sp.account : null;
  const { data: accounts } = await supabase.from("accounts").select("id, account_name").is("archived_at", null);

  let q = supabase.from("transactions").select("id, transaction_date, description_original, direction, amount_minor, currency_code, reconciliation_status, transaction_type_code, source_record_id, accounts!inner(id, account_name, account_type_code)").is("archived_at", null).order("transaction_date", { ascending: false }).limit(1000);
  if (month) {
    const [y, mo] = month.split("-").map(Number);
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    q = q.gte("transaction_date", `${month}-01`).lt("transaction_date", next);
  }
  if (account) q = q.eq("account_id", account);
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as { id: string; transaction_date: string; description_original: string | null; direction: string; amount_minor: number; currency_code: string; reconciliation_status: string; transaction_type_code: string | null; source_record_id: string | null; accounts: { id: string; account_name: string; account_type_code: string } }[];
  const qs = (extra: Record<string, string | null>) => { const p = new URLSearchParams(); const v = { month, account, ...extra }; for (const [k, x] of Object.entries(v)) if (x) p.set(k, x); const s = p.toString(); return s ? `?${s}` : ""; };

  return (
    <div className="ws">
      <header className="ws-header">
        <div><h1 className="ws-title">תנועות</h1><p className="ws-sub">כל תנועות הכסף מכל המקורות שהעלית. פתיחת תנועה מובילה לשורת המקור.</p></div>
      </header>
      {months.length ? (
        <nav className="month-nav" aria-label="בחירת חודש">
          {months.slice(0, 12).map((m) => <Link key={m} href={`/transactions${qs({ month: m })}`} className={`chip${m === month ? " chip--active" : ""}`}>{monthLabel(m)}</Link>)}
        </nav>
      ) : null}
      {(accounts ?? []).length > 1 ? (
        <nav className="month-nav" aria-label="סינון לפי חשבון">
          <Link href={`/transactions${qs({ account: null })}`} className={`chip${!account ? " chip--active" : ""}`}>כל החשבונות</Link>
          {((accounts ?? []) as { id: string; account_name: string }[]).map((a) => <Link key={a.id} href={`/transactions${qs({ account: a.id })}`} className={`chip${a.id === account ? " chip--active" : ""}`}>{a.account_name}</Link>)}
        </nav>
      ) : null}
      {error ? <div className="error-state" role="alert">לא ניתן היה לטעון את התנועות. המידע השמור לא נפגע.</div>
        : rows.length === 0 ? <p className="card muted-note">עדיין אין תנועות. הן יופיעו אחרי קליטת מקור בנק, כרטיס אשראי או bit.</p> : (
        <div className="table-scroll card">
          <table className="data-table" data-testid="transactions-table">
            <thead><tr><th scope="col">תאריך</th><th scope="col">תיאור</th><th scope="col">חשבון / מקור</th><th scope="col">סכום</th><th scope="col">כיוון</th><th scope="col">קטגוריה</th><th scope="col">התאמה</th><th scope="col">מסמך</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="num">{dayLabel(t.transaction_date)}</td>
                  <td><Link href={`/records/transaction/${t.id}`} className="file-link">{t.description_original || "ללא תיאור"}</Link></td>
                  <td>{t.accounts.account_name}</td>
                  <td className={t.direction === "credit" ? "fin-pos" : "fin-neg"}><Amount value={{ minor: String(t.amount_minor), currency: t.currency_code }} /></td>
                  <td>{t.direction === "credit" ? "כניסה" : "יציאה"}</td>
                  <td className="muted">לא סווג</td>
                  <td><span className={`badge badge--${RECON[t.reconciliation_status]?.tone ?? "neutral"}`}>{RECON[t.reconciliation_status]?.text ?? t.reconciliation_status}</span></td>
                  <td>{t.source_record_id ? <Link href={`/records/transaction/${t.id}`} className="file-link">שורת מקור</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
