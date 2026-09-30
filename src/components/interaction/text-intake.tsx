"use client";

import { useState } from "react";
import { submitPastedText, type IntakeResult } from "@/features/intake/actions";

// Pasted / typed source text (18A §43 "TXT/MD — תכתובות/ניתוחים/הערות; מקור נשמר"; 21A §16, §20).
// The text is kept unchanged as an immutable source; it is not a note on another record.
export function TextIntake({ sourceType }: { sourceType: string }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IntakeResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await submitPastedText({ clientRequestId: crypto.randomUUID(), sourceType, title, text });
    setResult(r);
    if (r.ok) { setText(""); setTitle(""); }
    setBusy(false);
  }

  return (
    <form className="intake-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">כותרת (לא חובה)</span>
        <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </label>
      <label className="field">
        <span className="field-label">טקסט המקור</span>
        <textarea className="field-input field-textarea" value={text} onChange={(e) => setText(e.target.value)} rows={8} required />
        <span className="field-help">הדביקי כאן מייל, תכתובת או טקסט אחר. הוא יישמר בדיוק כפי שהוא, כמקור.</span>
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || text.trim() === ""}>{busy ? "שומרת…" : "קליטת הטקסט"}</button>
      {result ? <p className={result.ok ? "form-ok" : "form-error"} role="status" data-testid="text-intake-result">{result.message}</p> : null}
    </form>
  );
}
