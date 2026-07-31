"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction, describeUser } from "@/app/dashboard/lib/audit-log";
import type { AuthUserRow, UserDeleteTarget, UserProfile } from "@/lib/types";

const PAGE_SIZE = 20;

export type FetchFilter = { account_role?: string; flagged?: boolean };

export async function fetchProfiles(
  page: number,
  filter: FetchFilter = {},
  search = ""
): Promise<{ profiles: UserProfile[]; totalCount: number }> {
  await getCurrentAdmin();
  await requireServiceRole();

  const offset = (page - 1) * PAGE_SIZE;

  let countQuery = supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact", head: true });

  let dataQuery = supabaseAdmin
    .from("profiles")
    .select(
      `id,email,full_name,username,role,operating_markets,market_other,main_goals,created_at,updated_at,avatar_url,banner_url,bio,account_role,moderation_strike_count,phone_number`
    )
    .order("full_name", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (filter.account_role) {
    countQuery = countQuery.eq("account_role", filter.account_role);
    dataQuery = dataQuery.eq("account_role", filter.account_role);
  }
  if (filter.flagged) {
    countQuery = countQuery.gt("moderation_strike_count", 0);
    dataQuery = dataQuery.gt("moderation_strike_count", 0);
  }
  if (search.trim()) {
    // Escape PostgREST filter/ilike-reserved characters so user input can't
    // inject extra .or() conditions or manipulate the wildcard pattern.
    const term = search.trim().replace(/[\\%,.():]/g, (c) => `\\${c}`);
    const orFilter = `full_name.ilike.%${term}%,email.ilike.%${term}%,username.ilike.%${term}%`;
    countQuery = countQuery.or(orFilter);
    dataQuery = dataQuery.or(orFilter);
  }

  const [{ count }, { data, error }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  if (error) throw new Error(error.message);

  const profiles = (data ?? []).map((profile: any) => ({
    ...profile,
    operating_markets: profile.operating_markets ?? [],
    main_goals: profile.main_goals ?? [],
    account_role: profile.account_role ?? "member",
    moderation_strike_count: profile.moderation_strike_count ?? 0,
  }));

  return { profiles, totalCount: count ?? 0 };
}

const PROFILE_SELECT =
  "id,email,full_name,username,role,operating_markets,market_other,main_goals,created_at,updated_at,avatar_url,banner_url,bio,account_role,moderation_strike_count,phone_number";

function normalizeProfile(profile: Record<string, unknown>): UserProfile {
  return {
    ...(profile as unknown as UserProfile),
    operating_markets: (profile.operating_markets as string[] | null) ?? [],
    main_goals: (profile.main_goals as string[] | null) ?? [],
    account_role: (profile.account_role as string | null) ?? "member",
    moderation_strike_count: (profile.moderation_strike_count as number | null) ?? 0,
  };
}

export async function fetchProfileById(id: string): Promise<UserProfile | null> {
  await getCurrentAdmin();
  await requireServiceRole();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return normalizeProfile(data as Record<string, unknown>);
}

export async function fetchAuthUsers(
  page: number,
  search = ""
): Promise<{ users: AuthUserRow[]; totalCount: number }> {
  await getCurrentAdmin();
  await requireServiceRole();

  const offset = (page - 1) * PAGE_SIZE;
  const { data, error } = await supabaseAdmin.rpc("admin_list_auth_users", {
    p_search: search.trim() || null,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });

  if (!error) {
    const rows = (data ?? []) as Array<{
      id: string;
      email: string | null;
      phone: string | null;
      created_at: string;
      last_sign_in_at: string | null;
      banned_until: string | null;
      has_profile: boolean;
      profile_username: string | null;
      profile_full_name: string | null;
      total_count: number | string;
    }>;

    const totalCount =
      rows.length > 0 ? Number(rows[0].total_count) || 0 : 0;

    const users: AuthUserRow[] = rows.map((row) => ({
      id: row.id,
      email: row.email,
      phone: row.phone,
      created_at: row.created_at,
      last_sign_in_at: row.last_sign_in_at,
      banned_until: row.banned_until,
      has_profile: Boolean(row.has_profile),
      profile_username: row.profile_username,
      profile_full_name: row.profile_full_name,
    }));

    return { users, totalCount };
  }

  // Fallback when migration hasn't been applied yet.
  if (!isMissingRpcError(error)) {
    throw new Error(error.message);
  }

  return fetchAuthUsersViaAdminApi(page, search);
}

function isMissingRpcError(error: { message?: string; code?: string } | null): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return (
    msg.includes("could not find the function") ||
    msg.includes("schema cache") ||
    error?.code === "PGRST202"
  );
}

async function fetchAuthUsersViaAdminApi(
  page: number,
  search: string
): Promise<{ users: AuthUserRow[]; totalCount: number }> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page,
    perPage: PAGE_SIZE,
  });
  if (error) throw new Error(error.message);

  const authUsers = data?.users ?? [];
  const ids = authUsers.map((u: { id: string }) => u.id);
  let profileById = new Map<
    string,
    { username: string | null; full_name: string | null }
  >();

  if (ids.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,username,full_name")
      .in("id", ids);
    profileById = new Map(
      (profiles ?? []).map((p: { id: string; username: string | null; full_name: string | null }) => [
        p.id,
        { username: p.username, full_name: p.full_name },
      ])
    );
  }

  const term = search.trim().toLowerCase();
  let users: AuthUserRow[] = authUsers.map(
    (u: {
      id: string;
      email?: string | null;
      phone?: string | null;
      created_at: string;
      last_sign_in_at?: string | null;
      banned_until?: string | null;
    }) => {
      const profile = profileById.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        phone: u.phone ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned_until: u.banned_until ?? null,
        has_profile: Boolean(profile),
        profile_username: profile?.username ?? null,
        profile_full_name: profile?.full_name ?? null,
      };
    }
  );

  if (term) {
    users = users.filter(
      (u) =>
        u.email?.toLowerCase().includes(term) ||
        u.phone?.toLowerCase().includes(term) ||
        u.id.toLowerCase().includes(term) ||
        u.profile_username?.toLowerCase().includes(term) ||
        u.profile_full_name?.toLowerCase().includes(term)
    );
  }

  // listUsers doesn't return a global total; approximate from this page.
  const totalCount =
    authUsers.length < PAGE_SIZE
      ? (page - 1) * PAGE_SIZE + authUsers.length
      : page * PAGE_SIZE + 1;

  return { users, totalCount };
}

