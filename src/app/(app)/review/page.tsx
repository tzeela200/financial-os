import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAttentionItems } from "@/features/picture/attention";
import { dayLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import { CandidateDecision } from "@/components/interaction/candidate-decision";
import { AttentionList } from "@/components/business/attention-list";
import { EmptyState } from "@/components/ui/empty-state";
import { GitCompareArrows, CircleCheck, ArrowLeftRight } from "lucide-react";
import "@/components/ui/ui.css";
import "@/components/business/business.css";

export const dynamic = "force-dynamic";

const TYPE: Record<string, { title: string; explain: string }> = {
  card_settlement: { title: "חיוב כרטיס אשראי בבנק", explain: "החיוב בבנק שווה בדיוק לסך עסקאות הכרטיס באותו מועד חיוב. אם זה אותו חיוב, העסקאות ייספרו פעם אחת (בכרטיס) והחיוב בבנק לא ייספר שוב." },
  payment_app_funding: { title: "תשלום bit שמומן מכרטיס או מהבנק", explain: "אותו סכום הופיע בתשלום bit ובחיוב שמימן אותו. אם זה אותו תשלום, הוא ייספר פעם אחת." },
  internal_transfer: { title: "העברה בין חשבונות שלך", explain: "יציאה מחשבון אחד וכניסה לחשבון אחר שלך באותו סכום. אם זו העברה פנימית, היא לא תיחשב הכנסה ולא הוצאה." },
};

// Review Queue (22C; 18C §15): decisions only Tzeela can make — reconciliation candidates first, then data issues.
// Review Queue ≠ DLQ (18 V2 §10B): technical failures are not shown here as business decisions.
export default async function ReviewPage() {
  const supabase = await createClient();
  const [{ data: cands }, attention] = await Promise.all([
    supabase.from("match_candidates").select("id, candidate_type, left_ref, right_ref, score_breakdown_json, created_at").eq("status", "candidate").order("created_at").limit(100),
    getAttentionItems(),
  ]);
  const candidates = (cands ?? []) as { id: string; candidate_type: string; left_ref: { entity_id: string }; right_ref: { members?: string[] }; score_breakdown_json: { amount_minor?: string; currency?: string; charge_date?: string } }[];
  const ids = candidates.flatMap((c) => [c.left_ref.entity_id, ...(c.right_ref.members ?? [])]);
  const { data: txs } = ids.length ? await supabase.from("transactions").select("id, transaction_date, description_original, amount_minor, currency_code, direction, accounts!inner(account_name)").in("id", ids) : { data: [] };
  const tx = new Map(((txs ?? []) as unknown as { id: string; transaction_date: string; description_original: string | null; amount_minor: number; currency_code: string; direction: string; accounts: { account_name: string } }[]).map((t) => [t.id, t]));
  const others = attention.filter((a) => a.id !== "reconciliation");

  return (
    <div className="ws">
      <header className="ws-header"><div><h1 className="ws-title">תור בדיקה</h1><p className="ws-sub">החלטות שרק את יכולה לקבל. עד שתחליטי, הסכומים המעורבים מסומנים „בבדיקה” ולא נספרים פעמיים.</p></div></header>

      <section aria-labelledby="cands" className="file-section">
        <h2 id="cands" className="section-title">התאמות בין מקורות ({candidates.length})</h2>
        {candidates.length === 0 ? <EmptyState icon={CircleCheck} tone="calm" title="אין התאמות שממתינות להחלטה">כשהמערכת תמצא שני רישומים שאולי מתארים את אותה תנועה, הם יופיעו כאן להחלטתך.</EmptyState> : (
          <ul className="review-list" data-testid="candidates">
            {candidates.map((c) => {
              const left = tx.get(c.left_ref.entity_id);
              const right = (c.right_ref.members ?? []).map((id) => tx.get(id)).filter(Boolean);
              return (
                <li key={c.id} className="card review-item">
                  {/* Problem */}
                  <div className="review-head">
                    <span className="compact-icon compact-icon--warn" aria-hidden="true"><GitCompareArrows size={18} /></span>
                    <h3 className="card-title">{TYPE[c.candidate_type]?.title ?? c.candidate_type}</h3>
                    <span className="badge badge--warn">ממתין להחלטה</span>
                  </div>
                  {/* Why */}
                  <div className="review-why">
                    <span className="review-label">למה זה כאן</span>
                    <p className="card-sub">{TYPE[c.candidate_type]?.explain}</p>
                  </div>
                  {/* Comparison — each side opens to its own evidence */}
                  <div className="review-label">השוואה</div>
                  <div className="review-pair">
                    {left ? (
                      <Link href={`/records/transaction/${left.id}?back=%2Freview`} className="review-side review-side--link">
                        <span className="review-side-source">{left.accounts.account_name} · <span className="num">{dayLabel(left.transaction_date)}</span></span>
                        <span className="review-side-title"><bdi>{left.description_original ?? "ללא תיאור"}</bdi></span>
                        <span className="review-side-amount"><Amount value={{ minor: String(left.amount_minor), currency: left.currency_code }} /></span>
                      </Link>
                    ) : null}
                    <span className="review-vs" aria-hidden="true"><ArrowLeftRight size={18} /></span>
                    <div className="review-side">
                      <span className="review-side-source">{right.length > 1 ? <>{right.length} רשומות{c.score_breakdown_json.charge_date ? <> · מועד חיוב <span className="num">{dayLabel(c.score_breakdown_json.charge_date)}</span></> : null}</> : right[0] ? <>{right[0]!.accounts.account_name} · <span className="num">{dayLabel(right[0]!.transaction_date)}</span></> : ""}</span>
                      {right.length === 1 ? <Link href={`/records/transaction/${right[0]!.id}?back=%2Freview`} className="review-side-title file-link"><bdi>{right[0]!.description_original ?? "ללא תיאור"}</bdi></Link> : <span className="review-side-title">סה״כ</span>}
                      <span className="review-side-amount"><Amount value={c.score_breakdown_json.amount_minor && c.score_breakdown_json.currency ? { minor: c.score_breakdown_json.amount_minor, currency: c.score_breakdown_json.currency } : null} /></span>
                      {right.length > 1 ? (
                        <details className="raw-details" data-testid="candidate-members">
                          <summary className="file-link">הצגת {right.length} הרשומות</summary>
                          <ul className="check-list">{right.map((t) => <li key={t!.id} className="check-row"><Link href={`/records/transaction/${t!.id}?back=%2Freview`} className="file-link"><bdi>{t!.description_original ?? "ללא תיאור"}</bdi></Link><span className="num">{dayLabel(t!.transaction_date)} · <Amount value={{ minor: String(t!.amount_minor), currency: t!.currency_code }} /></span></li>)}</ul>
                        </details>
                      ) : null}
                    </div>
                  </div>
                  {/* Decision */}
                  <div className="review-decision">
                    <span className="review-label">ההחלטה שלך</span>
                    <CandidateDecision candidateId={c.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="issues" className="file-section">
        <h2 id="issues" className="section-title">נושאים נוספים ({others.length})</h2>
        {others.length === 0 ? <EmptyState icon={CircleCheck} tone="calm" title="אין נושאים פתוחים">קבצים שנכשלו, שאלות פתוחות וחריגות יופיעו כאן.</EmptyState> : (
          <AttentionList items={others} />
        )}
      </section>
    </div>
  );
}
