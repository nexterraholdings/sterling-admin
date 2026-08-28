import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { MFA_REQUIRED_PATH } from "@/lib/auth/constants";
import { getAuthUser } from "@/lib/auth/get-auth-user";
import { staffHasCompletedLoginChallenge } from "@/lib/auth/mfa";
import {
  ADMIN_ROLES,
  type AdminRole,
  allowedRolesForPath,
  hasAdminRole,
} from "@/app/dashboard/lib/admin-access";

export type { AdminRole };
export {
  ADMIN_ROLES,
  ANALYST_ROLES,
  MARKETING_ROLES,
  OPERATOR_ROLES,
  OWNER_ROLES,
} from "@/app/dashboard/lib/admin-access";

export type CurrentAdmin = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: AdminRole;
  accountRole: AdminRole;
};

function isAdminRole(role: string | null | undefined): role is AdminRole {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
}

async function loadCurrentAdmin(): Promise<CurrentAdmin> {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser(supabase);

  if (!user) redirect("/");

  const { data: adminRow } = await supabaseAdmin
    .from("sterling_admins")
    .select("role, disabled_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow || adminRow.disabled_at || !isAdminRole(adminRow.role)) {
    redirect("/");
  }

  if (!(await staffHasCompletedLoginChallenge(supabase, user.id))) {
    redirect(MFA_REQUIRED_PATH);
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    role: adminRow.role,
    accountRole: adminRow.role,
  };
}

// Real authorization check: verifies the session, then looks up sterling_admins.
// Cached per request so layout, pages, and actions share one lookup.
export const getCurrentAdmin = cache(loadCurrentAdmin);

export async function requireAdmin(roles: readonly AdminRole[]): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!hasAdminRole(admin.role, roles)) {
    throw new Error("You don't have access to this action");
  }
  return admin;
}

export async function requireAdminPage(roles: readonly AdminRole[]): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!hasAdminRole(admin.role, roles)) {
    redirect("/dashboard");
  }
  return admin;
}

export async function requireAdminPath(pathname: string): Promise<CurrentAdmin> {
  return requireAdminPage(allowedRolesForPath(pathname));
}

export async function fetchActiveSterlingAdminRole(userId: string): Promise<AdminRole | null> {
  const { data } = await supabaseAdmin
    .from("sterling_admins")
    .select("role, disabled_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data || data.disabled_at || !isAdminRole(data.role)) return null;
  return data.role;
}
