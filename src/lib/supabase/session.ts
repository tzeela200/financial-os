import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { CORRELATION_HEADER, getCorrelationId } from "@/lib/correlation";

const PUBLIC_PATHS = ["/login"];

// Runs in proxy.ts: refreshes the auth cookies, verifies the JWT signature (getClaims, never getSession),
// redirects unauthenticated requests to /login (23A §79), and stamps a correlation id on request and response.
export async function updateSession(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    redirect.headers.set(CORRELATION_HEADER, correlationId);
    return redirect;
  }

  // Return the response that setAll last built, so refreshed cookies reach the browser.
  response.headers.set(CORRELATION_HEADER, correlationId);
  return response;
}
