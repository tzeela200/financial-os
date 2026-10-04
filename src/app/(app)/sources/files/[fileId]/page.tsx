import Link from "next/link";
import { notFound } from "next/navigation";
import { getFileDetail } from "@/features/processing/file-detail";
import { ROUTE_A_SOURCES } from "@/features/sources/route-a-sources";
import { SOURCE_TYPE_LABELS } from "@/features/intake/source-type-labels";
import { pipelineStateLabel } from "@/features/sources/source-files";
import { conceptByCode } from "@/features/processing/concepts";
import { familyForSource } from "@/features/processing/families";
import { dayLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import { BackLink } from "@/components/workspace/back-link";
import { ProcessButton } from "@/components/interaction/process-button";
import "@/components/ui/ui.css";
import "@/components/business/business.css";
import "@/components/interaction/interaction.css";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const CHECK_TEXT: Record<string, string> = {
  required_fields: "שורות עם כל שדות החובה", not_executed_transfers: "העברות שלא בוצעו (לא נספרות)", net_plus_vat_equals_gross: "נטו + מע״מ = סכום כולל",
  tax_id_structure: "מבנה מספר עוסק", balance_continuity: "רצף יתרות", document_role: "סוג מסמך מוגדר", invoice_receipt_duplicate_candidates: "חשבונית וקבלה של אותה עסקה",
  statement_totals: "סכום העסקאות שווה לסה״כ החיוב בדף",
};
const REASON_TEXT: Record<string, string> = {
  not_executed: "העברה שלא בוצעה", document_role_unmapped: "סוג מסמך ללא משמעות מאושרת", currency_unknown: "מטבע לא ידוע", family_not_promoted_yet: "משפחת מסמך שעדיין לא נכנסת לתמונה",
};
const reasonText = (k: string) => REASON_TEXT[k] ?? (k.startsWith("missing:") ? `חסר שדה: ${k.slice(8)}` : k.startsWith("role_not_counted:") ? "מסמך שאינו נספר כהכנסה/הוצאה (קבלה, חשבון עסקה או זיכוי)" : k.startsWith("two_digit_year") ? "שנה דו־ספרתית שלא אושרה" : k.startsWith("unmapped_value") ? "ערך שלא נקבעה משמעותו" : k.startsWith("unparseable") ? "ערך שלא ניתן לפענח" : k.startsWith("precision") ? "סכום עם יותר משתי ספרות אחרי הנקודה" : k);
function orderedConcepts(seen: string[], sourceType: string) {
  const expected = familyForSource(sourceType)?.expected ?? [];
  return [...expected.filter((c) => seen.includes(c)), ...seen.filter((c) => !expected.includes(c))];
}
const VIA_TEXT: Record<string, string> = { document_adapter: "זוהה כמסמך מוכר", approved_mapping: "לפי תשובות שנתת בעבר", semantic: "הובן אוטומטית", unresolved: "ממתין לתשובה" };
const SUBTYPE_TEXT: Record<string, string> = {
  current_account_transaction_statement: "תדפיס עו״ש עם תנועות", annual_summary_report: "דוח בנק שנתי / מסכם (עובדות ויתרה, בלי תנועות)",
  monthly_statement: "דף חיוב חודשי של כרטיס", pdf_transaction_table: "טבלת עסקאות ב־PDF", transaction_export: "ייצוא תנועות",
  income_export: "ייצוא הכנסות", expenses_export: "ייצוא הוצאות", income_pdf_report: "דוח הכנסות (PDF)", expenses_pdf_report: "דוח הוצאות (PDF)",
  documents_export: "ייצוא מסמכים", documents_pdf_report: "דוח מסמכים (PDF)", ledger_export: "ייצוא הנהלת חשבונות", undetermined: "לא נקבע — המסמך אינו מראה תנועות או עובדות מתוארכות",
};
function tone(s: string) { return s === "failed" ? "err" : s === "needs_review" ? "warn" : s === "verified" ? "ok" : "info"; }

// File screen (22B §68, §70): processing path, what was read, what entered the picture, what is waiting and why.
export default async function FileDetailPage({ params }: PageProps<"/sources/files/[fileId]">) {
  const { fileId } = await params;
  const f = await getFileDetail(fileId);
  if (!f) notFound();
  const src = ROUTE_A_SOURCES.find((s) => s.sourceTypes.includes(f.sourceType));
  const back = src ? { href: `/sources/${src.kind}`, label: `חזרה ל${src.label}` } : { href: "/sources/other", label: "חזרה למקור נוסף" };
  const s = f.document?.summary ?? null;
  const state = f.state;
  const und = s?.understanding ?? null;
  const openQuestions = (und?.tables ?? []).reduce((n, t) => n + (t.via === "unresolved" ? t.questions.length : 0), 0);
  // a queued / running job (e.g. a re-read after answering questions) means the shown run is about to be replaced
  const jobActive = ["queued", "running", "retry_wait"].includes(f.job?.status ?? "");
  const busy = jobActive || (!["needs_review", "failed", "verified", "duplicate"].includes(state) && f.job?.status !== "failed");

  return (
    <div className="ws">
      <BackLink href={back.href} label={back.label} />
      <header className="ws-header">
        <div><p className="ws-eyebrow">קובץ מקור · {SOURCE_TYPE_LABELS[f.sourceType] ?? f.sourceType}</p><h1 className="ws-title file-title">{f.name}</h1></div>
        <span className={`badge badge--${tone(state)}`} data-testid="file-state">{jobActive ? "בעיבוד" : state === "verified" ? "עובד ונבדק" : pipelineStateLabel(state)}</span>
      </header>

      {s?.needsMapping && !jobActive ? (
        <section className="card callout" data-testid="needs-mapping">
          <h2 className="card-title">{openQuestions ? `נשארו ${openQuestions === 1 ? "שאלה אחת" : `${openQuestions} שאלות`} פתוחות` : "נדרשת השלמה"}</h2>
          <p className="card-sub">הקובץ נקרא ונשמר במלואו ({s.rows} שורות), ורוב מה שבו הובן אוטומטית. רק מה שבאמת עמום ממתין לתשובה שלך. התשובה תישמר, וקבצים הבאים באותו מבנה ייקראו בלי לשאול שוב.</p>
          <Link href={`/sources/files/${f.id}/mapping`} className="btn btn-primary">לענות על השאלות</Link>
        </section>
      ) : null}
      {s?.reason === "visual_reading_required" ? (
        <section className="card callout"><h2 className="card-title">נדרשת קריאה חזותית</h2><p className="card-sub">זה קובץ סרוק או תמונה בלי שכבת טקסט. הוא שמור, וממתין למסלול הקריאה החזותית (OCR). לא נוצרו ממנו נתונים כדי לא לנחש.</p></section>
      ) : null}
      {f.job?.status === "failed" || state === "failed" ? (
        <section className="card callout callout--err"><h2 className="card-title">העיבוד נכשל</h2><p className="card-sub">הקובץ המקורי שמור ולא נפגע{f.job?.error ? ` (קוד: ${f.job.error})` : ""}. אפשר לנסות שוב.</p><ProcessButton fileId={f.id} label="נסי שוב" /></section>
      ) : null}
      {!f.document && !f.isDuplicate && !busy ? <section className="card"><p className="card-sub">הקובץ עוד לא עובד.</p><ProcessButton fileId={f.id} label="להתחיל עיבוד" /></section> : null}
      {busy ? <p className="card muted-note" role="status">הקובץ בעיבוד. אפשר להמשיך לעבוד — רענני את המסך בעוד כמה שניות.</p> : null}

      {s && s.rows !== undefined && !jobActive ? (
        <section aria-labelledby="result" className="file-section">
          <h2 id="result" className="section-title">מה נכנס לתמונה</h2>
          <div className="metrics">
            <div className="card metric"><span className="metric-label">שורות שנקראו</span><span className="metric-value num">{s.rows}</span><span className="metric-foot">{s.dataRows} שורות נתונים</span></div>
            <div className="card metric"><span className="metric-label">נכנסו לתמונה</span><span className="metric-value num" data-testid="promoted">{(s.promotedTransactions ?? 0) + (s.promotedDocuments ?? 0)}</span><span className="metric-foot">{s.promotedTransactions ? `${s.promotedTransactions} תנועות` : ""}{s.promotedDocuments ? `${s.promotedDocuments} מסמכים` : ""}</span></div>
            <div className="card metric"><span className="metric-label">לא נכנסו</span><span className="metric-value num">{s.notPromoted ?? 0}</span><span className="metric-foot">נשמרו, עם סיבה</span></div>
            {s.reconciliationCandidates ? <Link href="/review" className="card metric metric-link"><span className="metric-label">התאמות מוצעות</span><span className="metric-value num">{s.reconciliationCandidates}</span><span className="metric-foot">ממתינות להחלטתך</span></Link> : null}
          </div>
          {s.notPromotedReasons && Object.keys(s.notPromotedReasons).length ? (
            <ul className="card attention-list">{Object.entries(s.notPromotedReasons).map(([k, v]) => <li key={k} className="attention-item">{reasonText(k)}: <span className="num">{v}</span></li>)}</ul>
          ) : null}
          {s.checks?.length ? (
            <ul className="card check-list" data-testid="checks">{s.checks.map((c) => <li key={c.code} className="check-row"><span>{CHECK_TEXT[c.code] ?? c.code}</span><span className={`badge badge--${c.status === "passed" ? "ok" : c.status === "warned" ? "warn" : "err"}`}>{c.status === "passed" ? "תקין" : c.status === "warned" ? `לבדיקה (${c.detail})` : `נכשל (${c.detail})`}</span></li>)}</ul>
          ) : null}
        </section>
      ) : null}

      {s?.statement ? (
        <section aria-labelledby="stmt" className="file-section">
          <h2 id="stmt" className="section-title">פרטי הדף</h2>
          <div className="card trust-grid" data-testid="statement">
            <span>מנפיק: {s.statement.issuer}{s.statement.cardLast4 ? ` · כרטיס המסתיים ב־${s.statement.cardLast4}` : ""}</span>
            <span>דף חיוב ל־<span className="num">{dayLabel(s.statement.statementDate)}</span></span>
            <span>מסגרת אשראי: <Amount value={s.statement.creditLimit} /> <span className="muted">(התחייבות אפשרית, לא כסף זמין)</span></span>
            <span>מועד החיוב הבא: <span className="num">{dayLabel(s.statement.nextChargeDate)}</span></span>
            {s.statement.totals.map((t) => <span key={t.chargeDate}>חיוב ל־<span className="num">{dayLabel(t.chargeDate)}</span>: <Amount value={t.total} /></span>)}
          </div>
        </section>
      ) : null}

      {und && (und.tables.length || und.bankBalance || und.facts.length || und.route) ? (
        <section aria-labelledby="how" className="file-section">
          <h2 id="how" className="section-title">איך המערכת הבינה את הקובץ</h2>
          {und.route ? (
            <div className="card trust-grid" data-testid="processing-route">
              <span>סוג המסמך: <strong>{SUBTYPE_TEXT[und.route.subtype] ?? und.route.subtype}</strong></span>
              <span className="muted">קריאה: {und.route.reader} · קריאה חזותית: לא נדרשה (יש שכבת טקסט)</span>
              <details className="raw-details">
                <summary className="muted">כללי Skills שהופעלו על הקובץ</summary>
                <ul className="check-list">{und.route.skills.map((k) => <li key={k.skill} className="check-row"><span dir="ltr">{k.skill}</span><span className={`badge badge--${k.applied ? "ok" : "neutral"}`}>{k.applied ? "הופעל" : "לא הופעל"}</span></li>)}</ul>
              </details>
            </div>
          ) : null}
          {und.bankBalance ? (
            <div className="card trust-grid" data-testid="reported-balance">
              <span>יתרה מדווחת בחשבון: <Amount value={{ minor: und.bankBalance.minor, currency: und.bankBalance.currency }} /> נכון ל־<span className="num">{dayLabel(und.bankBalance.asOf)}</span></span>
              <span className="muted">מקור: „{und.bankBalance.label}” בשורה {und.bankBalance.line} של המסמך</span>
            </div>
          ) : null}
          {und.tables.map((t) => (
            <details key={t.sheet} className="card raw-details" data-testid="understood-table">
              <summary className="card-title">{t.sheet} · {t.dataRows} שורות · {VIA_TEXT[t.via]}</summary>
              {t.decisions.length ? (
                <ul className="check-list">{t.decisions.filter((d) => d.header || d.concept).map((d) => <li key={d.index} className="check-row"><span>{d.header || `עמודה ${d.index + 1}`} → {d.concept ? conceptByCode(d.concept)?.label ?? d.concept : "לא רלוונטי"}</span><span className="muted">{d.basis}</span></li>)}</ul>
              ) : null}
              {t.assumptions.length ? <ul>{t.assumptions.map((a, k) => <li key={k} className="muted-note">הנחה: {a}</li>)}</ul> : null}
            </details>
          ))}
          {und.facts.length ? (
            <details className="card raw-details">
              <summary className="card-title">נתונים שהמסמך מצהיר עליהם{und.factsAsOf ? ` (נכון ל־${dayLabel(und.factsAsOf)})` : ""}</summary>
              <ul className="check-list">{und.facts.map((x, k) => <li key={k} className="check-row"><span>{x.label}</span><span className="num">{x.value}</span></li>)}</ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {f.entities.length ? (
        <section aria-labelledby="understood" className="file-section">
          <h2 id="understood" className="section-title">מה המערכת הבינה מהקובץ ({f.entities.length})</h2>
          <div className="table-scroll card">
            <table className="data-table" data-testid="entities">
              <thead><tr>{orderedConcepts(f.entityConcepts, f.sourceType).map((c) => <th key={c} scope="col">{conceptByCode(c)?.label ?? c}</th>)}</tr></thead>
              <tbody>
                {f.entities.map((e) => (
                  <tr key={`${e.page}-${e.row}`}>{orderedConcepts(f.entityConcepts, f.sourceType).map((c) => <td key={c} className={conceptByCode(c)?.dataType === "money" || conceptByCode(c)?.dataType === "date" ? "num" : undefined}>{e.values[c] ?? ""}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {f.runs.length ? (
        <section aria-labelledby="timeline" className="file-section">
          <h2 id="timeline" className="section-title">מסלול העיבוד</h2>
          <ol className="card timeline">{f.runs.map((r, i) => <li key={i}><span className="num muted">{timeFmt.format(new Date(r.at))}</span> {pipelineStateLabel(r.to)}</li>)}</ol>
        </section>
      ) : null}

      {f.records.length ? (
        <section aria-label="תוכן הקובץ המקורי" className="file-section">
          <details className="raw-details" open={!f.entities.length}>
          <summary className="section-title">תוכן הקובץ המקורי, שורה אחר שורה</summary>
          <div className="table-scroll card">
            <table className="data-table" data-testid="file-rows">
              <tbody>
                {f.records.slice(0, 300).map((r) => (
                  <tr key={`${r.sheet}-${r.rowNumber}`} className={r.kind === "header" ? "row-summary" : undefined}>
                    <td className="num muted">{r.page ? `ע׳ ${r.page} · ` : ""}{r.rowNumber}</td>
                    {r.cells.map((c, i) => <td key={i}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {f.records.length > 300 || f.recordsTruncated ? <p className="muted-note">מוצגות 300 השורות הראשונות. כל השורות נשמרו.</p> : null}
          </details>
        </section>
      ) : null}
    </div>
  );
}
