"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PostItem = {
  id: string;
  body: string | null;
  author_username: string | null;
  place_name: string | null;
  image_url: string | null;
  likes_count: number;
  created_at: string | null;
};

export type ProfileItem = {
  id: string;
  full_name: string | null;
  username: string | null;
  account_role: string;
  connections_count: number;
  real_connections: number;
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
  await requireAdmin(OPERATOR_ROLES);
  requireServiceRole();
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const PAGE_SIZE = 24;

function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

async function idsMatching(table: string, column: string, term: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id")
    .ilike(column, `%${term}%`)
    .limit(40);
  if (error) return [];
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

export async function fetchPosts(
  search?: string,
  offset = 0,
  sort: "recent" | "likes" = "recent",
): Promise<PostItem[]> {
  await assertAdmin();
  const start = Math.max(0, Math.floor(offset) || 0);
  let query = supabaseAdmin
    .from("area_discussion_comments")
    .select("id,body,likes_count,created_at,author_id,discussion_id,group_id,image_url,image_thumb_url,gif_url,gif_preview_url,clip_thumb_url")
    .is("parent_id", null)
    .range(start, start + PAGE_SIZE - 1);

  query =
    sort === "likes"
      ? query.order("likes_count", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });

  const term = search?.trim() ? escapeIlikeTerm(search.trim()) : "";
  if (term) {
    const [authorIds, hubIds, groupIds] = await Promise.all([
      idsMatching("profiles", "username", term),
      idsMatching("area_discussions", "title", term),
      idsMatching("discussion_groups", "title", term),
    ]);
    const filters = [`body.ilike.%${term}%`];
    if (authorIds.length) filters.push(`author_id.in.(${authorIds.join(",")})`);
    if (hubIds.length) filters.push(`discussion_id.in.(${hubIds.join(",")})`);
    if (groupIds.length) filters.push(`group_id.in.(${groupIds.join(",")})`);
    query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as any[];
  if (!rows.length) return [];

  const authorIds = [...new Set(rows.map((row) => row.author_id).filter(Boolean))];
  const hubIds = [...new Set(rows.map((row) => row.discussion_id).filter(Boolean))];
  const groupIds = [...new Set(rows.map((row) => row.group_id).filter(Boolean))];

  const [authors, hubs, groups] = await Promise.all([
    authorIds.length
      ? supabaseAdmin.from("profiles").select("id,username").in("id", authorIds)
      : Promise.resolve({ data: [] }),
    hubIds.length
      ? supabaseAdmin.from("area_discussions").select("id,title").in("id", hubIds)
      : Promise.resolve({ data: [] }),
    groupIds.length
      ? supabaseAdmin.from("discussion_groups").select("id,title").in("id", groupIds)
      : Promise.resolve({ data: [] }),
  ]);

  const authorName = new Map(((authors.data ?? []) as any[]).map((row) => [row.id, row.username ?? null]));
  const hubName = new Map(((hubs.data ?? []) as any[]).map((row) => [row.id, row.title ?? null]));
  const groupName = new Map(((groups.data ?? []) as any[]).map((row) => [row.id, row.title ?? null]));

  return rows.map((row) => {
    const group = row.group_id ? groupName.get(row.group_id) : null;
    const hub = row.discussion_id ? hubName.get(row.discussion_id) : null;
    return {
      id: row.id,
      body: row.body ?? null,
      author_username: row.author_id ? authorName.get(row.author_id) ?? null : null,
      place_name: [group, hub].filter(Boolean).join(" · ") || null,
      image_url:
        row.image_url ||
        row.image_thumb_url ||
        row.gif_preview_url ||
        row.gif_url ||
        row.clip_thumb_url ||
        null,
      likes_count: row.likes_count ?? 0,
      created_at: row.created_at ?? null,
    };
  });
}

export async function fetchProfileItems(
  search?: string,
  offset = 0,
  sort: "name" | "connections" = "name",
): Promise<ProfileItem[]> {
  await assertAdmin();
  const start = Math.max(0, Math.floor(offset) || 0);
  let query = supabaseAdmin
    .from("profiles")
    .select("id,full_name,username,account_role,fake_connection_count")
    .range(start, start + PAGE_SIZE - 1);

  query =
    sort === "connections"
      ? query.order("fake_connection_count", { ascending: false }).order("full_name", { ascending: true })
      : query.order("full_name", { ascending: true });

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
    account_role: p.account_role ?? "user",
    real_connections: countMap[p.id] || 0,
    connections_count: (countMap[p.id] || 0) + Number(p.fake_connection_count ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Boosts
// ---------------------------------------------------------------------------


export async function boostPostLikes(
  postId: string,
  amount: number,
  mode: "add" | "set" = "add",
): Promise<number> {
  await assertAdmin();
  const { data, error: fetchErr } = await supabaseAdmin
    .from("area_discussion_comments")
    .select("likes_count")
    .eq("id", postId)
    .is("parent_id", null)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const current = data?.likes_count ?? 0;
  const newCount =
    mode === "set" ? clampInt(amount, 0, 1_000_000) : current + clampInt(amount, 1, 9999);

  const { error } = await supabaseAdmin
    .from("area_discussion_comments")
    .update({ likes_count: newCount })
    .eq("id", postId)
    .is("parent_id", null);

  if (error) throw new Error(error.message);
  return newCount;
}

export async function boostProfileConnections(
  profileId: string,
  amount: number,
  mode: "add" | "set" = "add",
): Promise<{ newCount: number; inserted: number }> {
  await assertAdmin();

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

  const realCount = count ?? 0;
  const fakeCount = Number(profile?.fake_connection_count ?? 0);
  const nextFakeCount =
    mode === "set"
      ? Math.max(0, clampInt(amount, 0, 1_000_000) - realCount)
      : fakeCount + clampInt(amount, 1, 9999);

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update({ fake_connection_count: nextFakeCount })
    .eq("id", profileId);

  if (updateErr) throw new Error(updateErr.message);

  return { newCount: realCount + nextFakeCount, inserted: nextFakeCount - fakeCount };
}
