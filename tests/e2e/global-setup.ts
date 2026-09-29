import { createClient } from "@supabase/supabase-js";

// Creates the single owner user in the EPHEMERAL CI database only (admin API with the local service key).
export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("E2E setup refuses to run against a non-local Supabase");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.createUser({
    email: process.env.E2E_OWNER_EMAIL!,
    password: process.env.E2E_OWNER_PASSWORD!,
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) throw error;
}
