import Link from "next/link";
import { getCurrentPicture } from "@/features/picture/current-picture";
import { getAttentionItems } from "@/features/picture/attention";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import { BackLink } from "@/components/workspace/back-link";
import "@/components/ui/ui.css";
import "@/components/business/business.css";
import { CoverageNote } from "@/components/business/coverage-note";
import { EmptyState } from "@/components/ui/empty-state";
import { Landmark, CreditCard, CalendarClock, Info, ShieldCheck, ChevronLeft, ChevronRight, FileText, ArrowDownLeft, ArrowUpRight, TrendingUp, CircleCheck } from "lucide-react";
import { TrustBar, trustFromPicture } from "@/components/business/trust-bar";
import { AttentionList } from "@/components/business/attention-list";
import { MonthlyFlowChart } from "@/components/business/monthly-flow-chart";
import { ExpenseTypesCard } from "@/components/business/expense-types-card";
import { RecentTransactions } from "@/components/business/recent-transactions";
import { getExpenseTypes, getRecentTransactions } from "@/features/home/home-extras";

export const dynamic = "force-dynamic";

const shortMonth = new Intl.DateTimeFormat("he-IL", { month: "short", timeZone: "UTC" });
const major = (m: { minor: string } | null) => (m ? Number(BigInt(m.minor)) / 100 : null);
const RANGES = [3, 6, 12] as const;
const ACCOUNT_TYPE: Record<string, string> = { checking: "חשבון בנק", savings: "חיסכון", credit_card: "כרטיס אשראי", payment_app: "אפליקציית תשלום", other: "אחר" };
const REASON: Record<string, string> = {
  no_bank_source: "עדיין לא נקלט דף בנק עם יתרה, ולכן הכסף הנוכחי אינו ידוע.",
  bank_without_balance: "בחלק מחשבונות הבנק אין יתרה בקובץ שנקלט, ולכן הסכום הכולל אינו ידוע.",
  mixed_currency: "החשבונות במטבעות שונים ולא סוכמו יחד.",
};

