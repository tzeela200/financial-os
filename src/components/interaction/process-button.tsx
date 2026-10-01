"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { processFile } from "@/features/intake/actions";

// Command trigger (18D §16): runs reading for a stored file; the result comes from the backend, then the screen refreshes.
export function ProcessButton({ fileId, label = "קריאת הקובץ" }: { fileId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="process-action">
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await processFile(fileId);
        setMessage(r.message);
        router.refresh();
      })}>
        {pending ? "קורא את הקובץ…" : label}
      </button>
      {message ? <p role="status" className="muted-note">{message}</p> : null}
    </div>
  );
}
