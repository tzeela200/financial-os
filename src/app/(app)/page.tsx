import Link from "next/link";
import { Info, CreditCard, Landmark, CalendarClock, CircleCheck, Inbox, ArrowDownLeft, ArrowUpRight, Scale, ChevronLeft, PieChart, ReceiptText, Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentPicture } from "@/features/picture/current-picture";
import { getAttentionItems } from "@/features/picture/attention";
import { getRecentTransactions, getExpenseTypes } from "@/features/home/home-extras";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { TrustBar, trustFromPicture } from "@/components/business/trust-bar";
import { CoverageNote } from "@/components/business/coverage-note";
import { AttentionList } from "@/components/business/attention-list";
import { MonthlyFlowChart } from "@/components/business/monthly-flow-chart";
import { ExpenseTypeChart } from "@/components/business/expense-type-chart";
import { Amount } from "@/components/ui/amount";
import { formatMoney } from "@/components/ui/money-amount";
import "@/components/ui/ui.css";
import "@/components/business/business.css";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = {
  no_bank_source: "עדיין לא נקלט דף בנק עם יתרה.",
  bank_without_balance: "בחלק מחשבונות הבנק אין יתרה בקובץ שנקלט.",
  mixed_currency: "החשבונות במטבעות שונים ולא סוכמו יחד.",
};
const shortMonth = new Intl.DateTimeFormat("he-IL", { month: "short", timeZone: "UTC" });
const major = (m: { minor: string } | null) => (m ? Number(BigInt(m.minor)) / 100 : null);

