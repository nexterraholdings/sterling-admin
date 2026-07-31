"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import type { AddressVerificationStatus, Community } from "@/lib/communities/types";

const PAGE_SIZE = 20;

export type { Community };

const COMMUNITY_COLUMNS =
  "id,name,description,category,visibility,members_count,posts_count,created_at," +
  "community_type,address,lat,lng,address_verification_status,address_reviewed_by,address_reviewed_at," +
  "is_plus,is_plus_source,is_plus_granted_by,is_plus_granted_at";

export type CommunityMember = {
  user_id: string;
  role: string;
  profile: {
    full_name: string | null;
    username: string | null;
    email: string | null;
  } | null;
};

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — community management requires service-role access."
    );
  }
}

function escapeIlikeTerm(term: string): string {
  return term.replace(/[\\%,.():]/g, (c) => `\\${c}`);
}

function normalizeCommunity(row: Record<string, unknown>): Community {
  return {
    ...(row as unknown as Community),
    community_type: (row.community_type as Community["community_type"] | null) ?? "standard",
    address_verification_status:
      (row.address_verification_status as AddressVerificationStatus | null) ?? "unverified",
    members_count: (row.members_count as number | null) ?? 0,
    posts_count: (row.posts_count as number | null) ?? 0,
    is_plus: Boolean(row.is_plus),
  };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchCommunities(
  page: number,
  search = ""
): Promise<{ communities: Community[]; totalCount: number }> {
  await getCurrentAdmin();
  requireServiceRole();

  const offset = (page - 1) * PAGE_SIZE;

  let countQuery = supabaseAdmin
    .from("communities")
    .select("*", { count: "exact", head: true });

  let dataQuery = supabaseAdmin
    .from("communities")
    .select(COMMUNITY_COLUMNS)
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (search.trim()) {
    const term = escapeIlikeTerm(search.trim());
    const orFilter = `name.ilike.%${term}%,description.ilike.%${term}%`;
    countQuery = countQuery.or(orFilter);
    dataQuery = dataQuery.or(orFilter);
  }

  const [{ count }, { data, error }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  if (error) throw new Error(error.message);

  return {
    communities: (data ?? []).map((row: Record<string, unknown>) => normalizeCommunity(row)),
    totalCount: count ?? 0,
  };
}

export async function fetchCommunityById(id: string): Promise<Community | null> {
  await getCurrentAdmin();
  requireServiceRole();

  const { data, error } = await supabaseAdmin
    .from("communities")
    .select(COMMUNITY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return normalizeCommunity(data as Record<string, unknown>);
}

export async function fetchAddressVerificationQueue(): Promise<Community[]> {
  await getCurrentAdmin();
  requireServiceRole();

  const { data, error } = await supabaseAdmin
    .from("communities")
    .select(COMMUNITY_COLUMNS)
    .eq("address_verification_status", "pending")
    .order("address_reviewed_at", { ascending: true, nullsFirst: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => normalizeCommunity(row));
}

export async function fetchPlusCommunities(): Promise<Community[]> {
  await getCurrentAdmin();
  requireServiceRole();

  const { data, error } = await supabaseAdmin
    .from("communities")
    .select(COMMUNITY_COLUMNS)
    .eq("is_plus", true)
    .order("is_plus_granted_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => normalizeCommunity(row));
}

export async function fetchCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  await getCurrentAdmin();
  requireServiceRole();

  const { data, error } = await supabaseAdmin
    .from("community_members")
    .select("user_id,role")
    .eq("community_id", communityId)
    .order("role", { ascending: true });

  if (error) throw new Error(error.message);

  const members = data ?? [];
  if (members.length === 0) return [];

  const userIds = members.map((m: any) => m.user_id);
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,username,email")
    .in("id", userIds);

  if (profilesError) throw new Error(profilesError.message);

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return members.map((m: any) => ({
    user_id: m.user_id,
    role: m.role,
    profile: profileById.get(m.user_id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function updateCommunity(
  id: string,
  updates: Partial<Community>
): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();

  const { error } = await supabaseAdmin
    .from("communities")
    .update(updates)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCommunity(id: string): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();

  const { error } = await supabaseAdmin
    .from("communities")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removeCommunityMember(communityId: string, userId: string): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();

  const { error } = await supabaseAdmin
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function updateCommunityMemberRole(
  communityId: string,
  userId: string,
  role: string
): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();

  const { error } = await supabaseAdmin
    .from("community_members")
    .update({ role })
    .eq("community_id", communityId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setCommunityType(
  communityId: string,
  communityType: "standard" | "brokerage"
): Promise<void> {
  const admin = await getCurrentAdmin();
  requireServiceRole();

  const { data: before, error: fetchError } = await supabaseAdmin
    .from("communities")
    .select("name,community_type")
    .eq("id", communityId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabaseAdmin
    .from("communities")
    .update({ community_type: communityType })
    .eq("id", communityId);
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: "set_community_type",
    detail: `Changed community "${before?.name ?? communityId}" type: ${before?.community_type ?? "?"} → ${communityType}`,
    targetType: "community",
    targetId: communityId,
    actorId: admin.id,
    actorLabel: admin.email,
  });
}

export async function reviewCommunityAddress(
  communityId: string,
  status: AddressVerificationStatus
): Promise<Community> {
  const admin = await getCurrentAdmin();
  requireServiceRole();

  const { data, error } = await supabaseAdmin.rpc("admin_review_community_address", {
    p_community_id: communityId,
    p_status: status,
    p_reviewer_id: admin.id,
  });
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "moderation",
    action: "review_community_address",
    detail: `Set address verification for community (${communityId}) to "${status}"`,
    targetType: "community",
    targetId: communityId,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return normalizeCommunity(data as Record<string, unknown>);
}

export async function setCommunityIsPlus(
  communityId: string,
  isPlus: boolean,
  reason?: string
): Promise<Community> {
  const admin = await getCurrentAdmin();
  requireServiceRole();

  const { data, error } = await supabaseAdmin.rpc("admin_set_community_is_plus", {
    p_community_id: communityId,
    p_is_plus: isPlus,
    p_granted_by: admin.id,
  });
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: isPlus ? "grant_community_plus" : "revoke_community_plus",
    detail: `${isPlus ? "Granted" : "Revoked"} Plus for community (${communityId})${reason ? ` — ${reason}` : ""}`,
    targetType: "community",
    targetId: communityId,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return normalizeCommunity(data as Record<string, unknown>);
}