"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMapping } from "@/features/processing/actions";
import type { MappingContext } from "@/features/processing/file-detail";
import type { MappingAnswer } from "@/features/processing/mapping-answers";

// Mapping questions (21D §12; chapter 5 §21: "Mapping הוא fallback רק למה שבאמת עמום"). The engine already decided
// everything it could — those decisions are shown read-only with their basis. Tzeela answers only the open questions;
// the server re-runs the understanding, applies the answers and saves an adapter for the next files of this structure.

type ConceptOption = { code: string; label: string; dataType: string };
type Props = { ctx: MappingContext; concepts: ConceptOption[] };
type ColumnAns = Extract<MappingAnswer, { kind: "column" }>;

const ROLE_OPTIONS = [
  ["tax_invoice", "חשבונית מס"], ["invoice_receipt", "חשבונית מס / קבלה"], ["receipt", "קבלה"],
  ["transaction_invoice", "חשבון עסקה / אישור תשלום (לא חשבונית מס)"], ["credit_note", "חשבונית זיכוי"], ["other", "אחר"],
] as const;
const VALUE_OPTIONS: Record<string, readonly (readonly [string, string])[]> = {
  direction: [["credit", "כניסה (זכות / התקבל)"], ["debit", "יציאה (חובה / נשלח)"]],
  status: [["executed", "בוצע — כסף עבר"], ["not_executed", "לא בוצע — כסף לא עבר"]],
  document_type: ROLE_OPTIONS,
  payment_method: [["balance", "יתרה באפליקציה"], ["credit_card", "כרטיס אשראי"], ["bank_account", "חשבון בנק"], ["cash", "מזומן"], ["other", "אחר"]],
};
const VALUE_TITLE: Record<string, string> = {
  direction: "מה כל ערך בעמודת הכיוון אומר?", status: "אילו סטטוסים הם העברות שבוצעו בפועל?",
  document_type: "מה סוג כל מסמך?", payment_method: "מאיפה מומן כל תשלום?",
};
const SIGN_OPTIONS = [
  ["signed_negative_is_debit", "סכום במינוס הוא יציאה, סכום חיובי הוא כניסה"],
  ["signed_positive_is_debit", "סכום חיובי הוא חיוב / יציאה (כמו בדף כרטיס אשראי)"],
  ["all_debit", "כל השורות בקובץ הן יציאות (תשלומים / העברות שיצאו)"],
  ["all_credit", "כל השורות בקובץ הן כניסות (תקבולים / העברות שנכנסו)"],
] as const;

