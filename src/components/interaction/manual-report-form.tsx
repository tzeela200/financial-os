"use client";

import { useState } from "react";
import { submitManualReport, type IntakeResult } from "@/features/intake/actions";

// Manual Entry Flow (21D §53; 18A §56; 18D §47): information that does not come from a document. Stored as
// user_report, unverified until a supporting source arrives (21B §92.10, 22B §86). Subjects = canonical 18A
// entities + unknown (DR-C); labels are Hebrew display names of those entities.
const SUBJECTS: { value: string; label: string }[] = [
  { value: "debts", label: "חוב" },
  { value: "obligations", label: "התחייבות" },
  { value: "payments", label: "תשלום" },
  { value: "expenses", label: "הוצאה" },
  { value: "income", label: "הכנסה" },
  { value: "receivables", label: "כסף לקבל" },
  { value: "loans", label: "הלוואה" },
  { value: "transactions", label: "תנועה" },
  { value: "accounts", label: "חשבון" },
  { value: "agreements", label: "הסכם או הסדר" },
  { value: "legal_cases", label: "תיק משפטי או גבייה" },
  { value: "events", label: "אירוע" },
  { value: "assets", label: "נכס או חיסכון" },
  { value: "credit_facilities", label: "מסגרת אשראי" },
  { value: "taxes", label: "מס" },
  { value: "government_records", label: "רשות או ביטוח לאומי" },
  { value: "unknown", label: "לא ידוע" },
];

export function ManualReportForm() {
  const [subject, setSubject] = useState("unknown");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IntakeResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await submitManualReport({ clientRequestId: crypto.randomUUID(), subjectType: subject, statement });
    setResult(r);
    if (r.ok) setStatement("");
    setBusy(false);
  }

  return (
    <form className="intake-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">על מה הדיווח</span>
        <select className="field-input" value={subject} onChange={(e) => setSubject(e.target.value)}>
          {SUBJECTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field-label">מה קרה</span>
        <textarea className="field-input field-textarea" value={statement} onChange={(e) => setStatement(e.target.value)} rows={5} required />
        <span className="field-help">כתבי בחופשיות, למשל: &quot;שילמתי 1,200 ₪ לרואה החשבון ב־15/09&quot;. הדיווח יסומן כ&quot;טרם אומת&quot; עד שיגיע מקור תומך.</span>
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || statement.trim() === ""}>{busy ? "שומרת…" : "שמירת הדיווח"}</button>
      {result ? <p className={result.ok ? "form-ok" : "form-error"} role="status" data-testid="manual-report-result">{result.message}</p> : null}
    </form>
  );
}
