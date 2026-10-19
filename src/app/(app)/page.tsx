import Link from "next/link";
import { Info, CreditCard, Landmark, CalendarClock, CircleCheck, Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentPicture } from "@/features/picture/current-picture";
import { getAttentionItems } from "@/features/picture/attention";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { TrustBar, trustFromPicture } from "@/components/business/trust-bar";
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

// Home — Route A Control Room (22A §5–7). Order: current picture → coming up → needs attention → data status.
// Every number comes from the `current_financial_picture` read model (the same one B1 uses) and opens its own
// drill-down. Unknown stays unknown; pending reconciliation is shown, never silently netted.
// Design review 20.10.2026: what is missing is said once (Trust Bar), sections with nothing yet take one line,
// no duplicate entry points (upload lives in the header; navigation in the sidebar), no business card without data.
export default async function HomePage() {
  let picture, attention;
  try {
    [picture, attention] = await Promise.all([getCurrentPicture(), getAttentionItems()]);
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
  const hasBusiness = !!(picture.business.income || picture.business.expenses);
  return (
    <div className="ws ws--home">
      <div className="ws-header">
        <div>
          <p className="ws-eyebrow">מרכז השליטה</p>
          <h1 className="ws-title">בית</h1>
          <p className="ws-sub">תמונת הכסף שלך לפי המקורות שנקלטו · נכון ל־<span className="num">{todayFmt.format(new Date())}</span></p>
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
        <div className={`metrics metrics--home${hasBusiness ? "" : " metrics--three"}`}>
          <Link href="/snapshot#money" className="card metric metric--primary metric-link" data-testid="metric-current-money">
            <span className="metric-label"><Landmark size={18} aria-hidden="true" />כסף בחשבונות הבנק</span>
            <span className="metric-value metric-value--lg"><Amount value={picture.currentMoney.total} /></span>
            <span className="metric-foot">
              {picture.currentMoney.total ? <>לפי היתרה בדף הבנק מ־<span className="num">{dayLabel(picture.currentMoney.asOf)}</span></> : REASON[picture.currentMoney.reason ?? ""] ?? "חסרים נתונים כדי לקבוע."}
              {picture.currentMoney.accounts.some((a) => a.stale) ? <> <span className="badge badge--warn">לא עדכני</span></> : null}
            </span>
          </Link>
          <Link href={detail("money_in")} className="card metric metric-link" data-testid="metric-money-in">
            <span className="metric-label">נכנס</span>
            <span className="metric-value metric-value--md fin-pos"><Amount value={picture.flows.moneyIn} unknownText="אין נתונים" /></span>
            <span className="metric-foot">{picture.hasAnyData ? <CoverageNote coverage={picture.flows.coverage} detail="short" testId="coverage-money-in" /> : "תנועות כסף בפועל מהמקורות שנקלטו"}</span>
          </Link>
          <Link href={detail("money_out")} className="card metric metric-link" data-testid="metric-money-out">
            <span className="metric-label">יצא</span>
            <span className="metric-value metric-value--md fin-neg"><Amount value={picture.flows.moneyOut} unknownText="אין נתונים" /></span>
            <span className="metric-foot">{picture.flows.pendingOut ? <>ועוד <Amount value={picture.flows.pendingOut} /> ממתין להחלטה · </> : null}{picture.hasAnyData ? <CoverageNote coverage={picture.flows.coverage} detail="short" testId="coverage-money-out" /> : "בלי ספירה כפולה של חיובי אשראי והעברות"}</span>
          </Link>
          {hasBusiness ? (
            <Link href={detail("business")} className="card metric metric-link" data-testid="metric-business">
              <span className="metric-label">עסק לפי חשבוניות</span>
              <span className="metric-value metric-value--md"><Amount value={picture.business.net} unknownText="לא ניתן לחשב" /></span>
              <span className="metric-foot">הכנסות <Amount value={picture.business.income} unknownText="—" /> · הוצאות <Amount value={picture.business.expenses} unknownText="—" /><br /><CoverageNote coverage={picture.business.coverage} detail="short" testId="coverage-business" /></span>
            </Link>
          ) : null}
        </div>
        {picture.flows.pendingCount ? (
          <p className="inline-note" data-testid="partial-note"><Info size={16} aria-hidden="true" />{picture.flows.pendingCount} תנועות ממתינות להחלטתך על התאמה, ולכן אינן נספרות עדיין.</p>
        ) : null}
      </section>

      <div className="home-grid">
        <div className="home-main">
          <section aria-labelledby="upcoming">
            <h2 id="upcoming" className="section-title">קרוב בזמן</h2>
            {picture.upcoming.cardCharges ? (
              <ul className="card compact-list">
                <li>
                  <Link href={detail("upcoming_card_charges")} className="compact-row metric-link" data-testid="upcoming-card">
                    <span className="compact-icon" aria-hidden="true"><CreditCard size={18} /></span>
                    <span className="compact-text">
                      <span className="compact-title">חיובי כרטיס אשראי שטרם נגבו</span>
                      <span className="compact-meta num">החיוב הקרוב: {dayLabel(picture.upcoming.nextChargeDate)}</span>
                    </span>
                    <span className="compact-amount"><Amount value={picture.upcoming.cardCharges} /></span>
                  </Link>
                </li>
              </ul>
            ) : (
              <EmptyState icon={CalendarClock} size="compact" title="אין חיובים או כספים צפויים שידועים כרגע" testId="upcoming-empty" />
            )}
          </section>

          <section aria-labelledby="attention">
            <div className="section-head">
              <h2 id="attention" className="section-title">דורש תשומת לב</h2>
              {attention.length ? <Link href="/review" className="section-link">לתור הבדיקה</Link> : null}
            </div>
            {attention.length === 0 ? (
              picture.hasAnyData
                ? <EmptyState icon={CircleCheck} tone="calm" size="compact" title="אין כרגע פריטים לטיפול" />
                : <EmptyState icon={Inbox} size="compact" title="פריטים לטיפול יופיעו אחרי הקליטה הראשונה" />
            ) : (
              <AttentionList items={attention} max={6} testId="attention-list" />
            )}
          </section>
        </div>

        <div className="home-side">
          <section aria-labelledby="data-status" className="card trust-panel">
            <h2 id="data-status" className="section-title">מצב המידע</h2>
            <TrustBar {...trustFromPicture(picture)} />
            <h3 className="trust-panel-sub">מקורות</h3>
            <ul className="source-status" data-testid="source-status">
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

        </div>
      </div>
    </div>
  );
}
