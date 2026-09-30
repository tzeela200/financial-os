"use client";

import { useRef, useState, type DragEvent, type ClipboardEvent } from "react";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { prepareFileUpload, finalizeFileUpload, type IntakeResult } from "@/features/intake/actions";

// Upload Area + Upload Queue + Upload Result (21D §7–§9; 20B §12): select, drag & drop, mobile pick, clipboard
// file paste, several files. Each file has its own state; one failure does not cancel the others (21D §8).
type Row = { id: string; name: string; size: number; state: "queued" | "uploading" | "done" | "error"; result?: IntakeResult };

const BUCKET = "financial-source-files";
const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function UploadArea({ sourceType, sourceLabel }: { sourceType: string; sourceLabel: string }) {
  const [pending, setPending] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (files: FileList | File[]) => setPending((p) => [...p, ...Array.from(files).filter((f) => f.size > 0)]);
  const update = (id: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function send() {
    if (busy || pending.length === 0) return; // double-submit guard (21D §88); the backend is idempotent as well
    setBusy(true);
    const batch = pending.map((f) => ({ file: f, row: { id: crypto.randomUUID(), name: f.name, size: f.size, state: "queued" as const } }));
    setPending([]);
    setRows((r) => [...batch.map((b) => b.row), ...r]);
    const supabase = createClient();
    for (const { file, row } of batch) {
      update(row.id, { state: "uploading" });
      try {
        const prep = await prepareFileUpload({ sourceType, filename: file.name, mime: file.type, size: file.size });
        if (!prep.ok) { update(row.id, { state: "error", result: prep }); continue; }
        const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || "application/octet-stream" });
        if (error) { update(row.id, { state: "error", result: { ok: false, message: "ההעלאה לאחסון נכשלה. אפשר לנסות שוב.", correlationId: "" } }); continue; }
        const result = await finalizeFileUpload({
          clientRequestId: row.id, sourceType, sourceId: prep.sourceId, fileId: prep.fileId, path: prep.path, filename: file.name, mime: file.type,
        });
        update(row.id, { state: result.ok ? "done" : "error", result });
      } catch {
        update(row.id, { state: "error", result: { ok: false, message: "החיבור נקטע. הקובץ לא נקלט; אפשר לנסות שוב.", correlationId: "" } });
      }
    }
    setBusy(false);
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); };
  const onPaste = (e: ClipboardEvent) => { if (e.clipboardData.files.length) { e.preventDefault(); add(e.clipboardData.files); } };

  return (
    <div className="intake-block">
      <div
        className={`upload-drop${dragging ? " is-dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        tabIndex={0}
        role="group"
        aria-label={`אזור העלאה ל${sourceLabel}`}
      >
        <Upload aria-hidden="true" size={24} />
        <p className="upload-drop-title">גררי לכאן קבצים, הדביקי קובץ, או בחרי מהמכשיר</p>
        <p className="upload-drop-hint">PDF, CSV, Excel, תמונה, Word, טקסט או ייצוא מייל · עד 50MB לקובץ · אפשר כמה קבצים</p>
        <label className="btn-secondary upload-pick">
          בחירת קבצים
          <input ref={inputRef} type="file" multiple className="visually-hidden"
            onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      {pending.length > 0 ? (
        <div className="upload-pending">
          <ul className="upload-queue" aria-label="קבצים שנבחרו">
            {pending.map((f, i) => (
              <li key={`${f.name}-${i}`} className="upload-row">
                <span className="upload-name">{f.name}</span>
                <span className="num upload-size">{fmtSize(f.size)}</span>
                <button type="button" className="btn btn-ghost" onClick={() => setPending((p) => p.filter((_, j) => j !== i))} aria-label={`הסרת ${f.name}`}>הסרה</button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
            {busy ? "קולטת…" : `קליטת ${pending.length} קבצים ל${sourceLabel}`}
          </button>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <ul className="upload-queue" aria-label="תוצאות קליטה" aria-live="polite">
          {rows.map((r) => (
            <li key={r.id} className={`upload-row upload-row--${r.state}`} data-testid="upload-result">
              <span className="upload-name">{r.name}</span>
              <span className="upload-status">
                {r.state === "queued" ? "ממתין" : r.state === "uploading" ? "מעלה…" : r.result?.message}
                {r.result && !r.result.ok && r.result.correlationId ? <span className="upload-ref"> (מזהה: <span className="num">{r.result.correlationId.slice(0, 8)}</span>)</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
