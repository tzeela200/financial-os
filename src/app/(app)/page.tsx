import Link from "next/link";
import { getDashboardToday } from "@/features/home/dashboard-today";
import { CoverageIndicator } from "@/components/ui/coverage-indicator";
import { MoneyAmount } from "@/components/ui/money-amount";
import "@/components/ui/ui.css";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jerusalem" });

// Home — Control Room (22A §5–7, §69–73). Order: current picture → near term → attention → data status → quick access.
export default async function HomePage() {
  let data;
  try {
    data = await getDashboardToday();
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

  const today = dateFmt.format(new Date());
  const firstUse = data.sourcesCount === 0;

  return (
    <div className="ws">
      <div className="ws-header">
        <div>
          <h1 className="ws-title">בית</h1>
          <p className="ws-sub">נכון ל־<span className="num">{today}</span></p>
        </div>
        <Link href="/sources" className="link-btn">העלאת מקור</Link>
      </div>

      {/* Trust Bar — mandatory on every screen (20C §7) */}
      <div className="trust-bar" aria-label="סרגל אמינות">
        <span className="trust-item">
          {data.coverage.length === 0 ? (
            <CoverageIndicator status="unknown" />
          ) : (
            data.coverage.map((c) => (
              <span key={c.status} className="trust-item">
                <CoverageIndicator status={c.status} />
                <span className="num">{c.count}</span>
              </span>
            ))
          )}
        </span>
        <span className="trust-item">
          עדכון אחרון: {data.lastSourceAt ? <span className="num">{dateFmt.format(new Date(data.lastSourceAt))}</span> : "אין עדיין מקורות"}
        </span>
        <span className="trust-item">בקרת איכות: {data.lastQa ? data.lastQa.status : "עדיין לא רצה"}</span>
        <span className="trust-item">
          לבדיקה: <span className="num">{data.openReviewItems}</span>
        </span>
      </div>

      {firstUse ? (
        <section className="card empty" aria-labelledby="first-use">
          <h2 id="first-use">עדיין אין תמונה פיננסית</h2>
          <p>
            כדי שהמערכת תדע כמה כסף יש, מה צפוי להיכנס ומה צפוי לצאת, צריך להכניס מקור ראשון: דוח בנק, קובץ כרטיס אשראי,
            ייצוא מ־bit או מחשבונית ירוקה. כל מקור נקלט בהקשר שלו.
          </p>
          <Link href="/sources" className="link-btn">העלאת מקור ראשון</Link>
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
          <div className="card metric">
            <div className="metric-label">מקורות שנקלטו</div>
            <div className="metric-value"><span className="num">{data.sourcesCount}</span></div>
            <div className="metric-foot">חשבונות מזוהים: <span className="num">{data.accountsCount}</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}
