import Link from "next/link";
import { Upload, ArrowLeftRight, ListChecks, Gauge, Info } from "lucide-react";
import { getDashboardToday } from "@/features/home/dashboard-today";
import { getCurrentPicture } from "@/features/picture/current-picture";
import { getAttentionItems } from "@/features/picture/attention";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { TrustBar } from "@/components/business/trust-bar";
import { CoverageNote } from "@/components/business/coverage-note";
import { AttentionList } from "@/components/business/attention-list";
import { Amount } from "@/components/ui/amount";
import "@/components/ui/ui.css";
import "@/components/business/business.css";

export const dynamic = "force-dynamic";

const todayFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jerusalem" });
const REASON: Record<string, string> = {
  no_bank_source: "עדיין לא נקלט דף בנק עם יתרה.",
  bank_without_balance: "בחלק מחשבונות הבנק אין יתרה בקובץ שנקלט.",
  mixed_currency: "החשבונות במטבעות שונים ולא סוכמו יחד.",
};

// Home — Route A Control Room (22A §5–7, §69–73). Order per 22A: current picture → coming up → needs attention →
// data status → quick access. Every number comes from the `current_financial_picture` read model (the same one B1 uses)
// and opens its own drill-down. Unknown stays unknown; pending reconciliation is shown, never silently netted.
export default async function HomePage() {
  let picture, trust, attention;
  try {
    [picture, trust, attention] = await Promise.all([getCurrentPicture(), getDashboardToday(), getAttentionItems()]);
  } catch {
    return (
      <div className="ws">
        <h1 className="ws-title">בית</h1>
        <div className="error-state" role="alert">לא הצלחנו לטעון את תמונת המצב כרגע. המידע השמור לא נפגע. אפשר לרענן את העמוד בעוד רגע.</div>
      </div>
    );
  }
  const m = picture.month;
  const detail = (metric: string) => `/snapshot/details?metric=${metric}${m ? `&month=${m}` : ""}`;
  const partialMovements = picture.missingSources.length > 0 || picture.flows.pendingCount > 0;

  return (
    <div className="ws ws--home">
      <div className="ws-header">
        <div>
          <h1 className="ws-title">בית</h1>
          <p className="ws-sub">מרכז השליטה · נכון ל־<span className="num">{todayFmt.format(new Date())}</span></p>
        </div>
        {picture.trust.processingFiles > 0 ? <span className="badge badge--info" data-testid="processing-badge">{picture.trust.processingFiles} קבצים בעיבוד</span> : null}
      </div>

      {!picture.hasAnyData ? (
        <section className="card empty" aria-labelledby="first-use" data-testid="first-use">
          <h2 id="first-use">עדיין אין תמונה פיננסית</h2>
          <p>כדי שהמערכת תדע כמה כסף יש, מה נכנס ומה יצא, צריך לקלוט מקור ראשון. בחרי מקור ב„חשבונות ומקורות” והעלי קובץ CSV, Excel או PDF.</p>
          <Link href="/sources" className="btn-secondary">לחשבונות ומקורות</Link>
        </section>
      ) : null}

      <section aria-labelledby="picture">
        <div className="section-head">
          <h2 id="picture" className="section-title">תמונת מצב{m ? ` · ${monthLabel(m)}` : ""}</h2>
          <Link href={`/snapshot${m ? `?month=${m}` : ""}`} className="section-link">לתמונת המצב המלאה</Link>
        </div>
        <div className="metrics metrics--home">
          <Link href="/snapshot#money" className="card metric metric--primary metric-link" data-testid="metric-current-money">
            <span className="metric-label">כסף בחשבונות הבנק</span>
            <span className="metric-value metric-value--lg"><Amount value={picture.currentMoney.total} /></span>
            <span className="metric-foot">
              {picture.currentMoney.total ? <>לפי היתרה בדף הבנק מ־<span className="num">{dayLabel(picture.currentMoney.asOf)}</span></> : REASON[picture.currentMoney.reason ?? ""] ?? "חסרים נתונים כדי לקבוע."}
              {picture.currentMoney.accounts.some((a) => a.stale) ? <> <span className="badge badge--warn">לא עדכני</span></> : null}
            </span>
          </Link>
          <Link href={detail("money_in")} className="card metric metric-link" data-testid="metric-money-in">
            <span className="metric-label">נכנס החודש</span>
            <span className="metric-value metric-value--md fin-pos"><Amount value={picture.flows.moneyIn} unknownText="אין נתונים" /></span>
            <span className="metric-foot">{picture.hasAnyData ? <CoverageNote coverage={picture.flows.coverage} detail="short" testId="coverage-money-in" /> : "תנועות כסף בפועל מהמקורות שנקלטו"}</span>
          </Link>
          <Link href={detail("money_out")} className="card metric metric-link" data-testid="metric-money-out">
            <span className="metric-label">יצא החודש</span>
            <span className="metric-value metric-value--md fin-neg"><Amount value={picture.flows.moneyOut} unknownText="אין נתונים" /></span>
            <span className="metric-foot">{picture.flows.pendingOut ? <>ועוד <Amount value={picture.flows.pendingOut} /> בבדיקת כפילות · </> : null}{picture.hasAnyData ? <CoverageNote coverage={picture.flows.coverage} detail="short" testId="coverage-money-out" /> : "בלי ספירה כפולה של חיובי אשראי והעברות"}</span>
          </Link>
          <Link href={detail("business")} className="card metric metric-link" data-testid="metric-business">
            <span className="metric-label">עסק — לפי מסמכים</span>
            <span className="metric-value metric-value--md"><Amount value={picture.business.net} unknownText="אין נתונים" /></span>
            <span className="metric-foot">הכנסות <Amount value={picture.business.income} unknownText="—" /> · הוצאות <Amount value={picture.business.expenses} unknownText="—" />{picture.hasAnyData ? <><br /><CoverageNote coverage={picture.business.coverage} detail="short" testId="coverage-business" /></> : null}</span>
          </Link>
        </div>
        {picture.hasAnyData && partialMovements ? (
          <div className="coverage-summary" data-testid="partial-note">
            <Info size={16} aria-hidden="true" />
            <div>
              <p><strong>על מה המספרים מבוססים.</strong> תנועות כסף: <CoverageNote coverage={picture.flows.coverage} /></p>
              <p>עסק לפי מסמכים: <CoverageNote coverage={picture.business.coverage} /></p>
              {picture.flows.pendingCount ? <p>{picture.flows.pendingCount} תנועות ממתינות להחלטתך על התאמה, ולכן אינן נספרות עדיין.</p> : null}
            </div>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="upcoming">
        <h2 id="upcoming" className="section-title">קרוב בזמן</h2>
        {picture.upcoming.cardCharges ? (
          <Link href={detail("upcoming_card_charges")} className="card upcoming-row metric-link" data-testid="upcoming-card">
            <span>חיובי כרטיס אשראי שטרם נגבו</span>
            <span className="num">החיוב הקרוב: {dayLabel(picture.upcoming.nextChargeDate)}</span>
            <Amount value={picture.upcoming.cardCharges} />
          </Link>
        ) : (
          <p className="card muted-note" data-testid="upcoming-empty">אין עדיין חיובים או כספים צפויים. הם יופיעו אחרי קליטת מקור עם מועדי חיוב, הלוואות או הכנסות צפויות. <Link href="/sources" className="file-link">לחשבונות ומקורות</Link></p>
        )}
      </section>

      <section aria-labelledby="attention">
        <h2 id="attention" className="section-title">דורש תשומת לב</h2>
        {attention.length === 0 ? (
          <p className="card muted-note">{picture.hasAnyData ? "אין כרגע פריטים שדורשים פעולה." : "עדיין לא נקלט אף מקור."}</p>
        ) : (
          <AttentionList items={attention} max={6} testId="attention-list" />
        )}
      </section>

      <section aria-labelledby="data-status">
        <h2 id="data-status" className="section-title">מצב המידע</h2>
        <TrustBar coverage={trust.coverage} lastUpdatedAt={trust.lastSourceAt} verification={trust.verification} qa={trust.lastQa} openContradictions={trust.openContradictions} openReviewItems={trust.openReviewItems} />
        <ul className="card source-status" data-testid="source-status">
          {picture.sources.map((s) => (
            <li key={s.kind} className="source-status-row">
              <Link href={`/sources/${s.kind}`} className="source-status-name">{s.label}</Link>
              <span className="num source-status-period">{s.periodStart ? `${dayLabel(s.periodStart)} – ${dayLabel(s.periodEnd)}` : s.files ? `${s.files} קבצים` : ""}</span>
              {s.files === 0 ? <span className="badge badge--neutral">לא נקלט</span>
                : s.failed ? <span className="badge badge--err">עיבוד נכשל</span>
                : s.needsReview ? <span className="badge badge--warn">דורש בדיקה</span>
                : s.processing ? <span className="badge badge--info">בעיבוד</span>
                : <span className="badge badge--ok">נקלט</span>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="quick">
        <h2 id="quick" className="section-title">גישה מהירה</h2>
        <nav className="quick-links" aria-labelledby="quick">
          <Link href="/sources" className="btn-secondary"><Upload size={18} aria-hidden="true" />העלאת מסמך</Link>
          <Link href="/transactions" className="btn-secondary"><ArrowLeftRight size={18} aria-hidden="true" />תנועות</Link>
          <Link href="/review" className="btn-secondary"><ListChecks size={18} aria-hidden="true" />תור בדיקה</Link>
          <Link href="/snapshot" className="btn-secondary"><Gauge size={18} aria-hidden="true" />תמונת מצב</Link>
        </nav>
      </section>
    </div>
  );
}
