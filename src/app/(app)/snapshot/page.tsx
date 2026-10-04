import Link from "next/link";
import { getCurrentPicture } from "@/features/picture/current-picture";
import { dayLabel, monthLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import { BackLink } from "@/components/workspace/back-link";
import "@/components/ui/ui.css";
import "@/components/business/business.css";
import { CoverageNote } from "@/components/business/coverage-note";

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
        <section className="card empty"><h2>עדיין אין נתונים</h2><p>התמונה תיבנה מהמקורות שתעלי ב„חשבונות ומקורות”.</p><Link href="/sources" className="btn-secondary">לחשבונות ומקורות</Link></section>
      ) : null}

      <section aria-labelledby="money" id="money" className="file-section">
        <h2 id="money" className="section-title">כסף נוכחי ואיפה הוא נמצא</h2>
        <div className="card">
          <div className="metric">
            <span className="metric-label">סך היתרות בחשבונות הבנק</span>
            <span className="metric-value"><Amount value={p.currentMoney.total} /></span>
            <span className="metric-foot">{p.currentMoney.total ? <>יתרה מדווחת בדפי הבנק, נכון ל־{dayLabel(p.currentMoney.asOf)}. מסגרת אשראי אינה נכללת.</> : REASON[p.currentMoney.reason ?? ""]}</span>
          </div>
          {p.currentMoney.accounts.length ? (
            <ul className="account-list" data-testid="accounts">
              {p.currentMoney.accounts.map((a) => (
                <li key={a.id} className="account-row">
                  <span className="account-name">{a.name}<span className="muted"> · {ACCOUNT_TYPE[a.type] ?? a.type}</span></span>
                  <span className="num muted">{a.firstDate ? `${dayLabel(a.firstDate)} – ${dayLabel(a.lastDate)}` : ""}</span>
                  {a.type === "checking" || a.type === "savings" ? (
                    <span>{a.balance ? <Amount value={a.balance} /> : <span className="money--unknown">יתרה לא ידועה</span>}{a.stale ? <> <span className="badge badge--warn">לא עדכני</span></> : null}</span>
                  ) : <span className="muted">{a.type === "credit_card" ? "התחייבות, לא כסף זמין" : "יתרה לא מדווחת בקובץ"}</span>}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="flows" className="file-section">
        <h2 id="flows" className="section-title">תנועות כסף · {monthLabel(p.month)}</h2>
        <div className="metrics">
          <Link href={detail("money_in")} className="card metric metric-link"><span className="metric-label">נכנס</span><span className="metric-value metric-value--md fin-pos"><Amount value={p.flows.moneyIn} unknownText="אין נתונים" /></span><span className="metric-foot">בנק, bit והחזרים — בלי העברות בין חשבונותייך</span></Link>
          <Link href={detail("money_out")} className="card metric metric-link"><span className="metric-label">יצא</span><span className="metric-value metric-value--md fin-neg"><Amount value={p.flows.moneyOut} unknownText="אין נתונים" /></span><span className="metric-foot">עסקאות כרטיס נספרות פעם אחת; חיוב הכרטיס בבנק אינו נספר שוב</span></Link>
          <div className="card metric"><span className="metric-label">נטו</span><span className="metric-value metric-value--md"><Amount value={p.flows.net} unknownText="לא ניתן לחשב" /></span><span className="metric-foot">{p.flows.pendingCount ? "חלקי — יש תנועות שממתינות להחלטתך" : p.flows.coverage.partial ? "חלקי — לא כל המקורות מכסים את החודש" : "נכנס פחות יצא"}</span></div>
          {p.flows.pendingOut ? <Link href={detail("money_out_pending")} className="card metric metric-link"><span className="metric-label">בבדיקת כפילות</span><span className="metric-value metric-value--md"><Amount value={p.flows.pendingOut} /></span><span className="metric-foot">{p.flows.pendingCount} תנועות שאולי כבר נספרו במקור אחר</span></Link> : null}
        </div>
        <p className="muted-note"><CoverageNote coverage={p.flows.coverage} testId="snapshot-coverage-flows" /></p>
        {p.flows.currencyMixed ? <p className="muted-note">יש תנועות במטבעות שונים, ולכן הסכום לא חושב כמטבע אחד.</p> : null}
      </section>

      <section aria-labelledby="business" className="file-section">
        <h2 id="business" className="section-title">העסק לפי מסמכים · {monthLabel(p.month)}</h2>
        <Link href={detail("business")} className="card business-row metric-link">
          <span><span className="metric-label">הכנסות</span> <Amount value={p.business.income} unknownText="—" /></span>
          <span><span className="metric-label">הוצאות</span> <Amount value={p.business.expenses} unknownText="—" /></span>
          <span><span className="metric-label">נטו לפי מסמכים</span> <Amount value={p.business.net} unknownText="—" /></span>
        </Link>
        <p className="muted-note"><CoverageNote coverage={p.business.coverage} testId="snapshot-coverage-business" /></p>
        <p className="muted-note">מבוסס על חשבוניות מס וחשבוניות מס/קבלה בלבד. קבלות, חשבונות עסקה וזיכויים אינם נספרים כהכנסה חדשה{p.business.uncountedDocuments ? ` (${p.business.uncountedDocuments} מסמכים כאלה)` : ""}. שכבה זו נפרדת מתנועות הכסף ואינה מתווספת אליהן.</p>
      </section>

      <section aria-labelledby="future" className="file-section">
        <h2 id="future" className="section-title">כסף עתידי והתחייבויות קרובות</h2>
        {p.upcoming.cardCharges ? (
          <Link href={detail("upcoming_card_charges")} className="card upcoming-row metric-link"><span>חיובי כרטיס שטרם נגבו</span><span className="num">החיוב הקרוב: {dayLabel(p.upcoming.nextChargeDate)}</span><Amount value={p.upcoming.cardCharges} /></Link>
        ) : <p className="card muted-note">אין עדיין מקור שמגדיר כספים עתידיים, הלוואות או התחייבויות. הם יופיעו בנפרד מהכסף הנוכחי.</p>}
        <p className="muted-note">חובות ופיגורים: לא ידוע — עדיין לא נקלט מקור חובות, הלוואות או דוח אשראי.</p>
      </section>

      <section aria-labelledby="trust" className="file-section">
        <h2 id="trust" className="section-title">עד כמה אפשר לסמוך על התמונה</h2>
        <div className="card trust-grid">
          <span>מסמכים שנבדקו ללא חריגות: <span className="num">{p.trust.verifiedDocs}/{p.trust.totalDocs}</span></span>
          <span>מסמכים שדורשים בדיקה: <span className="num">{p.trust.needsReviewDocs}</span></span>
          <span>התאמות שממתינות להחלטה: <span className="num">{p.trust.openCandidates}</span></span>
          <span>סתירות פתוחות: <span className="num">{p.trust.openContradictions}</span></span>
          <span>קבצים שעיבודם נכשל: <span className="num">{p.trust.failedFiles}</span></span>
          <span>מקורות חסרים: {p.missingSources.length ? p.missingSources.join(", ") : "אין"}</span>
        </div>
        {p.trust.openReview ? <Link href="/review" className="btn-secondary">לתור הבדיקה ({p.trust.openReview})</Link> : null}
      </section>
    </div>
  );
}
