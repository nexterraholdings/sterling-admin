"use server";

import { randomBytes } from "node:crypto";
import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import {
  ADMIN_ROLES,
  type AdminRole,
  OPERATOR_ROLES,
  OWNER_ROLES,
  requireAdmin,
} from "@/app/dashboard/lib/dal";
import { describeUser, logAdminAction } from "@/app/dashboard/lib/audit-log";

export type ModeratorRow = {
  userId: string;
  email: string | null;
  fullName: string | null;
  username: string | null;
  role: AdminRole;
  title: string | null;
  createdAt: string;
  disabledAt: string | null;
};

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — moderator management requires service-role access."
    );
  }
}

function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

async function countActiveOwners(exceptUserId?: string): Promise<number> {
  let query = supabaseAdmin
    .from("sterling_admins")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "owner")
    .is("disabled_at", null);
  if (exceptUserId) query = query.neq("user_id", exceptUserId);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function fetchModerators(): Promise<{
  rows: ModeratorRow[];
  canManage: boolean;
}> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  requireServiceRole();

  const { data, error } = await supabaseAdmin
    .from("sterling_admins")
    .select("user_id,role,title,created_at,disabled_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((row: { user_id: string }) => row.user_id);
  const { data: profiles, error: profileError } = ids.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id,email,full_name,username")
        .in("id", ids)
    : { data: [] as { id: string; email: string | null; full_name: string | null; username: string | null }[], error: null };
  if (profileError) throw new Error(profileError.message);

  const profileMap = new Map(
    ((profiles ?? []) as { id: string; email: string | null; full_name: string | null; username: string | null }[]).map(
      (p) => [p.id, p]
    )
  );

  const rows: ModeratorRow[] = (data ?? []).map(
    (row: {
      user_id: string;
      role: string;
      title: string | null;
      created_at: string;
      disabled_at: string | null;
    }) => {
      const profile = profileMap.get(row.user_id);
      return {
        userId: row.user_id,
        email: profile?.email ?? null,
        fullName: profile?.full_name ?? null,
        username: profile?.username ?? null,
        role: isAdminRole(row.role) ? row.role : "operator",
        title: row.title,
        createdAt: row.created_at,
        disabledAt: row.disabled_at,
      };
    }
  );

  return { rows, canManage: admin.role === "owner" };
}

export async function grantModerator(params: {
  email: string;
  role: AdminRole;
  title?: string;
  fullName?: string;
  password?: string;
}): Promise<ModeratorRow & { temporaryPassword?: string }> {
  const admin = await requireAdmin(OWNER_ROLES);
  requireServiceRole();

  if (!isAdminRole(params.role)) throw new Error("Invalid role");
  const email = params.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Enter a valid email");

  const fullName = params.fullName?.trim() || null;
  const { userId, email: resolvedEmail, fullName: resolvedName, username, temporaryPassword } =
    await resolveOrCreateAuthUser({
      email,
      fullName,
      password: params.password?.trim() || null,
    });

  const { data, error } = await supabaseAdmin
    .from("sterling_admins")
    .upsert(
      {
        user_id: userId,
        role: params.role,
        title: params.title?.trim() || null,
        created_by: admin.id,
        disabled_at: null,
      },
      { onConflict: "user_id" }
    )
    .select("user_id,role,title,created_at,disabled_at")
    .single();
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: "sterling_admin_granted",
    targetType: "sterling_admin",
    targetId: userId,
    actorId: admin.id,
    actorLabel: admin.email,
    detail: `Granted ${params.role} to ${await describeUser(userId)}`,
  });

  return {
    userId: data.user_id,
    email: resolvedEmail,
    fullName: resolvedName,
    username,
    role: data.role,
    title: data.title,
    createdAt: data.created_at,
    disabledAt: data.disabled_at,
    temporaryPassword,
  };
}

async function resolveOrCreateAuthUser(params: {
  email: string;
  fullName: string | null;
  password: string | null;
}): Promise<{
  userId: string;
  email: string;
  fullName: string | null;
  username: string | null;
  temporaryPassword?: string;
}> {
  const existing = await findAuthUserByEmail(params.email);
  if (existing) {
    await ensureProfile(existing.id, params.email, params.fullName);
    const profile = await loadProfile(existing.id);
    return {
      userId: existing.id,
      email: profile?.email ?? existing.email ?? params.email,
      fullName: profile?.full_name ?? params.fullName,
      username: profile?.username ?? null,
    };
  }

  const temporaryPassword = params.password || randomBytes(12).toString("base64url");
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: params.fullName ? { full_name: params.fullName } : undefined,
  });
  if (error || !data.user) {
    const already =
      (error?.message ?? "").toLowerCase().includes("already") ||
      (error?.message ?? "").toLowerCase().includes("registered");
    if (already) {
      const match = await findAuthUserByEmail(params.email);
      if (match) {
        await ensureProfile(match.id, params.email, params.fullName);
        const profile = await loadProfile(match.id);
        return {
          userId: match.id,
          email: profile?.email ?? match.email ?? params.email,
          fullName: profile?.full_name ?? params.fullName,
          username: profile?.username ?? null,
        };
      }
    }
    throw new Error(error?.message ?? "Could not create the auth user");
  }

  await ensureProfile(data.user.id, params.email, params.fullName);
  const profile = await loadProfile(data.user.id);
  return {
    userId: data.user.id,
    email: profile?.email ?? data.user.email ?? params.email,
    fullName: profile?.full_name ?? params.fullName,
    username: profile?.username ?? null,
    temporaryPassword: params.password ? undefined : temporaryPassword,
  };
}