// Home — Route A dashboard (22A §5–7; Calm Finance ADR-011). Order: the month at a glance (KPIs) → the month in
// context (chart + breakdown) → accounts & sources · expenses by type → recent movements; beside it: data status,
// attention and what is coming. Every number comes from a read model and opens its drill-down; unknown stays unknown,
// pending reconciliation is shown and never silently netted, an expense without a type stays "לא מסווג".
export default async function HomePage() {
  let picture, attention, recent, types;
  try {
    picture = await getCurrentPicture();
    [attention, recent, types] = await Promise.all([getAttentionItems(), getRecentTransactions(5), getExpenseTypes(picture.month)]);
  } catch {
    return (
      <div className="ws">
        <h1 className="ws-title">בית</h1>
        <div className="error-state" role="alert">לא הצלחנו לטעון את תמונת המצב כרגע. המידע השמור לא נפגע. אפשר לרענן את העמוד בעוד רגע.</div>
      </div>
    );
  }
  const m = picture.month;
  const monthName = m ? monthLabel(m) : "—";
  const detail = (metric: string) => `/snapshot/details?metric=${metric}${m ? `&month=${m}` : ""}`;
  const currency = picture.flows.moneyIn?.currency ?? picture.flows.moneyOut?.currency ?? "ILS";
  const points = picture.series.map((s) => ({ month: s.month, label: shortMonth.format(new Date(`${s.month}-01T12:00:00Z`)), moneyIn: major(s.moneyIn), moneyOut: major(s.moneyOut) }));
  // shares are computed within one currency only (foreign-currency documents are never added to shekels)
  const mainCur = types.slices.some((s) => s.amount.currency === "ILS") ? "ILS" : types.slices[0]?.amount.currency;
  const slices = types.slices.filter((s) => s.amount.currency === mainCur).map((s) => ({ label: s.label, amount: Number(BigInt(s.amount.minor)) / 100, amountText: formatMoney(BigInt(s.amount.minor), s.amount.currency) }));
  const otherCur = [...types.slices.filter((s) => s.amount.currency !== mainCur).reduce((m, s) => m.set(s.amount.currency, (m.get(s.amount.currency) ?? 0n) + BigInt(s.amount.minor)), new Map<string, bigint>())]
    .map(([c, v]) => formatMoney(v, c));
  const knownUntil = picture.flows.coverage.knownUntil;

  return (
    <div className="ws ws--home">
      <header className="ws-header">
        <div>
          <h1 className="ws-title">בית</h1>
          <p className="ws-sub">תמונת הכסף שלך לפי המקורות שנקלטו{knownUntil ? <> · נתונים עד <span className="num">{dayLabel(knownUntil)}</span></> : null}</p>
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

      {/* ---- the month at a glance */}
      <section aria-labelledby="picture">
        <h2 id="picture" className="visually-hidden">תמונת מצב · {monthName}</h2>
        <div className="kpis">
          <Link href="/snapshot#money" className="card kpi kpi--primary metric-link" data-testid="metric-current-money">
            <span className="kpi-icon kpi-icon--brand" aria-hidden="true"><Landmark size={20} /></span>
            <span className="kpi-label">כסף בחשבונות הבנק</span>
            <span className="kpi-value"><Amount value={picture.currentMoney.total} /></span>
            <span className="kpi-foot">
              {picture.currentMoney.total ? <>לפי דף הבנק מ־<span className="num">{dayLabel(picture.currentMoney.asOf)}</span></> : REASON[picture.currentMoney.reason ?? ""] ?? "חסרים נתונים כדי לקבוע."}
              {picture.currentMoney.accounts.some((a) => a.stale) ? <> <span className="badge badge--warn">לא עדכני</span></> : null}
            </span>
          </Link>
          <Link href={detail("money_in")} className="card kpi metric-link" data-testid="metric-money-in">
            <span className="kpi-icon kpi-icon--pos" aria-hidden="true"><ArrowDownLeft size={20} /></span>
            <span className="kpi-label">נכנס · {monthName}</span>
            <span className="kpi-value fin-pos"><Amount value={picture.flows.moneyIn} unknownText="אין נתונים" /></span>
            <span className="kpi-foot">{picture.hasAnyData ? <CoverageNote coverage={picture.flows.coverage} detail="short" testId="coverage-money-in" /> : "תנועות כסף בפועל"}</span>
          </Link>
          <Link href={detail("money_out")} className="card kpi metric-link" data-testid="metric-money-out">
            <span className="kpi-icon kpi-icon--neg" aria-hidden="true"><ArrowUpRight size={20} /></span>
            <span className="kpi-label">יצא · {monthName}</span>
            <span className="kpi-value fin-neg"><Amount value={picture.flows.moneyOut} unknownText="אין נתונים" /></span>
            <span className="kpi-foot">{picture.flows.pendingOut ? <>ועוד <Amount value={picture.flows.pendingOut} /> ממתין להחלטה · </> : null}{picture.hasAnyData ? <CoverageNote coverage={picture.flows.coverage} detail="short" testId="coverage-money-out" /> : "בלי ספירה כפולה"}</span>
          </Link>
          <div className="card kpi" data-testid="metric-net">
            <span className="kpi-icon" aria-hidden="true"><Scale size={20} /></span>
            <span className="kpi-label">נטו · {monthName}</span>
            <span className="kpi-value"><Amount value={picture.flows.net} unknownText="לא ניתן לחשב" /></span>
            <span className="kpi-foot">{picture.flows.pendingCount ? "חלקי · יש תנועות שממתינות להחלטתך" : picture.flows.coverage.partial ? "חלקי · לא כל המקורות מכסים את החודש" : "נכנס פחות יצא"}</span>
          </div>
        </div>
        {picture.flows.pendingCount ? (
          <p className="inline-note" data-testid="partial-note"><Info size={16} aria-hidden="true" />{picture.flows.pendingCount} תנועות ממתינות להחלטתך על התאמה, ולכן אינן נספרות עדיין.</p>
        ) : null}
      </section>

      <div className="dash-grid">
        <div className="dash-main">
          {/* ---- the month in context */}
          <section aria-labelledby="month" className="card dash-card">
            <div className="dash-card-head">
              <h2 id="month" className="card-title">פירוט · {monthName}</h2>
              <Link href={`/snapshot${m ? `?month=${m}` : ""}`} className="section-link">לתמונת המצב המלאה</Link>
            </div>
            {points.length ? (
              <div className="month-body">
                <div className="month-breakdown">
                  <dl>
                    <div className="month-row"><dt>נכנס</dt><dd className="fin-pos"><Amount value={picture.flows.moneyIn} unknownText="אין נתונים" /></dd></div>
                    <div className="month-row"><dt>יצא</dt><dd className="fin-neg"><Amount value={picture.flows.moneyOut} unknownText="אין נתונים" /></dd></div>
                    <div className="month-row month-row--total"><dt>נטו</dt><dd><Amount value={picture.flows.net} unknownText="לא ניתן לחשב" /></dd></div>
                  </dl>
                  <Link href={`/transactions${m ? `?month=${m}` : ""}`} className="btn btn-secondary btn-sm">לכל התנועות בחודש</Link>
                </div>
                <MonthlyFlowChart points={points} currency={currency} />
              </div>
            ) : (
              <EmptyState icon={ReceiptText} size="compact" title="הגרף יופיע אחרי קליטת דפי בנק או אשראי" />
            )}
          </section>

          <div className="dash-pair">
            {/* ---- accounts & sources */}
            <section aria-labelledby="data-sources" className="card dash-card">
              <div className="dash-card-head">
                <h2 id="data-sources" className="card-title">חשבונות ומקורות</h2>
                <Link href="/sources" className="section-link">לכל המקורות</Link>
              </div>
              <ul className="source-status" data-testid="source-status">
                {picture.sources.map((s) => (
                  <li key={s.kind} className="source-status-row">
                    <Link href={`/sources/${s.kind}`} className="source-status-name">{s.kind === "credit-card" ? <CreditCard size={18} aria-hidden="true" /> : s.kind === "bank" ? <Landmark size={18} aria-hidden="true" /> : <Wallet size={18} aria-hidden="true" />}{s.label}</Link>
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

            {/* ---- business expenses by type (expense-type dictionary) */}
            <section aria-labelledby="types" className="card dash-card" data-testid="expense-types">
              <div className="dash-card-head">
                <h2 id="types" className="card-title">הוצאות העסק לפי סוג{types.month ? <span className="card-sub"> · {monthLabel(types.month)}</span> : null}</h2>
              </div>
              {types.month && types.month !== m && slices.length ? <p className="dash-note" data-testid="expense-types-month">אין הוצאות ב{monthName} — מוצג החודש האחרון שיש בו הוצאות</p> : null}
              {otherCur.length ? <p className="dash-note" data-testid="expense-types-other-currency">בנוסף במטבע זר (לא נכלל באחוזים): {otherCur.join(" · ")}</p> : null}
              {slices.length ? <ExpenseTypeChart slices={slices} />
                : <EmptyState icon={PieChart} size="compact" title={types.status === "unavailable" ? "מילון סוגי ההוצאות עדיין לא זמין בסביבה הזו" : "יופיע אחרי קליטת הוצאות מחשבונית ירוקה"} />}
            </section>
          </div>

          {/* ---- recent movements (same rows as the transactions screen) */}
          <section aria-labelledby="recent" className="card dash-card">
            <div className="dash-card-head">
              <h2 id="recent" className="card-title">תנועות אחרונות</h2>
              <Link href="/transactions" className="section-link">לכל התנועות</Link>
            </div>
            {recent.length ? (
              <ul className="recent-list" data-testid="recent-transactions">
                {recent.map((t) => (
                  <li key={t.id}>
                    <Link href={`/records/transaction/${t.id}?back=%2F`} className="recent-row">
                      <span className="recent-date num">{dayLabel(t.date)}</span>
                      <span className="recent-desc"><bdi>{t.description ?? "ללא תיאור"}</bdi><span className="recent-account">{t.account}</span></span>
                      <span className={`recent-amount${t.direction === "credit" ? " fin-pos" : ""}`}><Amount value={t.direction === "debit" ? { ...t.amount, minor: (-BigInt(t.amount.minor)).toString() } : t.amount} /></span>
                      <ChevronLeft size={16} aria-hidden="true" className="recent-chevron" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={ReceiptText} size="compact" title="תנועות יופיעו אחרי הקליטה הראשונה" />}
          </section>
        </div>

        <div className="dash-side">
          <section aria-labelledby="data-status" className="card trust-panel">
            <h2 id="data-status" className="card-title">מצב המידע</h2>
            <TrustBar {...trustFromPicture(picture)} />
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
              <AttentionList items={attention} max={5} testId="attention-list" />
            )}
          </section>

          <section aria-labelledby="upcoming">
            <h2 id="upcoming" className="section-title">קרוב בזמן</h2>
            {picture.upcoming.cardCharges ? (
              <ul className="card compact-list">
                <li>
                  <Link href={detail("upcoming_card_charges")} className="compact-row metric-link" data-testid="upcoming-card">
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
        </div>
      </div>
    </div>
  );
}
