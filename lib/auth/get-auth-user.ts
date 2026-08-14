import type { SupabaseClient, User } from "@supabase/supabase-js";
import { expireSupabaseAuthCookies } from "@/lib/auth/session-cookies";

export function isAuthApiError(error: unknown): boolean {
  return !!error && typeof error === "object" && "__isAuthError" in error;
}

export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: string }).code) : "";
  const message =
    "message" in error ? String((error as { message?: string }).message).toLowerCase() : "";
  return (
    code === "refresh_token_not_found" ||
    code === "refresh_token_already_used" ||
    code === "session_not_found" ||
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found")
  );
}

async function discardLocalSession(supabase: SupabaseClient) {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Cookie clear below is the fallback if signOut bails on a dead refresh token.
  }

  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    expireSupabaseAuthCookies(store.getAll(), (name, value, options) => {
      store.set(name, value, options);
    });
  } catch {
    // Proxy/edge has no mutable cookie store; the caller expires cookies on the response.
  }
}

/** Reads the current user and drops a dead refresh-token cookie so it is not retried. */
export async function getAuthUser(
  supabase: SupabaseClient,
  onClearCookies?: () => void
): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error && isInvalidRefreshTokenError(error)) {
      await discardLocalSession(supabase);
      onClearCookies?.();
      return null;
    }
    if (error || !data.user) return null;
    return data.user;
  } catch (error) {
    if (!isAuthApiError(error) && !isInvalidRefreshTokenError(error)) throw error;
    await discardLocalSession(supabase);
    onClearCookies?.();
    return null;
  }
}
