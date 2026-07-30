import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { MFA_REQUIRED_PATH } from "@/lib/auth/constants";
import { getStaffMfaState } from "@/lib/auth/mfa";

export const STAFF_ROLES = ["owner", "admin", "moderator"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type CurrentAdmin = {
  id: string;
  email: string | null;
  fullName: string | null;
  accountRole: StaffRole;
};

function isStaffRole(role: string | null | undefined): role is StaffRole {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

function isAuthApiError(error: unknown): boolean {
  return !!error && typeof error === "object" && "__isAuthError" in error;
}

// Real authorization check: verifies the session with Supabase Auth, then
// looks up account_role. Call this from every dashboard entry point (layout,
// pages) rather than relying on the optimistic check in proxy.ts alone.
export async function getCurrentAdmin(): Promise<CurrentAdmin> {
  const supabase = await createSupabaseServerClient();

  // getUser() throws (rather than returning a null user) when the refresh
  // token cookie is stale/revoked, e.g. after a password reset or a
  // long-idle session. Treat that the same as "not signed in".
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
  }

  if (!user) redirect("/");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name,account_role")
    .eq("id", user.id)
    .single();

  if (!isStaffRole(profile?.account_role)) {
    redirect("/");
  }

  const mfaState = await getStaffMfaState(supabase);
  if (mfaState.status !== "ok") {
    redirect(MFA_REQUIRED_PATH);
  }

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    accountRole: profile.account_role,
  };
}
