import Link from "next/link";
import { ROUTE_A_SOURCES } from "@/features/sources/route-a-sources";
import { getSourcesOverview } from "@/features/sources/sources-overview";
import { CoverageIndicator } from "@/components/ui/coverage-indicator";
import "@/components/ui/ui.css";

export const dynamic = "force-dynamic";
const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jerusalem" });

// B5 — חשבונות ומקורות (22B §59–69): "על איזה מידע המערכת מבססת את התמונה, ומה חסר?"
export default async function SourcesPage() {
  let overview;
  try {
    overview = await getSourcesOverview();
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
    { title: "חשבונות פיננסיים", items: ROUTE_A_SOURCES.filter((s) => s.accountSide) },
    { title: "מקורות מידע עסקיים", items: ROUTE_A_SOURCES.filter((s) => !s.accountSide) },
  ];

  return (
    <div className="ws">
      <div className="ws-header">
        <div>
          <h1 className="ws-title">חשבונות ומקורות</h1>
          <p className="ws-sub">על איזה מידע המערכת מבססת את התמונה, ומה חסר</p>
        </div>
      </div>

      <div className="trust-bar" aria-label="סרגל אמינות">
        <span className="trust-item"><CoverageIndicator status="unknown" /></span>
        <span className="trust-item">מפת הכיסוי תתמלא כשמקורות ייקלטו ויעובדו</span>
      </div>

      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h2 className="section-title">{g.title}</h2>
          <div className="metrics">
            {g.items.map((s) => {
              const o = byKind.get(s.kind);
              return (
                <Link key={s.kind} href={`/sources/${s.kind}`} className="card metric source-card">
                  <div className="metric-label">{s.label}</div>
                  <div className="metric-foot">{s.description}</div>
                  <div className="source-card-row">
                    <span>מקורות: <span className="num">{o?.sourcesCount ?? 0}</span></span>
                    <span>קבצים: <span className="num">{o?.filesCount ?? 0}</span></span>
                  </div>
                  <div className="metric-foot">
                    קליטה אחרונה: {o?.lastAcquiredAt ? <span className="num">{dateFmt.format(new Date(o.lastAcquiredAt))}</span> : "עדיין לא נקלט"}
                  </div>
                  <CoverageIndicator status={o?.coverage ?? "unknown"} />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
