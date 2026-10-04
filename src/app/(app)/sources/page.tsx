import Link from "next/link";
import { ROUTE_A_SOURCES } from "@/features/sources/route-a-sources";
import { getSourcesOverview } from "@/features/sources/sources-overview";
import { CoverageIndicator } from "@/components/ui/coverage-indicator";
import { getCurrentPicture } from "@/features/picture/current-picture";
import { dayLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import { EmptyState } from "@/components/ui/empty-state";
import { ChevronLeft, Landmark, PlusCircle } from "lucide-react";
import "@/components/business/business.css";
import "@/components/ui/ui.css";

export const dynamic = "force-dynamic";
const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jerusalem" });

// B5 — חשבונות ומקורות (22B §59–69): "על איזה מידע המערכת מבססת את התמונה, ומה חסר?"
export default async function SourcesPage() {
  let overview, picture;
  try {
    [overview, picture] = await Promise.all([getSourcesOverview(), getCurrentPicture()]);
  } catch {
    return (
      <div className="ws">
        <h1 className="ws-title">חשבונות ומקורות</h1>
        <div className="error-state" role="alert">לא הצלחנו לטעון את רשימת המקורות. המידע השמור לא נפגע. אפשר לרענן בעוד רגע.</div>
      </div>
    );
  }
  const byKind = new Map(overview.map((o) => [o.kind, o]));
  const groups = [
    { title: "מקורות מידע — חשבונות", items: ROUTE_A_SOURCES.filter((s) => s.accountSide) },
    { title: "מקורות מידע — עסק", items: ROUTE_A_SOURCES.filter((s) => !s.accountSide) },
  ];

  return (
    <div className="ws">
      <div className="ws-header">
        <div>
          <h1 className="ws-title">חשבונות ומקורות</h1>
          <p className="ws-sub">על איזה מידע המערכת מבססת את התמונה, ומה חסר</p>
        </div>
      </div>

      <section aria-labelledby="accounts">
        <h2 id="accounts" className="section-title">חשבונות פיננסיים</h2>
        {picture.currentMoney.accounts.length === 0 ? <EmptyState icon={Landmark} title="עדיין אין חשבונות">חשבון נוצר כשנקלט ועובד קובץ של בנק, כרטיס אשראי או bit.</EmptyState> : (
          <ul className="card account-list" data-testid="financial-accounts">
            {picture.currentMoney.accounts.map((a) => (
              <li key={a.id} className="account-row">
                <Link href={`/transactions?account=${a.id}`} className="account-name file-link">{a.name}</Link>
                <span className="num muted">{a.firstDate ? `כיסוי: ${dayLabel(a.firstDate)} – ${dayLabel(a.lastDate)} · ${a.transactions} תנועות` : "אין תנועות"}</span>
                <span>{a.type === "checking" || a.type === "savings" ? (a.balance ? <><Amount value={a.balance} /> <span className="muted">({dayLabel(a.balanceAsOf)})</span></> : <span className="money--unknown">יתרה לא ידועה</span>) : null}{a.stale ? <> <span className="badge badge--warn">לא עדכני</span></> : null}</span>
              </li>
            ))}
          </ul>
        )}
        {picture.missingSources.length ? <p className="muted-note">מקורות שעדיין לא נקלטו: {picture.missingSources.join(", ")}.</p> : null}
      </section>

      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h2 className="section-title">{g.title}</h2>
          <div className="metrics">
            {g.items.map((s) => {
              const o = byKind.get(s.kind);
              return (
                <Link key={s.kind} href={`/sources/${s.kind}`} className="card metric source-card">
                  <div className="source-card-head">{s.label}<ChevronLeft size={18} aria-hidden="true" /></div>
                  <div className="metric-foot">{s.description}</div>
                  <div className="source-card-row">
                    <span>מקורות <strong className="num">{o?.sourcesCount ?? 0}</strong></span>
                    <span>קבצים <strong className="num">{o?.filesCount ?? 0}</strong></span>
                    <span>קליטה אחרונה {o?.lastAcquiredAt ? <strong className="num">{dateFmt.format(new Date(o.lastAcquiredAt))}</strong> : <strong>עדיין לא נקלט</strong>}</span>
                  </div>
                  <div className="status-quiet"><CoverageIndicator status={o?.coverage ?? "unknown"} /></div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <section aria-label="מקור נוסף">
        <h2 className="section-title">מקורות נוספים</h2>
        <Link href="/sources/other" className="card metric source-card" data-testid="other-source-entry">
          <div className="source-card-head"><span className="source-card-title-icon"><PlusCircle size={18} aria-hidden="true" />מקור נוסף</span><ChevronLeft size={18} aria-hidden="true" /></div>
          <div className="metric-foot">דיווח ידני, מייל או תכתובת, מסמכי מס ורשויות, הלוואות, חובות, ניתוח קודם ומקורות אחרים — קובץ, טקסט מודבק או דיווח.</div>
        </Link>
      </section>
    </div>
  );
}
