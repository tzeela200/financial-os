"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMapping } from "@/features/processing/actions";
import type { MappingContext } from "@/features/processing/file-detail";

// Import Mapping (21D §12): "המערכת מציעה התאמה כאשר אפשר, אך אינה ממציאה משמעות לשדה לא ברור". Shows each column with
// sample values; suggestions come only from mappings Tzeela approved before. Only the decisions the chosen columns
// actually require are asked (value meanings, sign, currency, two-digit years). Nothing is guessed.

type ConceptOption = { code: string; label: string; dataType: string };
type Props = { ctx: MappingContext; concepts: ConceptOption[] };

const ROLE_OPTIONS = [
  ["tax_invoice", "חשבונית מס"], ["invoice_receipt", "חשבונית מס / קבלה"], ["receipt", "קבלה"],
  ["transaction_invoice", "חשבון עסקה / אישור תשלום"], ["credit_note", "חשבונית זיכוי"], ["other", "אחר"],
] as const;
const PM_OPTIONS = [["balance", "יתרה באפליקציה"], ["credit_card", "כרטיס אשראי"], ["bank_account", "חשבון בנק"], ["cash", "מזומן"], ["other", "אחר"]] as const;

export function MappingForm({ ctx, concepts }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [map, setMap] = useState<Record<number, string>>(() => Object.fromEntries(ctx.columns.filter((c) => c.suggested).map((c) => [c.index, c.suggested!])));
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [twoDigit, setTwoDigit] = useState(false);
  const [amountSign, setAmountSign] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");

  const byConcept = useMemo(() => Object.fromEntries(Object.entries(map).filter(([, v]) => v).map(([k, v]) => [v, Number(k)])), [map]);
  const col = (concept: string) => ctx.columns.find((c) => c.index === byConcept[concept]);
  const conceptLabel = (code: string) => concepts.find((c) => c.code === code)?.label ?? code;
  const used = new Set(Object.values(map).filter(Boolean));
  const dateCols = ctx.columns.filter((c) => map[c.index] && concepts.find((x) => x.code === map[c.index])?.dataType === "date");
  const needsTwoDigit = dateCols.some((c) => c.twoDigitYear);
  const hasAmount = ["amount", "charge_amount"].some((k) => byConcept[k] !== undefined);
  const hasDebitCredit = byConcept.debit_amount !== undefined || byConcept.credit_amount !== undefined;
  const needsSign = hasAmount && !hasDebitCredit && !ctx.side;
  const hasCurrencyCol = byConcept.currency !== undefined;
  const hasMoney = ctx.columns.some((c) => map[c.index] && concepts.find((x) => x.code === map[c.index])?.dataType === "money");
  const valueMaps: { key: string; concept: string; title: string; options: readonly (readonly [string, string])[] }[] = [];
  if (col("direction")) valueMaps.push({ key: "direction", concept: "direction", title: "מה כל ערך בעמודת הכיוון אומר?", options: [["credit", "כניסה (זכות / התקבל)"], ["debit", "יציאה (חובה / נשלח)"]] });
  if (col("status") && ctx.sourceType === "p2p_payment") valueMaps.push({ key: "status", concept: "status", title: "אילו סטטוסים הם העברות שבוצעו בפועל?", options: [["executed", "בוצע — כסף עבר"], ["not_executed", "לא בוצע — כסף לא עבר"]] });
  const roleCol = col("document_type_code") ?? col("document_type");
  if (roleCol && ctx.side) valueMaps.push({ key: "documentRole", concept: roleCol === col("document_type_code") ? "document_type_code" : "document_type", title: "מה סוג כל מסמך?", options: ROLE_OPTIONS });
  if (col("payment_method") && ctx.sourceType === "p2p_payment") valueMaps.push({ key: "paymentMethod", concept: "payment_method", title: "מאיפה מומן כל תשלום?", options: PM_OPTIONS });

  const missingValues = valueMaps.some((v) => col(v.concept)!.distinct.some((d) => !values[v.key]?.[d]));
  const canSubmit = used.size > 0 && !missingValues && (!needsSign || amountSign) && (!hasMoney || hasCurrencyCol || currency);

  const submit = () => start(async () => {
    const r = await saveMapping({
      fileId: ctx.fileId, sheet: ctx.sheet, headerRow: ctx.headerRow,
      columns: ctx.columns.map((c) => ({ index: c.index, concept: map[c.index] || null })),
      dateFormat: needsTwoDigit && twoDigit ? "dmy_two_digit_year_20" : "dmy",
      amountSign: (hasDebitCredit ? "signed_negative_is_debit" : ctx.side ? "signed_negative_is_debit" : amountSign || "unsigned_use_direction") as "signed_negative_is_debit",
      currencyDefault: hasCurrencyCol ? null : currency === "ILS" ? "ILS" : null,
      values: Object.fromEntries(Object.entries(values).filter(([k]) => valueMaps.some((v) => v.key === k))),
    });
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok) setTimeout(() => router.push(`/sources/files/${ctx.fileId}`), 1200);
  });

  return (
    <div className="mapping">
      <section className="card">
        <h2 className="card-title">1. מה כל עמודה אומרת</h2>
        <p className="card-sub">שורת הכותרת היא שורה {ctx.headerRow}. עמודה שלא תבחרי לה משמעות לא תיזרק — היא תישמר כפי שהיא כ„לא ממופה”.</p>
        <ul className="mapping-columns">
          {ctx.columns.map((c) => (
            <li key={c.index} className="mapping-col">
              <div className="mapping-col-head">
                <span className="mapping-col-name">{c.header || `עמודה ${c.index + 1}`}</span>
                <span className="mapping-samples">{c.samples.map((s, i) => <span key={i} className="sample">{s}</span>)}</span>
              </div>
              <label className="field">
                <span className="visually-hidden">משמעות העמודה {c.header}</span>
                <select className="field-input" value={map[c.index] ?? ""} onChange={(e) => setMap({ ...map, [c.index]: e.target.value })} data-testid={`map-col-${c.index}`}>
                  <option value="">לא רלוונטי — לשמור כפי שהוא</option>
                  {concepts.filter((o) => ctx.expected.includes(o.code)).map((o) => <option key={o.code} value={o.code} disabled={used.has(o.code) && map[c.index] !== o.code}>{o.label}</option>)}
                </select>
              </label>
              {c.suggestedFrom && map[c.index] === c.suggested ? <span className="muted-note">הוצע לפי {c.suggestedFrom}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      {needsTwoDigit ? (
        <section className="card">
          <h2 className="card-title">2. תאריכים עם שנה בת שתי ספרות</h2>
          <p className="card-sub">בעמודת התאריך השנה כתובה בשתי ספרות (למשל 02.01.25). המערכת לא משלימה שנה בעצמה.</p>
          <label className="check"><input type="checkbox" checked={twoDigit} onChange={(e) => setTwoDigit(e.target.checked)} /> השנים בקובץ הזה הן 20XX (למשל 25 = 2025)</label>
        </section>
      ) : null}

      {needsSign ? (
        <section className="card">
          <h2 className="card-title">כיוון הסכום</h2>
          <div className="radio-group" role="radiogroup">
            {col("direction") ? <label className="check"><input type="radio" name="sign" checked={amountSign === "unsigned_use_direction"} onChange={() => setAmountSign("unsigned_use_direction")} /> הכיוון נקבע לפי עמודת הכיוון</label> : null}
            <label className="check"><input type="radio" name="sign" checked={amountSign === "signed_negative_is_debit"} onChange={() => setAmountSign("signed_negative_is_debit")} /> סכום במינוס הוא יציאה, סכום חיובי הוא כניסה</label>
            <label className="check"><input type="radio" name="sign" checked={amountSign === "signed_positive_is_debit"} onChange={() => setAmountSign("signed_positive_is_debit")} /> סכום חיובי הוא חיוב / יציאה (כמו בדף כרטיס אשראי)</label>
          </div>
        </section>
      ) : null}

      {hasMoney && !hasCurrencyCol ? (
        <section className="card">
          <h2 className="card-title">מטבע</h2>
          <p className="card-sub">בקובץ אין עמודת מטבע.</p>
          <div className="radio-group" role="radiogroup">
            <label className="check"><input type="radio" name="cur" checked={currency === "ILS"} onChange={() => setCurrency("ILS")} /> כל הסכומים בקובץ בשקלים (₪)</label>
            <label className="check"><input type="radio" name="cur" checked={currency === "unknown"} onChange={() => setCurrency("unknown")} /> לא ידוע — לא להכניס סכומים לתמונה</label>
          </div>
        </section>
      ) : null}

      {valueMaps.map((v) => (
        <section key={v.key} className="card">
          <h2 className="card-title">{v.title}</h2>
          <p className="card-sub">עמודה: {conceptLabel(v.concept)}</p>
          <ul className="value-map">
            {col(v.concept)!.distinct.map((d) => (
              <li key={d} className="value-map-row">
                <span className="sample">{d}</span>
                <select className="field-input" value={values[v.key]?.[d] ?? ""} onChange={(e) => setValues({ ...values, [v.key]: { ...(values[v.key] ?? {}), [d]: e.target.value } })}>
                  <option value="">בחרי…</option>
                  {v.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="mapping-submit">
        <button type="button" className="btn btn-primary" disabled={!canSubmit || pending} onClick={submit} data-testid="save-mapping">{pending ? "שומר…" : "לאשר מיפוי ולקרוא את הקובץ"}</button>
        {!canSubmit && used.size > 0 ? <span className="muted-note">יש להשלים את כל ההחלטות שלמעלה.</span> : null}
        {message ? <p role="status" className={message.ok ? "muted-note" : "error-state"}>{message.text}</p> : null}
      </div>
    </div>
  );
}
