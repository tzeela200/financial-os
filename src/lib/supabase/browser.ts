import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

// Browser client: publishable key only; every query is still bound by RLS.
export function createClient() {
  return createBrowserClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
