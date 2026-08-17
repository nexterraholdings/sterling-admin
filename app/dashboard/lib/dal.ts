import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { MFA_REQUIRED_PATH } from "@/lib/auth/constants";
import { getAuthUser } from "@/lib/auth/get-auth-user";
import { staffHasCompletedLoginChallenge } from "@/lib/auth/mfa";

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

// Real authorization check: verifies the session with Supabase Auth, then
// looks up account_role. Call this from every dashboard entry point (layout,
// pages) rather than relying on the optimistic check in proxy.ts alone.
export async function getCurrentAdmin(): Promise<CurrentAdmin> {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser(supabase);

  if (!user) redirect("/");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name,account_role")
    .eq("id", user.id)
    .single();

  if (!isStaffRole(profile?.account_role)) {
    redirect("/");
  }

  if (!(await staffHasCompletedLoginChallenge(supabase, user.id))) {
    redirect(MFA_REQUIRED_PATH);
  }

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    accountRole: profile.account_role,
  };
}
