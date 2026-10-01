import Link from "next/link";
import { notFound } from "next/navigation";
import { getFileDetail } from "@/features/processing/file-detail";
import { ROUTE_A_SOURCES } from "@/features/sources/route-a-sources";
import { SOURCE_TYPE_LABELS } from "@/features/intake/source-type-labels";
import { pipelineStateLabel } from "@/features/sources/source-files";
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
};
const REASON_TEXT: Record<string, string> = {
  not_executed: "העברה שלא בוצעה", document_role_unmapped: "סוג מסמך ללא משמעות מאושרת", currency_unknown: "מטבע לא ידוע", family_not_promoted_yet: "משפחת מסמך שעדיין לא נכנסת לתמונה",
};
const reasonText = (k: string) => REASON_TEXT[k] ?? (k.startsWith("missing:") ? `חסר שדה: ${k.slice(8)}` : k.startsWith("role_not_counted:") ? "מסמך שאינו נספר כהכנסה/הוצאה (קבלה, חשבון עסקה או זיכוי)" : k.startsWith("two_digit_year") ? "שנה דו־ספרתית שלא אושרה" : k.startsWith("unmapped_value") ? "ערך שלא נקבעה משמעותו" : k.startsWith("unparseable") ? "ערך שלא ניתן לפענח" : k.startsWith("precision") ? "סכום עם יותר משתי ספרות אחרי הנקודה" : k);
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
  const busy = !["needs_review", "failed", "verified", "duplicate"].includes(state) && f.job?.status !== "failed";

  return (
    <div className="ws">
      <BackLink href={back.href} label={back.label} />
      <header className="ws-header">
        <div><p className="ws-eyebrow">קובץ מקור · {SOURCE_TYPE_LABELS[f.sourceType] ?? f.sourceType}</p><h1 className="ws-title file-title">{f.name}</h1></div>
        <span className={`badge badge--${tone(state)}`} data-testid="file-state">{state === "verified" ? "עובד ונבדק" : pipelineStateLabel(state)}</span>
      </header>

      {s?.needsMapping ? (
        <section className="card callout" data-testid="needs-mapping">
          <h2 className="card-title">נדרש אישור מיפוי</h2>
          <p className="card-sub">הקובץ נקרא ונשמר במלואו ({s.rows} שורות), אבל המערכת לא מכירה עדיין את מבנה העמודות שלו. אשרי פעם אחת מה כל עמודה אומרת — המיפוי יישמר לקבצים הבאים באותו מבנה.</p>
          <Link href={`/sources/files/${f.id}/mapping`} className="btn btn-primary">למסך המיפוי</Link>
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

      {s && !s.needsMapping && s.rows !== undefined ? (
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
          {f.document?.version?.includes("+adapter:") ? <p className="muted-note">נקרא לפי המיפוי שאישרת. <Link href={`/sources/files/${f.id}/mapping`} className="file-link">לעדכן מיפוי</Link></p> : null}
        </section>
      ) : null}

      {f.runs.length ? (
        <section aria-labelledby="timeline" className="file-section">
          <h2 id="timeline" className="section-title">מסלול העיבוד</h2>
          <ol className="card timeline">{f.runs.map((r, i) => <li key={i}><span className="num muted">{timeFmt.format(new Date(r.at))}</span> {pipelineStateLabel(r.to)}</li>)}</ol>
        </section>
      ) : null}

      {f.records.length ? (
        <section aria-labelledby="rows" className="file-section">
          <h2 id="rows" className="section-title">תוכן הקובץ כפי שנקרא</h2>
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
        </section>
      ) : null}
    </div>
  );
}
