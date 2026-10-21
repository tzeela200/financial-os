import Link from "next/link";
import { Search, ChevronLeft, ArrowLeftRight, Receipt, FileText, Wallet, Landmark } from "lucide-react";
import { searchAll, type SearchGroup } from "@/features/search/global-search";
import { dayLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import { EmptyState } from "@/components/ui/empty-state";
import "@/components/ui/ui.css";
import "@/components/business/business.css";

export const dynamic = "force-dynamic";

const ICON: Record<SearchGroup["key"], typeof Search> = { transactions: ArrowLeftRight, expenses: Receipt, income: Landmark, files: FileText, sources: Wallet };

// Global search results (19B §22: one search over the whole system, results grouped by subject; D-028).
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const groups = q.length >= 2 ? await searchAll(q) : [];
  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  return (
    <div className="ws">
      <header className="ws-header">
        <div>
          <h1 className="ws-title">חיפוש</h1>
          <p className="ws-sub">בכל המערכת: תנועות, הוצאות והכנסות העסק (לפי ספק, לקוח, מספר מסמך או סוג הוצאה), קבצים ומקורות</p>
        </div>
      </header>
      <form method="get" action="/search" role="search" className="card search-form" aria-label="חיפוש בכל המערכת">
        <label htmlFor="search-q" className="field-label">מה לחפש</label>
        <span className="field-icon-wrap"><Search size={18} aria-hidden="true" className="field-icon" />
          <input dir="auto" id="search-q" name="q" type="search" defaultValue={q} className="field-input field-input--icon" placeholder="למשל: Supabase, תוכנה, 1250, שם קובץ" autoComplete="off" /></span>
        <button type="submit" className="btn btn-primary">חיפוש</button>
      </form>

      {q.length < 2 ? (
        <EmptyState icon={Search} size="compact" title="כתבי לפחות שני תווים כדי לחפש" />
      ) : total === 0 ? (
        <EmptyState icon={Search} title={`לא נמצאו תוצאות ל„${q}”`} testId="search-empty">אפשר לחפש לפי תיאור תנועה, ספק, מספר מסמך, סוג הוצאה, סכום מדויק או שם קובץ.</EmptyState>
      ) : (
        <div className="search-groups" data-testid="search-results">
          {groups.map((g) => {
            const Icon = ICON[g.key];
            return (
              <section key={g.key} aria-labelledby={`g-${g.key}`} className="card dash-card" data-testid={`search-${g.key}`}>
                <div className="dash-card-head">
                  <h2 id={`g-${g.key}`} className="card-title"><Icon size={18} aria-hidden="true" /> {g.label} <span className="muted num">({g.hits.length}{g.more ? "+" : ""})</span></h2>
                  {g.more ? <Link href={g.more} className="section-link">לכל התוצאות</Link> : null}
                </div>
                <ul className="recent-list">
                  {g.hits.map((h) => (
                    <li key={h.id}>
                      <Link href={h.href} className="recent-row">
                        <span className="recent-date num">{h.date ? dayLabel(h.date) : ""}</span>
                        <span className="recent-desc"><bdi>{h.title}</bdi>{h.meta ? <span className="recent-account">{h.meta}</span> : null}</span>
                        <span className={`recent-amount${h.direction === "credit" ? " fin-pos" : ""}`}>{h.amount ? <Amount value={h.direction === "debit" ? { ...h.amount, minor: (-BigInt(h.amount.minor)).toString() } : h.amount} /> : null}</span>
                        <ChevronLeft size={16} aria-hidden="true" className="recent-chevron" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
