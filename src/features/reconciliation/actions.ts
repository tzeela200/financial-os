"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCorrelationId } from "@/lib/correlation";

// Reconciliation decision command (22C Review & Reconciliation; chapter 7 §3, §20 audit; 23A §45 Candidate ≠ Match).
// Only an explicit user decision turns a candidate into a match. The backend validates ownership and state.
export async function decideCandidate(candidateId: string, decision: "approve" | "reject"): Promise<{ ok: boolean; message: string }> {
  const correlationId = getCorrelationId(await headers());
  if (!z.string().uuid().safeParse(candidateId).success || !["approve", "reject"].includes(decision)) return { ok: false, message: "בקשה לא תקינה." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reconciliation_decide", { p_candidate_id: candidateId, p_decision: decision, p_correlation_id: correlationId });
  if (error) return { ok: false, message: error.message.startsWith("CONFLICT") ? "ההחלטה כבר נרשמה." : "ההחלטה לא נשמרה. נסי שוב." };
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/snapshot");
  revalidatePath("/transactions");
  return { ok: true, message: decision === "approve" ? "ההתאמה אושרה. התמונה עודכנה בלי ספירה כפולה." : "ההתאמה נדחתה. שתי התנועות נשארות נפרדות." };
}
