"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reprocessSource } from "@/features/intake/actions";

// Re-read the files of one source with the current readers / adapters (each file gets a server-side job).
export function ReprocessSourceButton({ sourceTypes }: { sourceTypes: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="process-action">
      <button type="button" className="btn-secondary" disabled={pending} onClick={() => start(async () => { const r = await reprocessSource(sourceTypes); setMessage(r.message); router.refresh(); })}>
        {pending ? "מפעיל…" : "לקרוא מחדש את הקבצים של המקור"}
      </button>
      {message ? <p role="status" className="muted-note">{message}</p> : null}
    </div>
  );
}
