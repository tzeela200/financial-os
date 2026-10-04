import Link from "next/link";
import { getCurrentPicture } from "@/features/picture/current-picture";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import { BackLink } from "@/components/workspace/back-link";
import "@/components/ui/ui.css";
import "@/components/business/business.css";
import { CoverageNote } from "@/components/business/coverage-note";
import { EmptyState } from "@/components/ui/empty-state";
import { Landmark, CreditCard, CalendarClock, Info, ShieldCheck, ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const ACCOUNT_TYPE: Record<string, string> = { checking: "חשבון בנק", savings: "חיסכון", credit_card: "כרטיס אשראי", payment_app: "אפליקציית תשלום", other: "אחר" };
const REASON: Record<string, string> = {
  no_bank_source: "עדיין לא נקלט דף בנק עם יתרה, ולכן הכסף הנוכחי אינו ידוע.",
  bank_without_balance: "בחלק מחשבונות הבנק אין יתרה בקובץ שנקלט, ולכן הסכום הכולל אינו ידוע.",
  mixed_currency: "החשבונות במטבעות שונים ולא סוכמו יחד.",
};

// B1 Current Financial Picture (22B §B1; chapter 13). Same read model as Home. Layers stay separate: reported balances,
// money movements (reconciled, pending shown), business documents, future items. Partial and unknown are explicit.
export default async function SnapshotPage({ searchParams }: PageProps<"/snapshot">) {
  const sp = await searchParams;
  const p = await getCurrentPicture(typeof sp.month === "string" ? sp.month : null);
  const detail = (metric: string) => `/snapshot/details?metric=${metric}${p.month ? `&month=${p.month}` : ""}`;

  return (
    <div className="ws">
      <BackLink href="/" label="חזרה לבית" />
      <header className="ws-header">
        <div>
          <h1 className="ws-title">תמונת מצב</h1>
          <p className="ws-sub">כל המקורות שהעלית, בתמונה אחת. מה שחסר או לא ודאי מסומן במפורש.</p>
        </div>
        {p.months.length ? (
          <nav className="month-nav" aria-label="בחירת חודש">
            {p.months.slice(0, 12).map((m) => <Link key={m} href={`/snapshot?month=${m}`} className={`chip${m === p.month ? " chip--active" : ""}`} aria-current={m === p.month ? "page" : undefined}>{monthLabel(m)}</Link>)}
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
          {p.currentMoney.accounts.length ? (
            <ul className="account-list" data-testid="accounts">
              {p.currentMoney.accounts.map((a) => (
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
        <div className="coverage-summary">
          <Info size={16} aria-hidden="true" />
          <div>
            <p><strong>על מה זה מבוסס.</strong> <CoverageNote coverage={p.flows.coverage} testId="snapshot-coverage-flows" /></p>
            {p.flows.currencyMixed ? <p>יש תנועות במטבעות שונים, ולכן הסכום לא חושב כמטבע אחד.</p> : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="business" className="file-section">
        <h2 id="business" className="section-title">העסק לפי מסמכים · {monthLabel(p.month)}</h2>
        <Link href={detail("business")} className="card stat-group metric-link">
          <span className="stat"><span className="metric-label">הכנסות</span><span className="stat-value"><Amount value={p.business.income} unknownText="—" /></span></span>
          <span className="stat"><span className="metric-label">הוצאות</span><span className="stat-value"><Amount value={p.business.expenses} unknownText="—" /></span></span>
          <span className="stat"><span className="metric-label">נטו לפי מסמכים</span><span className="stat-value"><Amount value={p.business.net} unknownText="—" /></span></span>
          <span className="metric-more">לפירוט<ChevronLeft size={16} aria-hidden="true" /></span>
        </Link>
        <div className="coverage-summary">
          <Info size={16} aria-hidden="true" />
          <div>
            <p><strong>על מה זה מבוסס.</strong> <CoverageNote coverage={p.business.coverage} testId="snapshot-coverage-business" /></p>
            <p>נספרות חשבוניות מס וחשבוניות מס/קבלה בלבד. קבלות, חשבונות עסקה וזיכויים אינם נספרים כהכנסה חדשה{p.business.uncountedDocuments ? ` (${p.business.uncountedDocuments} מסמכים כאלה)` : ""}. שכבה זו נפרדת מתנועות הכסף ואינה מתווספת אליהן.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="future" className="file-section">
        <h2 id="future" className="section-title">כסף עתידי והתחייבויות קרובות</h2>
        <ul className="card compact-list">
          {p.upcoming.cardCharges ? (
            <li>
              <Link href={detail("upcoming_card_charges")} className="compact-row metric-link">
                <span className="compact-icon" aria-hidden="true"><CreditCard size={18} /></span>
                <span className="compact-text"><span className="compact-title">חיובי כרטיס שטרם נגבו</span><span className="compact-meta num">החיוב הקרוב: {dayLabel(p.upcoming.nextChargeDate)}</span></span>
                <span className="compact-amount"><Amount value={p.upcoming.cardCharges} /></span>
              </Link>
            </li>
          ) : (
            <li className="compact-row">
              <span className="compact-icon compact-icon--neutral" aria-hidden="true"><CalendarClock size={18} /></span>
              <span className="compact-text"><span className="compact-title">כספים עתידיים</span><span className="compact-meta">אין עדיין מקור שמגדיר כספים עתידיים, הלוואות או התחייבויות. הם יופיעו בנפרד מהכסף הנוכחי.</span></span>
            </li>
          )}
          <li className="compact-row">
            <span className="compact-icon compact-icon--neutral" aria-hidden="true"><Info size={18} /></span>
            <span className="compact-text"><span className="compact-title">חובות ופיגורים</span><span className="compact-meta">עדיין לא נקלט מקור חובות, הלוואות או דוח אשראי.</span></span>
            <span className="money money--unknown">לא ידוע</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="trust" className="file-section">
        <div className="section-head">
          <h2 id="trust" className="section-title">עד כמה אפשר לסמוך על התמונה</h2>
          {p.trust.openReview ? <Link href="/review" className="section-link">לתור הבדיקה ({p.trust.openReview})</Link> : null}
        </div>
        <dl className="card kv-grid">
          <div className="kv"><dt>מסמכים שנבדקו ללא חריגות</dt><dd><span className="num">{p.trust.verifiedDocs}/{p.trust.totalDocs}</span></dd></div>
          <div className={`kv${p.trust.needsReviewDocs ? " kv--warn" : ""}`}><dt>מסמכים שדורשים בדיקה</dt><dd><span className="num">{p.trust.needsReviewDocs}</span></dd></div>
          <div className={`kv${p.trust.openCandidates ? " kv--warn" : ""}`}><dt>התאמות שממתינות להחלטה</dt><dd><span className="num">{p.trust.openCandidates}</span></dd></div>
          <div className={`kv${p.trust.openContradictions ? " kv--err" : ""}`}><dt>סתירות פתוחות</dt><dd><span className="num">{p.trust.openContradictions}</span></dd></div>
          <div className={`kv${p.trust.failedFiles ? " kv--err" : ""}`}><dt>קבצים שעיבודם נכשל</dt><dd><span className="num">{p.trust.failedFiles}</span></dd></div>
          <div className={`kv kv--wide${p.missingSources.length ? " kv--warn" : ""}`}><dt>מקורות חסרים</dt><dd>{p.missingSources.length ? p.missingSources.join(", ") : "אין"}</dd></div>
        </dl>
      </section>
    </div>
  );
}