async function findAuthUserByEmail(email: string): Promise<{ id: string; email?: string } | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,email")
    .ilike("email", email)
    .maybeSingle();

  if (profile?.id) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (!error && data.user) return { id: data.user.id, email: data.user.email ?? profile.email ?? email };
  }

  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = (data.users ?? []).find(
      (user: { email?: string }) => user.email?.toLowerCase() === email
    );
    if (match) return { id: match.id, email: match.email ?? email };
    if ((data.users ?? []).length < 200) break;
  }

  return null;
}

async function loadProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id,email,full_name,username")
    .eq("id", userId)
    .maybeSingle();
  return data as { id: string; email: string | null; full_name: string | null; username: string | null } | null;
}

async function ensureProfile(userId: string, email: string, fullName: string | null): Promise<void> {
  const existing = await loadProfile(userId);
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.email) patch.email = email;
    if (fullName && !existing.full_name) patch.full_name = fullName;
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    email,
    full_name: fullName,
  });
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }
}

export async function updateModerator(params: {
  userId: string;
  role?: AdminRole;
  title?: string | null;
  disabled?: boolean;
}): Promise<ModeratorRow> {
  const admin = await requireAdmin(OWNER_ROLES);
  requireServiceRole();

  if (params.userId === admin.id && params.disabled) {
    throw new Error("You cannot disable your own access");
  }
  if (params.userId === admin.id && params.role && params.role !== "owner") {
    throw new Error("You cannot demote your own owner role");
  }

  const { data: current, error: currentError } = await supabaseAdmin
    .from("sterling_admins")
    .select("user_id,role,title,created_at,disabled_at")
    .eq("user_id", params.userId)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!current) throw new Error("Moderator not found");

  const nextRole = params.role ?? current.role;
  if (!isAdminRole(nextRole)) throw new Error("Invalid role");

  const leavingOwner =
    current.role === "owner" &&
    current.disabled_at == null &&
    (params.disabled || nextRole !== "owner");
  if (leavingOwner && (await countActiveOwners(params.userId)) < 1) {
    throw new Error("Keep at least one active owner");
  }

  const patch: Record<string, unknown> = {};
  if (params.role) patch.role = params.role;
  if (params.title !== undefined) patch.title = params.title?.trim() || null;
  if (params.disabled === true) patch.disabled_at = new Date().toISOString();
  if (params.disabled === false) patch.disabled_at = null;

  const { data, error } = await supabaseAdmin
    .from("sterling_admins")
    .update(patch)
    .eq("user_id", params.userId)
    .select("user_id,role,title,created_at,disabled_at")
    .single();
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: "sterling_admin_updated",
    targetType: "sterling_admin",
    targetId: params.userId,
    actorId: admin.id,
    actorLabel: admin.email,
    detail: `Updated ${await describeUser(params.userId)} role=${data.role} disabled=${Boolean(data.disabled_at)}`,
  });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email,full_name,username")
    .eq("id", params.userId)
    .maybeSingle();

  return {
    userId: data.user_id,
    email: profile?.email ?? null,
    fullName: profile?.full_name ?? null,
    username: profile?.username ?? null,
    role: data.role,
    title: data.title,
    createdAt: data.created_at,
    disabledAt: data.disabled_at,
  };
}

export async function revokeModerator(userId: string): Promise<void> {
  const admin = await requireAdmin(OWNER_ROLES);
  requireServiceRole();

  if (userId === admin.id) throw new Error("You cannot remove your own access");

  const { data: current, error: currentError } = await supabaseAdmin
    .from("sterling_admins")
    .select("role,disabled_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!current) return;

  if (current.role === "owner" && current.disabled_at == null && (await countActiveOwners(userId)) < 1) {
    throw new Error("Keep at least one active owner");
  }

  const { error } = await supabaseAdmin.from("sterling_admins").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: "sterling_admin_revoked",
    targetType: "sterling_admin",
    targetId: userId,
    actorId: admin.id,
    actorLabel: admin.email,
    detail: `Revoked dashboard access for ${await describeUser(userId)}`,
  });
}
