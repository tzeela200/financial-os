import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Next.js 16 renamed middleware.ts to proxy.ts.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // skip static assets and image optimization
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
