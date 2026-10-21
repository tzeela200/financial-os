import Link from "next/link";
import { Info, CreditCard, Landmark, CalendarClock, CircleCheck, Inbox, ChevronLeft, Wallet, History } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentPicture } from "@/features/picture/current-picture";
import { getAttentionItems } from "@/features/picture/attention";
import { getLatestChange } from "@/features/home/home-extras";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { TrustBar, trustFromPicture } from "@/components/business/trust-bar";
import { AttentionList } from "@/components/business/attention-list";
import { QuickActions } from "@/components/business/quick-actions";
import { Amount } from "@/components/ui/amount";
import "@/components/ui/ui.css";
import "@/components/business/business.css";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = {
  no_bank_source: "עדיין לא נקלט דף בנק עם יתרה.",
  bank_without_balance: "בחלק מחשבונות הבנק אין יתרה בקובץ שנקלט.",
  mixed_currency: "החשבונות במטבעות שונים ולא סוכמו יחד.",
};
const STATE_TEXT: Record<string, string> = { verified: "נקרא בלי בעיה", needs_review: "נקרא, ויש בו משהו לבדיקה", failed: "העיבוד נכשל", duplicate: "כבר הועלה בעבר" };

// Home — the control room (22A §5–7, §69–74; 19D §3; 23 §78). It answers, in this order: where do I stand (money
// now, with its date and coverage) → what changed → what is coming → what needs attention → can I trust the picture →
// quick access (every planned module visible and marked). Analysis — the month's money in/out, trends, expenses by
// type, recent movements — lives in the Snapshot (22A §11, §74 "no double dashboard"). Visual language: Calm Finance.
export default async function HomePage() {
  let picture, attention, change;
  try {
    picture = await getCurrentPicture();
    [attention, change] = await Promise.all([getAttentionItems(), getLatestChange()]);
  } catch {
    return (
      <div className="ws">
        <h1 className="ws-title">בית</h1>
        <div className="error-state" role="alert">לא הצלחנו לטעון את תמונת המצב כרגע. המידע השמור לא נפגע. אפשר לרענן את העמוד בעוד רגע.</div>
      </div>
    );
  }
  const m = picture.month;
  const cov = picture.flows.coverage;

  return (
    <div className="ws ws--home">
      <header className="ws-header">
        <div>
          <h1 className="ws-title">בית</h1>
          <p className="ws-sub">איפה את עומדת, מה השתנה ומה דורש תשומת לב{cov.knownUntil ? <> · נתונים עד <span className="num">{dayLabel(cov.knownUntil)}</span></> : null}</p>
        </div>
        {picture.trust.processingFiles > 0 ? <span className="badge badge--info" data-testid="processing-badge">{picture.trust.processingFiles} קבצים בעיבוד</span> : null}
      </header>

      {!picture.hasAnyData ? (
        <section className="card empty" aria-labelledby="first-use" data-testid="first-use">
          <h2 id="first-use">עדיין אין תמונה פיננסית</h2>
          <p>כדי שהמערכת תדע כמה כסף יש, מה נכנס ומה יצא, צריך לקלוט מקור ראשון. בחרי מקור ב„חשבונות ומקורות” והעלי קובץ CSV, Excel או PDF.</p>
          <Link href="/sources" className="btn btn-primary">לחשבונות ומקורות</Link>
        </section>
      ) : null}

      <div className="dash-grid">
        <div className="dash-main">
          {/* ---- 1. where do I stand — money now (22A §6.1: key numbers only) */}
          <section aria-labelledby="picture" className="home-block">
            <h2 id="picture" className="section-title">איפה את עומדת</h2>
            <Link href="/snapshot#money" className="card kpi kpi--primary metric-link" data-testid="metric-current-money">
              <span className="kpi-icon kpi-icon--brand" aria-hidden="true"><Landmark size={20} /></span>
              <span className="kpi-label">כסף בחשבונות הבנק</span>
              <span className="kpi-value"><Amount value={picture.currentMoney.total} /></span>
              <span className="kpi-foot">
                {picture.currentMoney.total ? <>לפי דף הבנק מ־<span className="num">{dayLabel(picture.currentMoney.asOf)}</span> · מסגרת אשראי אינה נכללת</> : REASON[picture.currentMoney.reason ?? ""] ?? "חסרים נתונים כדי לקבוע."}
                {picture.currentMoney.accounts.some((a) => a.stale) ? " · כדאי להעלות דף עדכני" : null}
              </span>
            </Link>
            {picture.hasAnyData && cov.partial ? (
              <p className="status-line" data-testid="picture-status">
                <Info size={16} aria-hidden="true" />
                <span>התמונה עדיין חלקית{cov.missing.length ? <> — חסר: {cov.missing.join(", ")}</> : null}</span>
                <Link href="/sources" className="section-link">להשלמת מקורות</Link>
              </p>
            ) : null}
            {picture.flows.pendingCount ? (
              <p className="inline-note" data-testid="partial-note"><Info size={16} aria-hidden="true" />{picture.flows.pendingCount} תנועות ממתינות להחלטתך על התאמה, ולכן אינן נספרות עדיין.</p>
            ) : null}
            {picture.hasAnyData ? (
              <Link href={`/snapshot${m ? `?month=${m}` : ""}`} className="home-more" data-testid="to-snapshot">
                נכנס, יצא ומגמות{m ? ` · ${monthLabel(m)}` : ""} — בתמונת המצב<ChevronLeft size={16} aria-hidden="true" />
              </Link>
            ) : null}
          </section>

          {/* ---- what changed (19D §3) */}
          {change ? (
            <section aria-labelledby="changed" className="card dash-card" data-testid="what-changed">
              <h2 id="changed" className="card-title">מה השתנה</h2>
              <p className="changed-row">
                <History size={18} aria-hidden="true" />
                <span>הקובץ האחרון: <bdi>{change.file}</bdi> · הועלה ב־<span className="num">{dayLabel(change.uploadedAt.slice(0, 10))}</span>
                  {change.promoted !== null ? <> · נקלטו <span className="num">{change.promoted}</span> רשומות</> : null}
                  {STATE_TEXT[change.state] ? <> · {STATE_TEXT[change.state]}</> : null}</span>
              </p>
            </section>
          ) : null}

          {/* ---- 2. what is coming (22A §6.2) */}
          <section aria-labelledby="upcoming" className="home-block">
            <h2 id="upcoming" className="section-title">קרוב בזמן</h2>
            {picture.upcoming.cardCharges ? (
              <ul className="card compact-list">
                <li>
                  <Link href={`/snapshot/details?metric=upcoming_card_charges${m ? `&month=${m}` : ""}`} className="compact-row metric-link" data-testid="upcoming-card">
                    <span className="compact-icon" aria-hidden="true"><CreditCard size={18} /></span>
                    <span className="compact-text">
                      <span className="compact-title">חיובי כרטיס שטרם נגבו</span>
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

          {/* ---- 3. what needs attention (22A §6.3, §72) */}
          <section aria-labelledby="attention" className="home-block">
            <div className="section-head">
              <h2 id="attention" className="section-title">דורש תשומת לב</h2>
              {attention.length ? <Link href="/review" className="section-link">לתור הבדיקה</Link> : null}
            </div>
            {attention.length === 0 ? (
              picture.hasAnyData
                ? <EmptyState icon={CircleCheck} tone="calm" size="compact" title="אין כרגע פריטים לטיפול" />
                : <EmptyState icon={Inbox} size="compact" title="פריטים לטיפול יופיעו אחרי הקליטה הראשונה" />
            ) : (
              <AttentionList items={attention} max={5} testId="attention-list" />
            )}
          </section>
        </div>

        <div className="dash-side">
          {/* ---- 4. can I trust the picture (22A §6.4; 19C §30) */}
          <section aria-labelledby="data-status" className="card trust-panel">
            <div className="dash-card-head">
              <h2 id="data-status" className="card-title">על מה התמונה מבוססת</h2>
              <Link href="/sources" className="section-link">לכל המקורות</Link>
            </div>
            <TrustBar {...trustFromPicture(picture)} />
            <ul className="source-status" data-testid="source-status">
              {picture.sources.map((s) => (
                <li key={s.kind} className="source-status-row">
                  <Link href={`/sources/${s.kind}`} className="source-status-name">{s.kind === "credit-card" ? <CreditCard size={18} aria-hidden="true" /> : s.kind === "bank" ? <Landmark size={18} aria-hidden="true" /> : <Wallet size={18} aria-hidden="true" />}{s.label}</Link>
                  <span className="num source-status-period">{s.periodStart ? `${dayLabel(s.periodStart)} – ${dayLabel(s.periodEnd)}` : s.files ? `${s.files} קבצים` : ""}</span>
                  {s.files === 0 ? <span className="badge badge--neutral">עוד לא הועלה</span>
                    : s.failed ? <span className="badge badge--err">עיבוד נכשל</span>
                    : s.needsReview ? <span className="badge badge--warn">דורש בדיקה</span>
                    : s.processing ? <span className="badge badge--info">בעיבוד</span>
                    : <span className="badge badge--ok">נקלט</span>}
                </li>
              ))}
            </ul>
          </section>

          {/* ---- 5. quick access (22A §6.5, §73; 19C §32) — planned modules visible and marked */}
          <section aria-labelledby="actions" className="card dash-card">
            <h2 id="actions" className="card-title">פעולות</h2>
            <QuickActions />
          </section>
        </div>
      </div>
    </div>
  );
}
