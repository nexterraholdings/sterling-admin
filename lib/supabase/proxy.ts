import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { MFA_REQUIRED_PATH } from "@/lib/auth/constants";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const PROTECTED_PREFIX = "/dashboard";
const LOGIN_PATH = "/";

const AUTH_CACHE_HEADERS = ["cache-control", "pragma", "expires"] as const;

function isAuthApiError(error: unknown): boolean {
  return !!error && typeof error === "object" && "__isAuthError" in error;
}

function withSessionResponse(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });

  AUTH_CACHE_HEADERS.forEach((name) => {
    const value = source.headers.get(name);
    if (value) target.headers.set(name, value);
  });

  return target;
}

// Optimistic auth check for proxy.ts: only reads/refreshes the session
// cookie, no database round-trip. The real account_role check happens in
// app/dashboard/lib/dal.ts, close to the data it protects.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        if (headers) {
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        }
      },
    },
  });

  // getUser() throws (rather than returning a null user) when the refresh
  // token cookie is stale/revoked, e.g. after a password reset or a
  // long-idle session. Treat that the same as "not signed in".
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
  }

  const pathname = request.nextUrl.pathname;
  const isProtected = pathname.startsWith(PROTECTED_PREFIX);
  const isMfaPage = pathname === MFA_REQUIRED_PATH || pathname.startsWith(`${MFA_REQUIRED_PATH}/`);
  const isLoginPage = pathname === LOGIN_PATH;

  if (isMfaPage && !user) {
    const redirect = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    return withSessionResponse(supabaseResponse, redirect);
  }

  if (isProtected && !user) {
    const redirect = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    return withSessionResponse(supabaseResponse, redirect);
  }

  if (isLoginPage && user) {
    const redirect = NextResponse.redirect(new URL(PROTECTED_PREFIX, request.url));
    return withSessionResponse(supabaseResponse, redirect);
  }

  return supabaseResponse;
}
