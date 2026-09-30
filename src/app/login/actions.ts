"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCorrelationId } from "@/lib/correlation";
import { log } from "@/lib/server/logger";

const Credentials = z.object({ email: z.string().email(), password: z.string().min(1) });

export type SignInState = { error: string | null };

// Server Action: signs in with the user's session; errors are typed and in Hebrew, never "something went wrong".
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const correlationId = getCorrelationId(await headers());
  const parsed = Credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "יש להזין אימייל וסיסמה תקינים" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    log("security_log", correlationId, { event: "sign_in_failed", reason: error.code ?? "auth_error", status: error.status });
    return { error: "פרטי הכניסה שגויים" };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
