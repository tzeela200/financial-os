import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAttentionItems } from "@/features/picture/attention";
import { dayLabel } from "@/features/picture/format";
import { Amount } from "@/components/ui/amount";
import { CandidateDecision } from "@/components/interaction/candidate-decision";
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
        {candidates.length === 0 ? <p className="card muted-note">אין התאמות שממתינות להחלטה.</p> : (
          <ul className="review-list" data-testid="candidates">
            {candidates.map((c) => {
              const left = tx.get(c.left_ref.entity_id);
              const right = (c.right_ref.members ?? []).map((id) => tx.get(id)).filter(Boolean);
              return (
                <li key={c.id} className="card review-item">
                  <h3 className="card-title">{TYPE[c.candidate_type]?.title ?? c.candidate_type}</h3>
                  <p className="card-sub">{TYPE[c.candidate_type]?.explain}</p>
                  <div className="review-pair">
                    {left ? <Link href={`/records/transaction/${left.id}`} className="review-side"><span className="muted">{left.accounts.account_name} · {dayLabel(left.transaction_date)}</span><span>{left.description_original ?? "ללא תיאור"}</span><Amount value={{ minor: String(left.amount_minor), currency: left.currency_code }} /></Link> : null}
                    <div className="review-side">
                      <span className="muted">{right.length > 1 ? `${right.length} רשומות${c.score_breakdown_json.charge_date ? ` · מועד חיוב ${dayLabel(c.score_breakdown_json.charge_date)}` : ""}` : right[0] ? `${right[0]!.accounts.account_name} · ${dayLabel(right[0]!.transaction_date)}` : ""}</span>
                      {right.length === 1 ? <Link href={`/records/transaction/${right[0]!.id}`} className="file-link">{right[0]!.description_original ?? "ללא תיאור"}</Link> : <span>סה״כ</span>}
                      <Amount value={c.score_breakdown_json.amount_minor && c.score_breakdown_json.currency ? { minor: c.score_breakdown_json.amount_minor, currency: c.score_breakdown_json.currency } : null} />
                    </div>
                  </div>
                  <CandidateDecision candidateId={c.id} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="issues" className="file-section">
        <h2 id="issues" className="section-title">נושאים נוספים ({others.length})</h2>
        {others.length === 0 ? <p className="card muted-note">אין נושאים פתוחים.</p> : (
          <ul className="card attention-list">{others.map((a) => <li key={a.id} className={`attention-item tone-${a.tone}`}><Link href={a.href}>{a.text}</Link></li>)}</ul>
        )}
      </section>
    </div>
  );
}
