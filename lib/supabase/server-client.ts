import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { REMEMBER_DEVICE_COOKIE } from "@/lib/auth/constants";
import {
  applyRememberToAuthCookies,
  rememberDeviceEnabled,
} from "@/lib/auth/session-cookies";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Session-aware Supabase client for Server Components/Actions — reads and
// writes the auth session via cookies, unlike supabaseAdmin (service role,
// no session) in lib/supabase/server.ts.
export async function createSupabaseServerClient(remember?: boolean) {
  const cookieStore = await cookies();
  const persist = remember ?? rememberDeviceEnabled(
    cookieStore.get(REMEMBER_DEVICE_COOKIE)?.value
  );

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        try {
          applyRememberToAuthCookies(cookiesToSet, persist).forEach(
            ({ name, value, options }) => cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component render, which can't set cookies.
          // The proxy (proxy.ts) refreshes the session on the next request.
        }
      },
    },
  });
}
