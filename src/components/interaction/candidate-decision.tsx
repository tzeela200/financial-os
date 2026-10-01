"use client";

import { useState, useTransition } from "react";
import { decideCandidate } from "@/features/reconciliation/actions";

// Decision buttons for one reconciliation candidate (21D Review Item actions). The result comes from the backend.
export function CandidateDecision({ candidateId }: { candidateId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const act = (d: "approve" | "reject") => start(async () => setMessage((await decideCandidate(candidateId, d)).message));
  if (message) return <p role="status" className="muted-note">{message}</p>;
  return (
    <div className="decision-actions">
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => act("approve")}>זו אותה תנועה — לאשר</button>
      <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => act("reject")}>אלה תנועות שונות</button>
    </div>
  );
}