// B1 Current Financial Picture — the analysis workspace behind Home (22A §11, §74; 22B §B1; chapter 13). Layout after
// the approved Calm Finance mockup (D-023): KPI row → the month in context (breakdown + trend with a period choice) beside
// data status and actions → bank accounts · expenses by type → recent movements → business documents → future. Layers
// stay separate (reported balances, money movements, business documents, future items); partial and unknown are explicit;
// a capability that is not built yet is shown and marked (D-020), never a number.
export default async function SnapshotPage({ searchParams }: PageProps<"/snapshot">) {
  const sp = await searchParams;
  const p = await getCurrentPicture(typeof sp.month === "string" ? sp.month : null);
  const range = RANGES.find((r) => String(r) === sp.range) ?? 6;
  const [types, recent, attention] = await Promise.all([getExpenseTypes(p.month), getRecentTransactions(6), getAttentionItems()]);
  const detail = (metric: string) => `/snapshot/details?metric=${metric}${p.month ? `&month=${p.month}` : ""}`;
  const here = (extra: Record<string, string | number>) => `/snapshot?${new URLSearchParams({ ...(p.month ? { month: p.month } : {}), range: String(range), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) })}`;
  const idx = p.month ? p.months.indexOf(p.month) : -1;
  const older = idx >= 0 ? p.months[idx + 1] : undefined; // months are newest first
  const newer = idx > 0 ? p.months[idx - 1] : undefined;
  const hasBusiness = !!(p.business.income || p.business.expenses);
  const points = p.series.slice(-range).map((s) => ({ month: s.month, label: shortMonth.format(new Date(`${s.month}-01T12:00:00Z`)), moneyIn: major(s.moneyIn), moneyOut: major(s.moneyOut) }));
  const currency = p.flows.moneyIn?.currency ?? p.flows.moneyOut?.currency ?? "ILS";
  const banks = p.currentMoney.accounts;

  return (
    <div className="ws">
      <BackLink href="/" label="חזרה לבית" />
      <header className="ws-header">
        <div>
          <h1 className="ws-title">תמונת מצב</h1>
          <p className="ws-sub">ניתוח מלא של המצב לפי כל המקורות שהעלית. מה שחסר או לא ודאי מסומן במפורש.</p>
        </div>
        {p.month ? (
          <nav className="month-stepper" aria-label="בחירת חודש">
            {older ? <Link href={here({ month: older })} className="btn btn-ghost month-step" aria-label={`חודש קודם: ${monthLabel(older)}`}><ChevronRight size={18} aria-hidden="true" /></Link> : <span className="month-step month-step--off" aria-hidden="true"><ChevronRight size={18} /></span>}
            <span className="month-current" aria-current="page">{monthLabel(p.month)}</span>
            {newer ? <Link href={here({ month: newer })} className="btn btn-ghost month-step" aria-label={`חודש הבא: ${monthLabel(newer)}`}><ChevronLeft size={18} aria-hidden="true" /></Link> : <span className="month-step month-step--off" aria-hidden="true"><ChevronLeft size={18} /></span>}
          </nav>
        ) : null}
      </header>

      {!p.hasAnyData ? (
        <EmptyState icon={ShieldCheck} title="עדיין אין נתונים" action={<Link href="/sources" className="btn-secondary">לחשבונות ומקורות</Link>}>התמונה תיבנה מהמקורות שתעלי ב„חשבונות ומקורות”.</EmptyState>
      ) : null}

      {/* ---- KPI row */}
      <section aria-labelledby="money" id="money">
        <h2 id="money" className="visually-hidden">מספרי המפתח · {monthLabel(p.month)}</h2>
        <div className="kpis">
          <div className="card kpi kpi--primary">
            <span className="kpi-icon kpi-icon--brand" aria-hidden="true"><Landmark size={20} /></span>
            <span className="kpi-label">יתרה בחשבונות הבנק</span>
            <span className="kpi-value"><Amount value={p.currentMoney.total} /></span>
            <span className="kpi-foot">{p.currentMoney.total ? <>נכון ל־<span className="num">{dayLabel(p.currentMoney.asOf)}</span> · מסגרת אשראי אינה נכללת</> : REASON[p.currentMoney.reason ?? ""]}</span>
          </div>
          <Link href={detail("money_in")} className="card kpi metric-link">
            <span className="kpi-icon kpi-icon--pos" aria-hidden="true"><ArrowDownLeft size={20} /></span>
            <span className="kpi-label">נכנס · {monthLabel(p.month)}</span>
            <span className="kpi-value fin-pos"><Amount value={p.flows.moneyIn} unknownText="אין נתונים" /></span>
            <span className="kpi-foot"><CoverageNote coverage={p.flows.coverage} detail="plain" /> · לפירוט</span>
          </Link>
          <Link href={detail("money_out")} className="card kpi metric-link">
            <span className="kpi-icon kpi-icon--neg" aria-hidden="true"><ArrowUpRight size={20} /></span>
            <span className="kpi-label">יצא · {monthLabel(p.month)}</span>
            <span className="kpi-value fin-neg"><Amount value={p.flows.moneyOut} unknownText="אין נתונים" /></span>
            <span className="kpi-foot">{p.flows.pendingOut ? <>ועוד <Amount value={p.flows.pendingOut} /> בבדיקת כפילות · </> : null}<CoverageNote coverage={p.flows.coverage} detail="plain" /> · לפירוט</span>
          </Link>
          <div className="card kpi kpi--soon" aria-disabled="true" data-testid="kpi-expected">
            <span className="kpi-icon" aria-hidden="true"><TrendingUp size={20} /></span>
            <span className="kpi-label">יתרה צפויה</span>
            <span className="kpi-value kpi-value--soon">בפיתוח</span>
            <span className="kpi-foot">תחושב כשיהיו כספים עתידיים והתחייבויות</span>
          </div>
        </div>
        <p className="inline-note"><Info size={16} aria-hidden="true" /><span><CoverageNote coverage={p.flows.coverage} testId="snapshot-coverage-flows" />{p.flows.currencyMixed ? " · יש תנועות במטבעות שונים, ולכן הסכום לא חושב כמטבע אחד." : ""}</span></p>
      </section>

      <div className="dash-grid">
        <div className="dash-main">
          {/* ---- the month in context: breakdown + trend */}
          <section aria-labelledby="flows" className="card dash-card">
            <div className="dash-card-head">
              <h2 id="flows" className="card-title">פירוט · {monthLabel(p.month)}</h2>
              <nav className="range-tabs" aria-label="תקופת הגרף">
                {RANGES.map((r) => <Link key={r} href={here({ range: r })} className={`range-tab${r === range ? " range-tab--on" : ""}`} aria-current={r === range ? "true" : undefined}>{r === 12 ? "שנה" : `${r} חודשים`}</Link>)}
              </nav>
            </div>
            <div className="month-body">
              <div className="month-breakdown">
                <dl>
                  <div className="month-row"><dt>נכנס</dt><dd className="fin-pos"><Amount value={p.flows.moneyIn} unknownText="אין נתונים" /></dd></div>
                  <div className="month-row"><dt>יצא</dt><dd className="fin-neg"><Amount value={p.flows.moneyOut} unknownText="אין נתונים" /></dd></div>
                  <div className="month-row month-row--total"><dt>נטו</dt><dd><Amount value={p.flows.net} unknownText="לא ניתן לחשב" /></dd></div>
                </dl>
                <p className="dash-note">{p.flows.pendingCount ? "לא סופי — יש תנועות שממתינות להחלטתך" : "בלי העברות בין חשבונותייך; חיוב כרטיס בבנק אינו נספר שוב"}</p>
                <Link href={`/transactions${p.month ? `?month=${p.month}` : ""}`} className="btn btn-secondary btn-sm">לכל התנועות בחודש</Link>
              </div>
              {points.length >= 2 ? <MonthlyFlowChart points={points} currency={currency} />
                : <p className="dash-note month-chart-later">גרף ההשוואה בין חודשים יופיע כשיהיו נתונים מחודש נוסף.</p>}
            </div>
          </section>

          <div className="dash-pair">
            {/* ---- bank accounts */}
            <section aria-labelledby="accounts" className="card dash-card">
              <div className="dash-card-head">
                <h2 id="accounts" className="card-title">חשבונות</h2>
                <Link href="/sources" className="section-link">לכל החשבונות</Link>
              </div>
              {banks.length ? (
                <ul className="account-list" data-testid="accounts">
                  {banks.map((a) => (
                    <li key={a.id} className="account-row">
                      <span className="account-name">{a.type === "credit_card" ? <CreditCard size={18} aria-hidden="true" /> : <Landmark size={18} aria-hidden="true" />}{a.name}<span className="account-meta"><span className="muted">{ACCOUNT_TYPE[a.type] ?? a.type}</span>{a.firstDate ? <> · <span className="num muted">{dayLabel(a.firstDate)} – {dayLabel(a.lastDate)}</span></> : null}</span></span>
                      {a.type === "checking" || a.type === "savings" ? (
                        <span className="account-value">{a.balance ? <Amount value={a.balance} /> : <span className="money--unknown">יתרה לא ידועה</span>}{a.stale ? <span className="badge badge--warn">לא עדכני</span> : null}</span>
                      ) : <span className="account-value muted">{a.type === "credit_card" ? "התחייבות, לא כסף זמין" : "יתרה לא מדווחת בקובץ"}</span>}
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon={Landmark} size="compact" title="חשבונות יופיעו אחרי קליטת דף בנק או כרטיס" />}
            </section>

            {/* ---- business expenses by type */}
            <ExpenseTypesCard types={types} month={p.month} />
          </div>

          {/* ---- recent movements */}
          <section aria-labelledby="recent" className="card dash-card">
            <div className="dash-card-head">
              <h2 id="recent" className="card-title">תנועות אחרונות</h2>
              <Link href={`/transactions${p.month ? `?month=${p.month}` : ""}`} className="section-link">לכל התנועות</Link>
            </div>
            <RecentTransactions items={recent} back={here({})} />
          </section>

          {/* ---- business documents (a separate layer from money movements) */}
          <section aria-labelledby="business" className="card dash-card">
            <div className="dash-card-head">
              <h2 id="business" className="card-title">העסק לפי חשבוניות · {monthLabel(p.month)}</h2>
              {hasBusiness ? <Link href={detail("business")} className="section-link">לפירוט</Link> : null}
            </div>
            {hasBusiness ? (
              <>
                <div className="stat-group">
                  <span className="stat"><span className="metric-label">הכנסות</span><span className="stat-value"><Amount value={p.business.income} unknownText="—" /></span></span>
                  <span className="stat"><span className="metric-label">הוצאות</span><span className="stat-value"><Amount value={p.business.expenses} unknownText="—" /></span></span>
                  <span className="stat"><span className="metric-label">נטו לפי חשבוניות</span><span className="stat-value"><Amount value={p.business.net} unknownText="—" /></span></span>
                </div>
                <p className="inline-note"><Info size={16} aria-hidden="true" /><span><CoverageNote coverage={p.business.coverage} testId="snapshot-coverage-business" /> · נספרות חשבוניות מס וחשבוניות מס/קבלה בלבד{p.business.uncountedDocuments ? ` (${p.business.uncountedDocuments} קבלות וזיכויים לא נספרו)` : ""}. נפרד מתנועות הכסף.</span></p>
              </>
            ) : (
              <EmptyState icon={FileText} size="compact" title="עוד לא נקלטו חשבוניות של העסק לתקופה הזו" testId="business-empty" action={<Link href="/sources" className="section-link">להעלאה</Link>} />
            )}
          </section>
        </div>

        <div className="dash-side">
          {/* ---- data status */}
          <section aria-labelledby="trust" className="card trust-panel">
            <h2 id="trust" className="card-title">מצב המידע</h2>
            <TrustBar {...trustFromPicture(p)} />
          </section>

          {/* ---- actions waiting */}
          <section aria-labelledby="todo" className="card dash-card">
            <div className="dash-card-head">
              <h2 id="todo" className="card-title">פעולות לביצוע</h2>
              {attention.length ? <Link href="/review" className="section-link">לתור הבדיקה</Link> : null}
            </div>
            {attention.length ? <AttentionList items={attention} max={5} /> : <EmptyState icon={CircleCheck} tone="calm" size="compact" title="אין כרגע פריטים לטיפול" />}
          </section>

          {/* ---- future money and near obligations */}
          <section aria-labelledby="future" className="card dash-card">
            <h2 id="future" className="card-title">כסף עתידי והתחייבויות קרובות</h2>
            {p.upcoming.cardCharges ? (
              <ul className="compact-list">
                <li>
                  <Link href={detail("upcoming_card_charges")} className="compact-row metric-link">
                    <span className="compact-icon" aria-hidden="true"><CreditCard size={18} /></span>
                    <span className="compact-text"><span className="compact-title">חיובי כרטיס שטרם נגבו</span><span className="compact-meta num">החיוב הקרוב: {dayLabel(p.upcoming.nextChargeDate)}</span></span>
                    <span className="compact-amount"><Amount value={p.upcoming.cardCharges} /></span>
                  </Link>
                </li>
              </ul>
            ) : null}
            <EmptyState icon={CalendarClock} size="compact" title="כספים עתידיים, הלוואות וחובות: לא ידוע" testId="future-unknown">עוד לא נקלט מקור שמגדיר אותם.</EmptyState>
          </section>
        </div>
      </div>
    </div>
  );
}