export async function fetchProfileAuthPresence(
  ids: string[]
): Promise<string[]> {
  await getCurrentAdmin();
  await requireServiceRole();
  if (ids.length === 0) return [];

  const { data, error } = await supabaseAdmin.rpc("admin_profile_has_auth", {
    p_user_ids: ids,
  });

  if (!error) {
    return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  }

  if (!isMissingRpcError(error)) {
    throw new Error(error.message);
  }

  // Fallback: Auth Admin API per id (slower, works without the migration).
  const present: string[] = [];
  await Promise.all(
    ids.map(async (id) => {
      const { data: lookup, error: lookupError } =
        await supabaseAdmin.auth.admin.getUserById(id);
      if (!lookupError && lookup?.user) present.push(id);
    })
  );
  return present;
}

// Was previously called directly from the client with supabaseAdmin, which silently
// downgraded to the anon-key client in the browser (SUPABASE_SERVICE_ROLE_KEY isn't
// NEXT_PUBLIC_-prefixed, so it's undefined client-side) and got blocked by RLS —
// this is why promoting a user to "owner" (and likely any cross-user profile edit)
// never actually persisted. Moved server-side so it runs with service-role access.
export async function updateProfile(
  id: string,
  updates: Partial<UserProfile>
): Promise<void> {
  const admin = await getCurrentAdmin();
  await requireServiceRole();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select("email,full_name,username")
    .single();
  if (error) throw new Error(error.message);

  if (updates.account_role) {
    const label = data?.email ?? data?.username ?? data?.full_name ?? id;
    await logAdminAction({
      category: "admin",
      action: "update_account_role",
      detail: `Set account_role = "${updates.account_role}" for ${label}`,
      targetType: "user",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
  }
}

async function requireServiceRole(): Promise<void> {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — admin user management requires service-role access"
    );
  }
}

