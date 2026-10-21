import Link from "next/link";
import { getCurrentPicture } from "@/features/picture/current-picture";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import { BackLink } from "@/components/workspace/back-link";
import "@/components/ui/ui.css";
import "@/components/business/business.css";
import { CoverageNote } from "@/components/business/coverage-note";
import { EmptyState } from "@/components/ui/empty-state";
import { Landmark, CreditCard, CalendarClock, Info, ShieldCheck, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { TrustBar, trustFromPicture } from "@/components/business/trust-bar";
import { MonthlyFlowChart } from "@/components/business/monthly-flow-chart";
import { ExpenseTypesCard } from "@/components/business/expense-types-card";
import { RecentTransactions } from "@/components/business/recent-transactions";
import { getExpenseTypes, getRecentTransactions } from "@/features/home/home-extras";

export const dynamic = "force-dynamic";

const ACCOUNT_TYPE: Record<string, string> = { checking: "חשבון בנק", savings: "חיסכון", credit_card: "כרטיס אשראי", payment_app: "אפליקציית תשלום", other: "אחר" };
const shortMonth = new Intl.DateTimeFormat("he-IL", { month: "short", timeZone: "UTC" });
const major = (m: { minor: string } | null) => (m ? Number(BigInt(m.minor)) / 100 : null);
const REASON: Record<string, string> = {
  no_bank_source: "עדיין לא נקלט דף בנק עם יתרה, ולכן הכסף הנוכחי אינו ידוע.",
  bank_without_balance: "בחלק מחשבונות הבנק אין יתרה בקובץ שנקלט, ולכן הסכום הכולל אינו ידוע.",
  mixed_currency: "החשבונות במטבעות שונים ולא סוכמו יחד.",
};

// B1 Current Financial Picture (22B §B1; chapter 13). Same read model as Home. Layers stay separate: reported balances,
// money movements (reconciled, pending shown), business documents, future items. Partial and unknown are explicit.
// Design review 20.10.2026: one month stepper instead of a row of chips; a section without data takes one line; the
// basis is said once; the trust section is the shared Trust Bar (same wording as Home).
export default async function SnapshotPage({ searchParams }: PageProps<"/snapshot">) {
  const sp = await searchParams;
  const p = await getCurrentPicture(typeof sp.month === "string" ? sp.month : null);
  const [types, recent] = await Promise.all([getExpenseTypes(p.month), getRecentTransactions(5)]);
  const points = p.series.map((s) => ({ month: s.month, label: shortMonth.format(new Date(`${s.month}-01T12:00:00Z`)), moneyIn: major(s.moneyIn), moneyOut: major(s.moneyOut) }));
  const currency = p.flows.moneyIn?.currency ?? p.flows.moneyOut?.currency ?? "ILS";
  const detail = (metric: string) => `/snapshot/details?metric=${metric}${p.month ? `&month=${p.month}` : ""}`;
  const idx = p.month ? p.months.indexOf(p.month) : -1;
  const older = idx >= 0 ? p.months[idx + 1] : undefined; // months are newest first
  const newer = idx > 0 ? p.months[idx - 1] : undefined;
  const hasBusiness = !!(p.business.income || p.business.expenses);
  // a single bank account repeats the total above it — list accounts only when they add information
  const checking = p.currentMoney.accounts.filter((a) => a.type === "checking" || a.type === "savings");
  const listed = p.currentMoney.accounts.filter((a) => !(checking.length === 1 && a.id === checking[0]!.id));

  return (
    <div className="ws">
      <BackLink href="/" label="חזרה לבית" />
      <header className="ws-header">
        <div>
          <h1 className="ws-title">תמונת מצב</h1>
          <p className="ws-sub">כל המקורות שהעלית, בתמונה אחת. מה שחסר או לא ודאי מסומן במפורש.</p>
        </div>
        {p.month ? (
          <nav className="month-stepper" aria-label="בחירת חודש">
            {older ? <Link href={`/snapshot?month=${older}`} className="btn btn-ghost month-step" aria-label={`חודש קודם: ${monthLabel(older)}`}><ChevronRight size={18} aria-hidden="true" /></Link> : <span className="month-step month-step--off" aria-hidden="true"><ChevronRight size={18} /></span>}
            <span className="month-current" aria-current="page">{monthLabel(p.month)}</span>
            {newer ? <Link href={`/snapshot?month=${newer}`} className="btn btn-ghost month-step" aria-label={`חודש הבא: ${monthLabel(newer)}`}><ChevronLeft size={18} aria-hidden="true" /></Link> : <span className="month-step month-step--off" aria-hidden="true"><ChevronLeft size={18} /></span>}
          </nav>
        ) : null}
      </header>

      {!p.hasAnyData ? (
        <EmptyState icon={ShieldCheck} title="עדיין אין נתונים" action={<Link href="/sources" className="btn-secondary">לחשבונות ומקורות</Link>}>התמונה תיבנה מהמקורות שתעלי ב„חשבונות ומקורות”.</EmptyState>
      ) : null}

      <section aria-labelledby="money" id="money" className="file-section">
        <h2 id="money" className="section-title">כסף נוכחי ואיפה הוא נמצא</h2>
        <div className="card snap-money">
          <div className="metric snap-money-total">
            <span className="metric-label"><Landmark size={18} aria-hidden="true" />סך היתרות בחשבונות הבנק</span>
            <span className="metric-value metric-value--lg"><Amount value={p.currentMoney.total} /></span>
            <span className="metric-foot">{p.currentMoney.total ? <>יתרה מדווחת בדפי הבנק, נכון ל־<span className="num">{dayLabel(p.currentMoney.asOf)}</span>. מסגרת אשראי אינה נכללת.</> : REASON[p.currentMoney.reason ?? ""]}</span>
          </div>
          {listed.length ? (
            <ul className="account-list" data-testid="accounts">
              {listed.map((a) => (
                <li key={a.id} className="account-row">
                  <span className="account-name">{a.name}<span className="account-meta"><span className="muted">{ACCOUNT_TYPE[a.type] ?? a.type}</span>{a.firstDate ? <> · <span className="num muted">{dayLabel(a.firstDate)} – {dayLabel(a.lastDate)}</span></> : null}</span></span>
                  {a.type === "checking" || a.type === "savings" ? (
                    <span className="account-value">{a.balance ? <Amount value={a.balance} /> : <span className="money--unknown">יתרה לא ידועה</span>}{a.stale ? <span className="badge badge--warn">לא עדכני</span> : null}</span>
                  ) : <span className="account-value muted">{a.type === "credit_card" ? "התחייבות, לא כסף זמין" : "יתרה לא מדווחת בקובץ"}</span>}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="flows" className="file-section">
        <h2 id="flows" className="section-title">תנועות כסף · {monthLabel(p.month)}</h2>
        <div className="metrics metrics--snap">
          <Link href={detail("money_in")} className="card metric metric-link"><span className="metric-label">נכנס</span><span className="metric-value metric-value--md fin-pos"><Amount value={p.flows.moneyIn} unknownText="אין נתונים" /></span><span className="metric-foot">בנק, bit והחזרים — בלי העברות בין חשבונותייך</span><span className="metric-more">לפירוט<ChevronLeft size={16} aria-hidden="true" /></span></Link>
          <Link href={detail("money_out")} className="card metric metric-link"><span className="metric-label">יצא</span><span className="metric-value metric-value--md fin-neg"><Amount value={p.flows.moneyOut} unknownText="אין נתונים" /></span><span className="metric-foot">עסקאות כרטיס נספרות פעם אחת; חיוב הכרטיס בבנק אינו נספר שוב</span><span className="metric-more">לפירוט<ChevronLeft size={16} aria-hidden="true" /></span></Link>
          <div className="card metric"><span className="metric-label">נטו</span><span className="metric-value metric-value--md"><Amount value={p.flows.net} unknownText="לא ניתן לחשב" /></span><span className="metric-foot">{p.flows.pendingCount ? "חלקי — יש תנועות שממתינות להחלטתך" : p.flows.coverage.partial ? "חלקי — לא כל המקורות מכסים את החודש" : "נכנס פחות יצא"}</span></div>
          {p.flows.pendingOut ? <Link href={detail("money_out_pending")} className="card metric metric-link"><span className="metric-label">בבדיקת כפילות</span><span className="metric-value metric-value--md"><Amount value={p.flows.pendingOut} /></span><span className="metric-foot">{p.flows.pendingCount} תנועות שאולי כבר נספרו במקור אחר</span><span className="metric-more">לפירוט<ChevronLeft size={16} aria-hidden="true" /></span></Link> : null}
        </div>
        <p className="inline-note"><Info size={16} aria-hidden="true" /><span><CoverageNote coverage={p.flows.coverage} testId="snapshot-coverage-flows" />{p.flows.currencyMixed ? " · יש תנועות במטבעות שונים, ולכן הסכום לא חושב כמטבע אחד." : ""}</span></p>
      </section>

      {/* trends: moved here from Home (22A §11 "מגמות" belong to the Snapshot; §74 no double dashboard) */}
      <section aria-labelledby="trend" className="file-section">
        <h2 id="trend" className="section-title">נכנס ויצא לאורך החודשים</h2>
        <div className="card dash-card">
          {points.length >= 2 ? <MonthlyFlowChart points={points} currency={currency} />
            : <p className="dash-note">גרף ההשוואה בין חודשים יופיע כשיהיו נתונים מחודש נוסף.</p>}
        </div>
      </section>

      <section aria-labelledby="recent" className="file-section">
        <div className="section-head">
          <h2 id="recent" className="section-title">תנועות אחרונות</h2>
          <Link href={`/transactions${p.month ? `?month=${p.month}` : ""}`} className="section-link">לכל התנועות בחודש</Link>
        </div>
        <div className="card dash-card"><RecentTransactions items={recent} back={`/snapshot${p.month ? `?month=${p.month}` : ""}`} /></div>
      </section>

      <section aria-labelledby="business" className="file-section">
        <h2 id="business" className="section-title">העסק לפי חשבוניות · {monthLabel(p.month)}</h2>
        {hasBusiness ? (
          <>
            <Link href={detail("business")} className="card stat-group metric-link">
              <span className="stat"><span className="metric-label">הכנסות</span><span className="stat-value"><Amount value={p.business.income} unknownText="—" /></span></span>
              <span className="stat"><span className="metric-label">הוצאות</span><span className="stat-value"><Amount value={p.business.expenses} unknownText="—" /></span></span>
              <span className="stat"><span className="metric-label">נטו לפי חשבוניות</span><span className="stat-value"><Amount value={p.business.net} unknownText="—" /></span></span>
              <span className="metric-more">לפירוט<ChevronLeft size={16} aria-hidden="true" /></span>
            </Link>
            <p className="inline-note"><Info size={16} aria-hidden="true" /><span><CoverageNote coverage={p.business.coverage} testId="snapshot-coverage-business" /> · נספרות חשבוניות מס וחשבוניות מס/קבלה בלבד{p.business.uncountedDocuments ? ` (${p.business.uncountedDocuments} קבלות וזיכויים לא נספרו)` : ""}. נפרד מתנועות הכסף.</span></p>
          </>
        ) : (
          <EmptyState icon={FileText} size="compact" title="עוד לא נקלטו חשבוניות של העסק לתקופה הזו" testId="business-empty" action={<Link href="/sources" className="section-link">להעלאה</Link>} />
        )}
      </section>

      <div className="file-section"><ExpenseTypesCard types={types} month={p.month} /></div>

      <section aria-labelledby="future" className="file-section">
        <h2 id="future" className="section-title">כסף עתידי והתחייבויות קרובות</h2>
        {p.upcoming.cardCharges ? (
          <ul className="card compact-list">
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

      <section aria-labelledby="trust" className="file-section">
        <div className="section-head">
          <h2 id="trust" className="section-title">עד כמה אפשר לסמוך על התמונה</h2>
          {p.trust.openReview ? <Link href="/review" className="section-link">לתור הבדיקה ({p.trust.openReview})</Link> : null}
        </div>
        <div className="card trust-panel"><TrustBar {...trustFromPicture(p)} /></div>
      </section>
    </div>
  );
}
