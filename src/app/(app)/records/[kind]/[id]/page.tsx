import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecord } from "@/features/picture/record";
import { conceptByCode } from "@/features/processing/concepts";
import { dayLabel } from "@/features/picture/format";
import { SOURCE_TYPE_LABELS } from "@/features/intake/source-type-labels";
import { Amount } from "@/components/ui/amount";
import { BackLink } from "@/components/workspace/back-link";
import { safeBack } from "@/features/picture/transactions-query";
import "@/components/ui/ui.css";
import "@/components/business/business.css";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { transaction: "תנועה", income: "הכנסה לפי מסמך", expense: "הוצאה לפי מסמך" };
const RECON: Record<string, string> = { unmatched: "ללא התאמה", candidate: "התאמה מוצעת — ממתינה להחלטתך", matched: "הותאם", rejected: "התאמה נדחתה", partial: "התאמה חלקית", needs_review: "דורש בדיקה" };
const RECON_TYPE: Record<string, string> = { card_settlement: "חיוב כרטיס מול עסקאות הכרטיס", payment_app_funding: "מימון תשלום bit", internal_transfer: "העברה בין חשבונותייך" };

// Record → Evidence → Source row (chapter 5 §22; 18C): what the number is, where it was read, and the original cells.
export default async function RecordPage({ params, searchParams }: PageProps<"/records/[kind]/[id]">) {
  const { kind, id } = await params;
  // return to the exact list / drill-down the record was opened from (filters, sort, page kept — readiness ui-ux §3)
  const back = safeBack((await searchParams).back) ?? (kind === "transaction" ? "/transactions" : "/snapshot");
  const backLabel = back.startsWith("/transactions") ? "חזרה לתנועות" : back.startsWith("/snapshot/details") ? "חזרה לפירוט" : back.startsWith("/snapshot") ? "חזרה לתמונת המצב" : back.startsWith("/review") ? "חזרה לתור הבדיקה" : "חזרה";
  const r = await getRecord(kind, id);
  if (!r) notFound();
  return (
    <div className="ws">
      <BackLink href={back} label={backLabel} />
      <header className="ws-header">
        <div><p className="ws-eyebrow">{KIND[r.kind]}</p><h1 className="ws-title">פרטי הרשומה</h1></div>
        {r.reconciliation ? <span className={`badge badge--${r.reconciliation.status === "matched" ? "ok" : r.reconciliation.status === "candidate" ? "warn" : "neutral"}`}>{RECON[r.reconciliation.status] ?? r.reconciliation.status}</span> : null}
      </header>
      <section className="card">
        <dl className="field-list">
          {r.fields.filter((f) => f.value || f.money !== undefined).map((f) => (
            <div key={f.label} className="field-list-row"><dt>{f.label}</dt><dd>{f.money !== undefined ? <Amount value={f.money ?? null} /> : /^\d{4}-\d{2}-\d{2}$/.test(f.value ?? "") ? <span className="num">{dayLabel(f.value)}</span> : f.value}</dd></div>
          ))}
          {r.reconciliation?.type ? <div className="field-list-row"><dt>סוג ההתאמה</dt><dd>{RECON_TYPE[r.reconciliation.type] ?? r.reconciliation.type}</dd></div> : null}
        </dl>
      </section>

      <section className="file-section" aria-labelledby="src">
        <h2 id="src" className="section-title">מאיפה זה הגיע</h2>
        {r.file ? (
          <p className="card">
            קובץ <Link href={`/sources/files/${r.file.id}`} className="file-link">{r.file.name}</Link> · {SOURCE_TYPE_LABELS[r.file.sourceType] ?? r.file.sourceType}
            {r.evidence[0]?.row ? <> · שורה <span className="num">{r.evidence[0].row}</span>{r.evidence[0].sheet ? <> בגיליון {r.evidence[0].sheet}</> : null}</> : null}
          </p>
        ) : <p className="card muted-note">לא נמצא קובץ מקור מקושר.</p>}
        {r.sourceRow ? (
          <div className="table-scroll card">
            <table className="data-table" data-testid="source-row">
              <thead><tr><th scope="col">עמודה בקובץ</th><th scope="col">משמעות</th><th scope="col">הערך כפי שנכתב</th></tr></thead>
              <tbody>
                {r.sourceRow.observations.map((o, i) => (
                  <tr key={i}><td>{o.header || "—"}</td><td>{conceptByCode(o.concept)?.label ?? (o.concept === "needs_mapping" ? "טרם מופתה" : "טקסט")}</td><td>{o.original}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {r.evidence.length ? <p className="muted-note">ראיה: נקרא בשיטת {r.evidence[0].method === "parser" ? "קריאה דטרמיניסטית" : r.evidence[0].method}, גרסה {r.evidence[0].version}.</p> : null}
      </section>
    </div>
  );
}
