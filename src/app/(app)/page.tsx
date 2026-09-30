import Link from "next/link";
import { getDashboardToday } from "@/features/home/dashboard-today";
import { getSourcesOverview, type SourceSummary } from "@/features/sources/sources-overview";
import { ROUTE_A_SOURCES } from "@/features/sources/route-a-sources";
import { mergeSummaries, routeAStep, type RouteAStep } from "@/features/sources/pipeline-summary";
import { buildAttentionItems } from "@/features/home/attention-items";
import { TrustBar } from "@/components/business/trust-bar";
import { SourceCard } from "@/components/business/source-card";
import { CoverageIndicator } from "@/components/ui/coverage-indicator";
import { MoneyAmount } from "@/components/ui/money-amount";
import "@/components/ui/ui.css";
import "@/components/business/business.css";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jerusalem" });
const STEP_LABEL: Record<RouteAStep, { text: string; tone: string }> = {
  not_uploaded: { text: "לא הועלה", tone: "neutral" },
  processing: { text: "בעיבוד", tone: "info" },
  attention: { text: "דורש טיפול", tone: "warn" },
  processed: { text: "עובד", tone: "ok" },
};

// Home — Route A Control Center (22A §5–7, §69–73; 21C §68 Dashboard pattern; ADR-007).
// Order: Trust Bar → current picture → Route A sources (KPI strip) → attention → data status → quick access.
// Everything shown comes from Read Models; unknown money stays unknown (never 0).
export default async function HomePage() {
  let data;
  let overview: SourceSummary[];
  try {
    [data, overview] = await Promise.all([getDashboardToday(), getSourcesOverview()]);
  } catch {
    return (
      <div className="ws">
        <h1 className="ws-title">בית</h1>
        <div className="error-state" role="alert">
          לא הצלחנו לטעון את תמונת המצב כרגע. המידע השמור לא נפגע. אפשר לרענן את העמוד בעוד רגע.
        </div>
      </div>
    );
  }

  const byKind = new Map(overview.map((o) => [o.kind, o]));
  const labelOf = (kind: string) => ROUTE_A_SOURCES.find((s) => s.kind === kind)?.label ?? kind;
  const bank = byKind.get("bank")!;
  const card = byKind.get("credit-card")!;
  const bit = byKind.get("bit")!;
  const giIncome = byKind.get("green-invoice-income")!;
  const giExpenses = byKind.get("green-invoice-expenses")!;
  const latest = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : a ?? b);

  const attention = buildAttentionItems({
    sources: overview.map((o) => ({ kind: o.kind, label: labelOf(o.kind), files: o.files })),
    openReviewItems: data.openReviewItems,
    openContradictions: data.openContradictions,
  });
  const steps = overview.map((o) => ({ ...o, step: routeAStep(o.files) }));
  const received = steps.filter((s) => s.step !== "not_uploaded").length;
  const firstUse = data.sourcesCount === 0;

  return (
    <div className="ws">
      <div className="ws-header">
        <div>
          <h1 className="ws-title">בית</h1>
          <p className="ws-sub">מרכז השליטה של מסלול A · נכון ל־<span className="num">{dateFmt.format(new Date())}</span></p>
        </div>
      </div>

      <TrustBar
        coverage={data.coverage}
        lastUpdatedAt={data.lastSourceAt}
        verification={data.verification}
        qa={data.lastQa}
        openContradictions={data.openContradictions}
        openReviewItems={data.openReviewItems}
      />

      {firstUse ? (
        <section className="card empty" aria-labelledby="first-use">
          <h2 id="first-use">עדיין אין תמונה פיננסית</h2>
          <p>
            כדי שהמערכת תדע כמה כסף יש, מה צפוי להיכנס ומה צפוי לצאת, צריך לקלוט מקור ראשון. כל מקור נקלט בהקשר שלו —
            בחרי את המקור בכרטיסים שלמטה.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="picture">
        <h2 id="picture" className="section-title">תמונת מצב</h2>
        <div className="metrics">
          <div className="card metric">
            <div className="metric-label">כסף זמין עכשיו</div>
            <div className="metric-value"><MoneyAmount amountMinor={data.availableMoneyMinor} currency={data.availableMoneyCurrency} /></div>
            <div className="metric-foot">עדיין אין חישוב מאומת. הסכום יופיע כשיהיו מקורות מאומתים לתקופה.</div>
          </div>
        </div>
      </section>

      <section aria-labelledby="route-a-sources">
        <h2 id="route-a-sources" className="section-title">מקורות מסלול A</h2>
        <div className="kpi-strip">
          <SourceCard testId="kpi-bank" title="בנקים" files={bank.files} lastAcquiredAt={bank.lastAcquiredAt} coverage={bank.coverage}
            uploads={[{ href: "/sources/bank", label: "העלאת דוח בנק" }]} />
          <SourceCard testId="kpi-credit-card" title="כרטיסי אשראי" files={card.files} lastAcquiredAt={card.lastAcquiredAt} coverage={card.coverage}
            uploads={[{ href: "/sources/credit-card", label: "העלאת קובץ אשראי" }]} />
          <SourceCard testId="kpi-bit" title="bit" files={bit.files} lastAcquiredAt={bit.lastAcquiredAt} coverage={bit.coverage}
            uploads={[{ href: "/sources/bit", label: "העלאת ייצוא bit" }]} />
          <SourceCard testId="kpi-green-invoice" title="חשבונית ירוקה" files={mergeSummaries([giIncome.files, giExpenses.files])}
            lastAcquiredAt={latest(giIncome.lastAcquiredAt, giExpenses.lastAcquiredAt)} coverage={giIncome.coverage}
            uploads={[{ href: "/sources/green-invoice-income", label: "הכנסות" }, { href: "/sources/green-invoice-expenses", label: "הוצאות" }]} />
          <SourceCard testId="kpi-documents" title="מסמכים" files={data.documents.files} lastAcquiredAt={null} coverage={null}
            uploads={[]} note="מסמכים נוצרים מעיבוד הקבצים שנקלטו. מרחב המסמכים עדיין בפיתוח." />
        </div>
      </section>

      <section aria-labelledby="attention">
        <h2 id="attention" className="section-title">דורש תשומת לב</h2>
        {attention.length === 0 ? (
          <p className="card muted-note">אין כרגע פריטים שדורשים פעולה.</p>
        ) : (
          <ul className="card attention-list" data-testid="attention-list">
            {attention.map((a) => (
              <li key={a.id} className={`attention-item tone-${a.tone}`}>
                {a.href ? <Link href={a.href}>{a.text}</Link> : <span>{a.text}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="progress">
        <h2 id="progress" className="section-title">התקדמות מסלול A</h2>
        <div className="card progress-card">
          <p className="progress-summary">
            נקלטו <span className="num">{received}</span> מתוך <span className="num">{steps.length}</span> מקורות
          </p>
          <ul className="progress-list">
            {steps.map((s) => (
              <li key={s.kind} className="progress-row">
                <Link href={`/sources/${s.kind}`} className="progress-name">{labelOf(s.kind)}</Link>
                <span className={`badge badge--${STEP_LABEL[s.step].tone}`}>{STEP_LABEL[s.step].text}</span>
                <CoverageIndicator status={s.coverage} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="quick">
        <h2 id="quick" className="section-title">גישה מהירה</h2>
        <nav className="quick-links" aria-labelledby="quick">
          <Link href="/sources" className="btn-secondary">חשבונות ומקורות</Link>
          {ROUTE_A_SOURCES.map((s) => (
            <Link key={s.kind} href={`/sources/${s.kind}`} className="btn-secondary">{s.label}</Link>
          ))}
        </nav>
      </section>
    </div>
  );
}
