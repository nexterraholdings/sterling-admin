"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PostItem = {
  id: string;
  body: string | null;
  author_username: string | null;
  community_name: string | null;
  likes_count: number;
  created_at: string | null;
};

export type ProfileItem = {
  id: string;
  full_name: string | null;
  username: string | null;
  account_role: string;
  connections_count: number;
};

export type CommunityItem = {
  id: string;
  name: string | null;
  description: string | null;
  members_count: number;
  created_at: string | null;
};

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — engagement boosts require service-role access."
    );
  }
}

function escapeIlikeTerm(term: string): string {
  return term.replace(/[\\%,.():]/g, (c) => `\\${c}`);
}

async function assertAdmin(): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchPosts(search?: string): Promise<PostItem[]> {
  await assertAdmin();
  let query = supabaseAdmin
    .from("posts")
    .select("id,body,author_username,community_name,likes_count,created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (search?.trim()) {
    const term = escapeIlikeTerm(search.trim());
    query = query.or(
      `body.ilike.%${term}%,author_username.ilike.%${term}%,community_name.ilike.%${term}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    body: p.body ?? null,
    author_username: p.author_username ?? null,
    community_name: p.community_name ?? null,
    likes_count: p.likes_count ?? 0,
    created_at: p.created_at ?? null,
  }));
}

export async function fetchProfileItems(search?: string): Promise<ProfileItem[]> {
  await assertAdmin();
  let query = supabaseAdmin
    .from("profiles")
    .select("id,full_name,username,account_role,fake_connection_count")
    .order("full_name", { ascending: true })
    .limit(30);

  if (search?.trim()) {
    const term = escapeIlikeTerm(search.trim());
    query = query.or(`full_name.ilike.%${term}%,username.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const profiles = (data ?? []) as any[];
  if (!profiles.length) return [];

  // Batch-fetch real connection counts for all returned profiles, then add the
  // artificial profile-level boost read by the mobile app.
  const idList = profiles.map((p) => p.id).join(",");
  const { data: conns } = await supabaseAdmin
    .from("connections")
    .select("requester_id,addressee_id")
    .or(`requester_id.in.(${idList}),addressee_id.in.(${idList})`);

  const countMap: Record<string, number> = {};
  for (const c of (conns ?? []) as any[]) {
    countMap[c.requester_id] = (countMap[c.requester_id] || 0) + 1;
    countMap[c.addressee_id] = (countMap[c.addressee_id] || 0) + 1;
  }

  return profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name ?? null,
    username: p.username ?? null,
    account_role: p.account_role ?? "member",
    connections_count: (countMap[p.id] || 0) + Number(p.fake_connection_count ?? 0),
  }));
}

export async function fetchCommunities(search?: string): Promise<CommunityItem[]> {
  await assertAdmin();
  let query = supabaseAdmin
    .from("communities")
    .select("id,name,description,members_count,created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (search?.trim()) {
    const term = escapeIlikeTerm(search.trim());
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).map((c) => ({
    id: c.id,
    name: c.name ?? null,
    description: c.description ?? null,
    members_count: c.members_count ?? 0,
    created_at: c.created_at ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Boosts
// ---------------------------------------------------------------------------


export async function boostPostLikes(postId: string, amount: number): Promise<number> {
  await assertAdmin();
  const { data, error: fetchErr } = await supabaseAdmin
    .from("posts")
    .select("likes_count")
    .eq("id", postId)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const newCount = (data?.likes_count ?? 0) + amount;

  const { error } = await supabaseAdmin
    .from("posts")
    .update({ likes_count: newCount })
    .eq("id", postId);

  if (error) throw new Error(error.message);
  return newCount;
}

export async function boostProfileConnections(
  profileId: string,
  amount: number
): Promise<{ newCount: number; inserted: number }> {
  await assertAdmin();
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));

  const [{ data: profile, error: profileErr }, { count, error: countErr }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("fake_connection_count")
      .eq("id", profileId)
      .single(),
    supabaseAdmin
      .from("connections")
      .select("id", { count: "exact", head: true })
      .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`),
  ]);

  if (profileErr) throw new Error(profileErr.message);
  if (countErr) throw new Error(countErr.message);

  const fakeCount = Number(profile?.fake_connection_count ?? 0);
  const nextFakeCount = fakeCount + safeAmount;

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update({ fake_connection_count: nextFakeCount })
    .eq("id", profileId);

  if (updateErr) throw new Error(updateErr.message);

  return { newCount: (count ?? 0) + nextFakeCount, inserted: safeAmount };
}

export async function boostCommunityMembers(
  communityId: string,
  amount: number
): Promise<{ newCount: number; inserted: number }> {
  await assertAdmin();
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));

  const { data, error: fetchErr } = await supabaseAdmin
    .from("communities")
    .select("members_count")
    .eq("id", communityId)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const newCount = Number(data?.members_count ?? 0) + safeAmount;

  const { error: updateErr } = await supabaseAdmin
    .from("communities")
    .update({ members_count: newCount })
    .eq("id", communityId);

  if (updateErr) throw new Error(updateErr.message);

  return { newCount, inserted: safeAmount };
}
