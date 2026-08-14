import {
  REMEMBER_DEVICE_COOKIE,
  REMEMBER_DEVICE_MAX_AGE_SECONDS,
} from "@/lib/auth/constants";

type CookieOptionBag = Record<string, unknown>;

export type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptionBag;
};

export function isSupabaseAuthCookieName(name: string): boolean {
  return (
    name.startsWith("sb-") &&
    (name.includes("-auth-token") || name.endsWith("-code-verifier"))
  );
}

export function expireSupabaseAuthCookies(
  cookies: { name: string }[],
  set: (name: string, value: string, options: { path: string; maxAge: number }) => void
) {
  for (const cookie of cookies) {
    if (!isSupabaseAuthCookieName(cookie.name)) continue;
    set(cookie.name, "", { path: "/", maxAge: 0 });
  }
}

export function rememberDeviceEnabled(value: string | undefined | null): boolean {
  return value !== "0" && value !== "false";
}

export function rememberFlagFromCookies(
  cookies: { name: string; value: string }[]
): boolean {
  const match = cookies.find((cookie) => cookie.name === REMEMBER_DEVICE_COOKIE);
  return rememberDeviceEnabled(match?.value);
}

/**
 * @supabase/ssr always writes maxAge: 400 days. Re-apply our remember-device
 * policy so "off" is a real session cookie and "on" lasts 30 days.
 * Never override maxAge: 0 — that is how auth cookies are deleted.
 */
export function withRememberCookieOptions(
  options: CookieOptionBag | undefined,
  remember: boolean
): CookieOptionBag {
  const next: CookieOptionBag = {
    path: "/",
    sameSite: "lax",
    ...options,
  };
  const isClearing =
    next.maxAge === 0 ||
    next.maxAge === "0" ||
    (next.expires instanceof Date && next.expires.getTime() <= 0);

  if (isClearing) {
    next.maxAge = 0;
    return next;
  }

  delete next.maxAge;
  delete next.expires;
  if (remember) {
    next.maxAge = REMEMBER_DEVICE_MAX_AGE_SECONDS;
  }
  return next;
}

export function applyRememberToAuthCookies<T extends CookieToSet>(
  cookies: T[],
  remember: boolean
): T[] {
  return cookies.map((cookie) => {
    if (cookie.name === REMEMBER_DEVICE_COOKIE) return cookie;
    return {
      ...cookie,
      options: withRememberCookieOptions(cookie.options, remember),
    };
  });
}