async function clearOwnedCommunities(id: string, context: string): Promise<void> {
  const { data: owned, error: ownedError } = await supabaseAdmin
    .from("communities")
    .select("id")
    .eq("owner_id", id);
  if (ownedError) {
    throw new Error(
      `${context}: failed listing owned communities: ${ownedError.message}`
    );
  }

  const communityIds = (owned ?? []).map((c: { id: string }) => c.id);
  if (communityIds.length > 0) {
    const { error: notifError } = await supabaseAdmin
      .from("notifications")
      .update({ community_id: null })
      .in("community_id", communityIds);
    if (notifError) {
      throw new Error(
        `${context}: failed clearing notification community links: ${notifError.message}`
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("communities")
    .delete()
    .eq("owner_id", id);
  if (error) {
    throw new Error(
      `${context}: failed clearing owned communities: ${error.message}`
    );
  }
}

async function clearAuthDeleteBlockers(id: string, context: string): Promise<void> {
  const { error: feedError } = await supabaseAdmin
    .from("feed_recommendations")
    .delete()
    .eq("user_id", id);
  if (feedError) {
    throw new Error(
      `${context}: failed clearing feed_recommendations: ${feedError.message}`
    );
  }
  await clearOwnedCommunities(id, context);
}

async function verifyAuthUserGone(id: string): Promise<void> {
  const { data: remaining, error: lookupError } =
    await supabaseAdmin.auth.admin.getUserById(id);
  // getUserById returns an error when the user is missing — that is success here.
  if (!lookupError && remaining?.user) {
    throw new Error(
      "Auth user still exists after delete. A foreign key is likely blocking auth.users deletion — check Supabase logs."
    );
  }
}

export async function deleteUserAccount(id: string): Promise<void> {
  await requireServiceRole();

  const admin = await getCurrentAdmin();
  const label = await describeUser(id);

  // Prefer SQL RPC (drops owned communities, then DELETE auth.users → cascades).
  // Fall back to Auth Admin API after clearing the same community blocker.
  const { error: rpcError } = await supabaseAdmin.rpc("admin_delete_user", {
    p_user_id: id,
  });

  if (rpcError) {
    await clearAuthDeleteBlockers(id, `Could not delete user (${rpcError.message})`);

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authError) {
      throw new Error(
        `Could not delete Auth user: ${authError.message} (RPC: ${rpcError.message})`
      );
    }
  }

  await verifyAuthUserGone(id);

  await logAdminAction({
    category: "admin",
    action: "delete_user",
    detail: `Deleted account for ${label}`,
    targetType: "user",
    targetId: id,
    actorId: admin.id,
    actorLabel: admin.email,
  });
}

/** Removes auth.users only — profile row (if any) is left behind. */
export async function deleteAuthUserOnly(id: string): Promise<void> {
  await requireServiceRole();

  const admin = await getCurrentAdmin();
  const label = await describeUser(id);

  await clearAuthDeleteBlockers(id, "Could not delete Auth user");

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authError) {
    throw new Error(`Could not delete Auth user: ${authError.message}`);
  }

  await verifyAuthUserGone(id);

  await logAdminAction({
    category: "admin",
    action: "delete_auth_user",
    detail: `Deleted auth.users only for ${label}`,
    targetType: "user",
    targetId: id,
    actorId: admin.id,
    actorLabel: admin.email,
  });
}

/** Removes profiles row only — auth identity (if any) is left behind. */
export async function deleteProfileOnly(id: string): Promise<void> {
  await requireServiceRole();
  const admin = await getCurrentAdmin();
  const label = await describeUser(id);

  const { error } = await supabaseAdmin.from("profiles").delete().eq("id", id);
  if (error) throw new Error(`Could not delete profile: ${error.message}`);

  await logAdminAction({
    category: "admin",
    action: "delete_profile",
    detail: `Deleted profiles row only for ${label}`,
    targetType: "user",
    targetId: id,
    actorId: admin.id,
    actorLabel: admin.email,
  });
}

export async function deleteUserByTarget(
  id: string,
  target: UserDeleteTarget
): Promise<void> {
  if (target === "both") {
    await deleteUserAccount(id);
    return;
  }
  if (target === "auth") {
    await deleteAuthUserOnly(id);
    return;
  }
  await deleteProfileOnly(id);
}

export async function deleteUsersByTarget(
  ids: string[],
  target: UserDeleteTarget
): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> {
  await getCurrentAdmin();
  await requireServiceRole();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const deleted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const id of uniqueIds) {
    try {
      await deleteUserByTarget(id, target);
      deleted.push(id);
    } catch (e: any) {
      failed.push({ id, error: e?.message ?? "Unknown error" });
    }
  }

  return { deleted, failed };
}