export function MappingForm({ ctx, concepts }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [answers, setAnswers] = useState<Record<number, MappingAnswer>>({});
  const t = ctx.table!;
  const label = (code: string | null | undefined) => (code ? concepts.find((c) => c.code === code)?.label ?? code : "לא רלוונטי");
  const colName = (i: number) => t.decisions.find((d) => d.index === i)?.header || `עמודה ${i + 1}`;
  const set = (i: number, a: MappingAnswer) => setAnswers((prev) => ({ ...prev, [i]: a }));
  const col = (i: number) => (answers[i]?.kind === "column" ? (answers[i] as ColumnAns) : undefined);
  const valuesOf = (i: number) => (answers[i]?.kind === "values" ? (answers[i] as Extract<MappingAnswer, { kind: "values" }>).map : {});

  const complete = t.questions.every((q, i) => {
    const a = answers[i];
    if (!a || a.kind !== q.kind) return false;
    if (q.kind === "values") return q.unknown.every((v) => valuesOf(i)[v]);
    if (q.kind === "column" && q.columns.length > 1) return col(i)?.column != null;
    return true;
  });

  const submit = () => start(async () => {
    const r = await saveMapping({ fileId: ctx.fileId, sheet: t.sheet, answers: Object.fromEntries(Object.entries(answers)) });
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok) setTimeout(() => router.push(`/sources/files/${ctx.fileId}`), 1200);
  });

  return (
    <div className="mapping">
      {t.questions.map((q, i) => (
        <section key={i} className="card" data-testid={`question-${i}`}>
          {q.kind === "column" && q.columns.length > 1 ? (
            <>
              <h2 className="card-title">באיזו עמודה נמצא „{label(q.concept)}”?</h2>
              <p className="card-sub">כמה עמודות מתאימות באותה מידה. רק אחת מהן נכונה.</p>
              <div className="radio-group" role="radiogroup">
                {q.columns.map((c) => <label key={c} className="check"><input type="radio" name={`q${i}`} checked={col(i)?.column === c} onChange={() => set(i, { kind: "column", column: c, concept: q.concept ?? null })} /> {colName(c)}</label>)}
              </div>
            </>
          ) : q.kind === "column" && q.reason === "required_missing" ? (
            <>
              <h2 className="card-title">איפה בקובץ נמצא „{q.candidates.map(label).join(" / ")}”?</h2>
              <p className="card-sub">המערכת לא מצאה עמודה כזו בוודאות. אם אין כזו בקובץ — אפשר לומר זאת, והשורות יישארו לבדיקה.</p>
              <label className="field">
                <span className="visually-hidden">עמודה</span>
                <select className="field-input" data-testid={`q${i}-column`} value={col(i) ? String(col(i)!.column ?? "none") : ""} onChange={(e) => set(i, { kind: "column", column: e.target.value === "none" ? null : Number(e.target.value), concept: col(i)?.concept ?? q.concept ?? q.candidates[0] ?? null })}>
                  <option value="">בחרי…</option>
                  {t.decisions.map((d) => <option key={d.index} value={d.index}>{d.header || `עמודה ${d.index + 1}`}{d.sample?.length ? ` — ${d.sample.slice(0, 2).join(", ")}` : ""}</option>)}
                  <option value="none">אין עמודה כזו בקובץ</option>
                </select>
              </label>
              {q.candidates.length > 1 ? (
                <div className="radio-group" role="radiogroup">
                  {q.candidates.map((c) => <label key={c} className="check"><input type="radio" name={`q${i}c`} checked={col(i)?.concept === c} onChange={() => set(i, { kind: "column", column: col(i)?.column ?? null, concept: c })} /> {label(c)}</label>)}
                </div>
              ) : null}
            </>
          ) : q.kind === "column" ? (
            <>
              <h2 className="card-title">מה העמודה „{colName(q.columns[0])}” אומרת?</h2>
              <p className="card-sub">דוגמאות: {(t.decisions.find((d) => d.index === q.columns[0])?.sample ?? []).slice(0, 4).join(" · ") || "—"}</p>
              <div className="radio-group" role="radiogroup">
                {q.candidates.map((c) => <label key={c} className="check"><input type="radio" name={`q${i}`} checked={col(i)?.concept === c} onChange={() => set(i, { kind: "column", column: q.columns[0], concept: c })} /> {label(c)}</label>)}
                <label className="check"><input type="radio" name={`q${i}`} checked={col(i) !== undefined && col(i)!.concept === null} onChange={() => set(i, { kind: "column", column: q.columns[0], concept: null })} /> לא רלוונטי — לשמור כפי שהוא</label>
              </div>
            </>
          ) : q.kind === "values" ? (
            <>
              <h2 className="card-title">{VALUE_TITLE[q.concept]}</h2>
              <p className="card-sub">עמודה: {colName(q.column)}. רק ערכים שהמערכת לא זיהתה בוודאות.</p>
              <ul className="value-map">
                {q.unknown.map((v) => (
                  <li key={v} className="value-map-row">
                    <span className="sample">{v}</span>
                    <select className="field-input" value={valuesOf(i)[v] ?? ""} onChange={(e) => set(i, { kind: "values", map: { ...valuesOf(i), [v]: e.target.value } })}>
                      <option value="">בחרי…</option>
                      {VALUE_OPTIONS[q.concept].map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </>
          ) : q.kind === "currency" ? (
            <>
              <h2 className="card-title">באיזה מטבע הסכומים?</h2>
              <p className="card-sub">בקובץ אין עמודת מטבע וגם לא סימן מטבע ליד הסכומים.</p>
              <div className="radio-group" role="radiogroup">
                {[["ILS", "שקלים (₪)"], ["USD", "דולר ($)"], ["EUR", "אירו (€)"]].map(([c, l]) => <label key={c} className="check"><input type="radio" name={`q${i}`} checked={answers[i]?.kind === "currency" && (answers[i] as { currency: string | null }).currency === c} onChange={() => set(i, { kind: "currency", currency: c })} /> {l}</label>)}
                <label className="check"><input type="radio" name={`q${i}`} checked={answers[i]?.kind === "currency" && (answers[i] as { currency: string | null }).currency === null} onChange={() => set(i, { kind: "currency", currency: null })} /> לא ידוע — לא להכניס סכומים לתמונה</label>
              </div>
            </>
          ) : q.kind === "sign" ? (
            <>
              <h2 className="card-title">מה הכיוון של הסכומים?</h2>
              <p className="card-sub">הסכומים בקובץ בלי סימן מבחין ובלי עמודת כיוון, ולכן המערכת לא קובעת כיוון בעצמה.</p>
              <div className="radio-group" role="radiogroup">
                {SIGN_OPTIONS.map(([s, l]) => <label key={s} className="check"><input type="radio" name={`q${i}`} checked={answers[i]?.kind === "sign" && (answers[i] as { sign: string }).sign === s} onChange={() => set(i, { kind: "sign", sign: s })} /> {l}</label>)}
              </div>
            </>
          ) : (
            <>
              <h2 className="card-title">מה סוג המסמכים בקובץ?</h2>
              <p className="card-sub">אין בקובץ עמודת סוג מסמך. התשובה חלה על כל המסמכים בקובץ הזה ובקבצים הבאים באותו מבנה.</p>
              <label className="field">
                <span className="visually-hidden">סוג מסמך</span>
                <select className="field-input" value={answers[i]?.kind === "document_role_all" ? (answers[i] as { role: string }).role : ""} onChange={(e) => set(i, { kind: "document_role_all", role: e.target.value as (typeof ROLE_OPTIONS)[number][0] })}>
                  <option value="">בחרי…</option>
                  {ROLE_OPTIONS.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                </select>
              </label>
            </>
          )}
        </section>
      ))}

      <div className="mapping-submit">
        <button type="button" className="btn btn-primary" disabled={!complete || pending} onClick={submit} data-testid="save-mapping">{pending ? "שומר…" : "לאשר ולקרוא את הקובץ"}</button>
        {!complete ? <span className="muted-note">יש לענות על כל השאלות שלמעלה.</span> : null}
        {message ? <p role="status" className={message.ok ? "muted-note" : "error-state"}>{message.text}</p> : null}
      </div>

      <section className="card">
        <h2 className="card-title">מה המערכת כבר הבינה לבד</h2>
        <p className="card-sub">לא צריך לאשר את זה. ההחלטות מוצגות כדי שיהיה ברור על מה הן מבוססות.</p>
        <ul className="mapping-columns">
          {t.decisions.map((d) => (
            <li key={d.index} className="mapping-col">
              <div className="mapping-col-head">
                <span className="mapping-col-name">{d.header || `עמודה ${d.index + 1}`}</span>
                <span className="mapping-samples">{(d.sample ?? []).slice(0, 3).map((s, k) => <span key={k} className="sample">{s}</span>)}</span>
              </div>
              <span className="muted-note">{label(d.concept)}{d.concept ? ` · ${Math.round(d.score * 100)}%` : ""}</span>
            </li>
          ))}
        </ul>
        {t.assumptions.length ? <><h3 className="card-title">הנחות שנרשמו</h3><ul>{t.assumptions.map((a, k) => <li key={k} className="muted-note">{a}</li>)}</ul></> : null}
      </section>
    </div>
  );
}
