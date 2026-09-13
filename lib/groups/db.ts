import { supabaseAdmin } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import type { ProfileStub } from "@/lib/discussions/types";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";
import {
  GROUP_CATEGORY_LABELS,
  GROUP_VISIBILITY_VALUES,
  type AdminGroupContentItem,
  type AdminGroupHub,
  type AdminGroupListItem,
  type AdminGroupMember,
  type GroupVisibility,
  type MoveGroupsResponse,
  type MovedGroupResult,
} from "@/lib/groups/types";

const PROP_ACCOUNT_EMAIL_SUFFIX = "@sterlingtest.local";

const GROUP_SELECT =
  "id,discussion_id,creator_id,title,description,category,categories,avatar_url,visibility,archived_at,created_at,updated_at";
const GROUP_CORE_SELECT =
  "id,discussion_id,creator_id,title,description,archived_at,created_at";

// A single, well-known "Sterling" profile that owns groups the admin dashboard
// creates directly (no real user). Created lazily on first use so environments
// that never touch this feature never get an extra profile row.
const SYSTEM_GROUP_OWNER_EMAIL = "sterling-groups@sterlingtest.local";
const SYSTEM_GROUP_OWNER_USERNAME = "sterling_official";

async function findSystemGroupOwnerId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", SYSTEM_GROUP_OWNER_EMAIL)
    .maybeSingle();
  if (error) return null;
  return data?.id ? String(data.id) : null;
}

export async function getOrCreateSystemGroupOwner(): Promise<string> {
  const existing = await findSystemGroupOwnerId();
  if (existing) return existing;

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: SYSTEM_GROUP_OWNER_EMAIL,
    password: `Sterling-${Math.random().toString(36).slice(2)}${Date.now()}`,
    email_confirm: true,
    user_metadata: { full_name: "Sterling" },
  });
  if (authError || !authData?.user) {
    throw new Error(authError?.message ?? "Could not create the Sterling system account");
  }
  const userId = authData.user.id;

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      email: SYSTEM_GROUP_OWNER_EMAIL,
      full_name: "Sterling",
      username: SYSTEM_GROUP_OWNER_USERNAME,
      account_role: "owner",
      bio: "Official Sterling account. Owns groups the Sterling team creates directly.",
      operating_markets: [],
      main_goals: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId, false).catch(() => undefined);
    throw new Error(profileError.message);
  }
  return userId;
}

async function uploadGroupAvatar(
  groupId: string,
  buffer: Buffer,
  contentType: string | null,
): Promise<string> {
  const storagePath = `${groupId}/avatar.jpg`;
  const { error: uploadError } = await supabaseAdmin.storage.from("group-images").upload(storagePath, buffer, {
    contentType: contentType || "image/jpeg",
    upsert: true,
    cacheControl: "3600",
  });
  if (uploadError) throw new Error(`Could not upload group photo: ${uploadError.message}`);
  const { data: pub } = supabaseAdmin.storage.from("group-images").getPublicUrl(storagePath);
  // The DB trigger that validates avatar_url requires the exact storage path
  // with no query string, so drop the cache-busting suffix Supabase adds.
  const publicUrl = String(pub?.publicUrl ?? "").split("?")[0];
  if (!publicUrl) throw new Error("Could not resolve the uploaded group photo URL");
  return publicUrl;
}

const SORT_COLUMNS = new Set(["created_at", "title"]);

function throwDbError(error: { message?: string } | null, fallback: string): never {
  throw new Error(mapSeededHubRpcError(error?.message || fallback));
}

function sanitizeIlike(raw: string): string {
  return raw.replace(/[%_,()]/g, "").trim().slice(0, 80);
}

function parseSort(sort: string): { column: string; ascending: boolean } {
  const ascending = !sort.startsWith("-");
  const column = sort.replace(/^-/, "");
  if (!SORT_COLUMNS.has(column)) return { column: "created_at", ascending: false };
  return { column, ascending };
}

function parseCategories(raw: unknown, fallback?: string | null): string[] {
  const fromArray = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const unique: string[] = [];
  for (const id of fromArray) {
    if (!unique.includes(id)) unique.push(id);
  }
  const fallbackId = String(fallback ?? "").trim();
  if (unique.length === 0 && fallbackId) unique.push(fallbackId);
  return unique;
}

async function uniqueGroupTitle(discussionId: string, wanted: string, excludeGroupId?: string): Promise<string> {
  const base = (wanted.trim() || "Group").slice(0, 40);
  const { data, error } = await supabaseAdmin
    .from("discussion_groups")
    .select("id,title,archived_at")
    .eq("discussion_id", discussionId);
  if (error) throwDbError(error, "Failed to check group names");
  const taken = new Set(
    (data ?? [])
      .filter((row: { id?: string; title?: string | null; archived_at?: string | null }) => {
        if (row.archived_at) return false;
        if (excludeGroupId && String(row.id) === excludeGroupId) return false;
        return true;
      })
      .map((row: { title?: string | null }) => String(row.title).trim().toLowerCase()),
  );
  for (let i = 1; i <= 50; i += 1) {
    const suffix = i === 1 ? "" : ` ${i}`;
    const title = `${base.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
    if (!taken.has(title.toLowerCase())) return title;
  }
  throw new Error("A group with that name already exists in this hub.");
}

async function livingProfileIds(candidates: string[]): Promise<string[]> {
  const unique = [...new Set(candidates.filter(Boolean))];
  if (!unique.length) return [];
  const living: string[] = [];
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await supabaseAdmin.from("profiles").select("id").in("id", chunk);
    if (error) throwDbError(error, "Failed to verify members");
    for (const row of data ?? []) living.push(String(row.id));
  }
  const allowed = new Set(living);
  return unique.filter((id) => allowed.has(id));
}

async function upsertChunks(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  fallback: string,
) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabaseAdmin.from(table).upsert(rows.slice(i, i + 200), { onConflict });
    if (error) throwDbError(error, fallback);
  }
}

async function pageGroupMembers(groupId: string): Promise<string[]> {
  const ids: string[] = [];
  const page = 1000;
  for (let from = 0; from < 20000; from += page) {
    const { data, error } = await supabaseAdmin
      .from("discussion_group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .order("user_id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throwDbError(error, "Failed to load group members");
    const batch = (data ?? []) as Array<{ user_id?: string }>;
    for (const row of batch) {
      const id = String(row.user_id ?? "").trim();
      if (id) ids.push(id);
    }
    if (batch.length < page) break;
  }
  return ids;
}

async function moveGroupPosts(groupId: string, targetHubId: string): Promise<number> {
  let moved = 0;
  for (let i = 0; i < 50; i += 1) {
    const { data, error } = await supabaseAdmin
      .from("area_discussion_comments")
      .select("id")
      .eq("group_id", groupId)
      .neq("discussion_id", targetHubId)
      .limit(500);
    if (error) throwDbError(error, "Failed to move posts");
    const ids = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (!ids.length) break;
    const { error: updateError } = await supabaseAdmin
      .from("area_discussion_comments")
      .update({ discussion_id: targetHubId })
      .in("id", ids);
    if (updateError) throwDbError(updateError, "Failed to move posts");
    moved += ids.length;
    if (ids.length < 500) break;
  }
  return moved;
}

async function refreshHubCounts(hubId: string) {
  const [{ count: commentCount }, { count: participantCount }] = await Promise.all([
    supabaseAdmin
      .from("area_discussion_comments")
      .select("id", { count: "exact", head: true })
      .eq("discussion_id", hubId),
    supabaseAdmin
      .from("area_discussion_participants")
      .select("user_id", { count: "exact", head: true })
      .eq("discussion_id", hubId),
  ]);
  const { error } = await supabaseAdmin
    .from("area_discussions")
    .update({
      comment_count: commentCount ?? 0,
      unique_participant_count: participantCount ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", hubId);
  if (error) throwDbError(error, "Failed to refresh hub counts");
}

async function loadCreators(ids: string[]): Promise<Map<string, ProfileStub>> {
  const map = new Map<string, ProfileStub>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,username,avatar_url")
    .in("id", unique);
  if (error) throw new Error(error.message);
  for (const profile of (data ?? []) as ProfileStub[]) {
    map.set(profile.id, profile);
  }
  return map;
}

async function loadHubs(ids: string[]): Promise<Map<string, AdminGroupHub>> {
  const map = new Map<string, AdminGroupHub>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const { data, error } = await supabaseAdmin
    .from("area_discussions")
    .select("id,title,location_hint,origin,avatar_url")
    .in("id", unique);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    map.set(String(row.id), {
      id: String(row.id),
      title: String(row.title ?? ""),
      location_hint: row.location_hint ?? null,
      origin: row.origin ?? null,
      avatar_url: row.avatar_url ?? null,
    });
  }
  return map;
}

async function countForGroups(table: string, groupIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!groupIds.length) return counts;
  await Promise.all(
    groupIds.map(async (id) => {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select("group_id", { count: "exact", head: true })
        .eq("group_id", id);
      if (error) {
        if (isMissingSchemaError(error)) return;
        throw new Error(error.message);
      }
      counts.set(id, count ?? 0);
    }),
  );
  return counts;
}

async function matchingHubIds(search: string): Promise<string[]> {
  const q = sanitizeIlike(search);
  if (!q) return [];
  const { data, error } = await supabaseAdmin
    .from("area_discussions")
    .select("id")
    .or(`title.ilike.%${q}%,location_hint.ilike.%${q}%`)
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { id: string }) => String(row.id));
}

function toListItem(
  row: Record<string, unknown>,
  hub: AdminGroupHub | null,
  creator: ProfileStub | null,
  memberCount: number,
  postCount: number,
  systemOwnerId: string | null,
): AdminGroupListItem {
  const categoryRaw = row.category != null ? String(row.category) : null;
  const categories = parseCategories(row.categories, categoryRaw);
  const creatorId = String(row.creator_id ?? "");
  return {
    id: String(row.id),
    discussion_id: String(row.discussion_id ?? ""),
    creator_id: creatorId,
    title: String(row.title ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    category: categories[0] ?? categoryRaw,
    categories,
    avatar_url: typeof row.avatar_url === "string" && row.avatar_url.trim() ? row.avatar_url : null,
    visibility: typeof row.visibility === "string" && row.visibility ? row.visibility : "public",
    archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
    created_at: String(row.created_at ?? ""),
    member_count: memberCount,
    post_count: postCount,
    hub,
    creator,
    is_system_owned: Boolean(systemOwnerId) && creatorId === systemOwnerId,
  };
}

export type ListAdminGroupsInput = {
  search: string | null;
  hubId: string | null;
  includeArchived: boolean;
  sort: string;
  page: number;
  pageSize: number;
};

export async function listAdminGroups(input: ListAdminGroupsInput): Promise<{
  groups: AdminGroupListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(100, Math.max(1, input.pageSize));
  const { column, ascending } = parseSort(input.sort);
  const search = input.search ? sanitizeIlike(input.search) : "";
  const hubIdsFromSearch = search ? await matchingHubIds(search) : [];

  async function run(select: string) {
    let query = supabaseAdmin.from("discussion_groups").select(select, { count: "exact" });
    if (!input.includeArchived) query = query.is("archived_at", null);
    if (input.hubId) query = query.eq("discussion_id", input.hubId);
    if (search) {
      if (hubIdsFromSearch.length) {
        query = query.or(`title.ilike.%${search}%,discussion_id.in.(${hubIdsFromSearch.join(",")})`);
      } else {
        query = query.ilike("title", `%${search}%`);
      }
    }
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    return query.order(column, { ascending }).range(from, to);
  }

  let result = await run(GROUP_SELECT);
  if (result.error && isMissingSchemaError(result.error)) {
    result = await run(GROUP_CORE_SELECT);
  }
  if (result.error) throw new Error(result.error.message);

  const rows = (result.data ?? []) as Record<string, unknown>[];
  const ids = rows.map((row) => String(row.id));
  const [hubs, creators, memberCounts, postCounts, systemOwnerId] = await Promise.all([
    loadHubs(rows.map((row) => String(row.discussion_id ?? ""))),
    loadCreators(rows.map((row) => String(row.creator_id ?? ""))),
    countForGroups("discussion_group_members", ids),
    countForGroups("area_discussion_comments", ids),
    findSystemGroupOwnerId(),
  ]);

  return {
    groups: rows.map((row) => {
      const id = String(row.id);
      return toListItem(
        row,
        hubs.get(String(row.discussion_id ?? "")) ?? null,
        creators.get(String(row.creator_id ?? "")) ?? null,
        memberCounts.get(id) ?? 0,
        postCounts.get(id) ?? 0,
        systemOwnerId,
      );
    }),
    total: Number(result.count ?? rows.length),
    page,
    pageSize,
  };
}

export async function getAdminGroupById(groupId: string): Promise<AdminGroupListItem> {
  const { data: row, error } = await supabaseAdmin
    .from("discussion_groups")
    .select(GROUP_SELECT)
    .eq("id", groupId)
    .single();
  if (error) throwDbError(error, "Failed to load group");

  const [hubs, creators, memberCounts, postCounts, systemOwnerId] = await Promise.all([
    loadHubs([String(row.discussion_id ?? "")]),
    loadCreators([String(row.creator_id ?? "")]),
    countForGroups("discussion_group_members", [groupId]),
    countForGroups("area_discussion_comments", [groupId]),
    findSystemGroupOwnerId(),
  ]);

  return toListItem(
    row,
    hubs.get(String(row.discussion_id ?? "")) ?? null,
    creators.get(String(row.creator_id ?? "")) ?? null,
    memberCounts.get(groupId) ?? 0,
    postCounts.get(groupId) ?? 0,
    systemOwnerId,
  );
}

export async function moveGroupToHub(groupId: string, targetHubId: string): Promise<MovedGroupResult> {
  const { data: groupRow, error: groupError } = await supabaseAdmin
    .from("discussion_groups")
    .select(GROUP_SELECT)
    .eq("id", groupId)
    .maybeSingle();
  if (groupError && isMissingSchemaError(groupError)) {
    const fallback = await supabaseAdmin
      .from("discussion_groups")
      .select(GROUP_CORE_SELECT)
      .eq("id", groupId)
      .maybeSingle();
    if (fallback.error) throwDbError(fallback.error, "Failed to load group");
    if (!fallback.data) throw new Error("group_not_found");
    return moveLoadedGroup(fallback.data as Record<string, unknown>, targetHubId);
  }
  if (groupError) throwDbError(groupError, "Failed to load group");
  if (!groupRow) throw new Error("group_not_found");
  return moveLoadedGroup(groupRow as Record<string, unknown>, targetHubId);
}

async function moveLoadedGroup(group: Record<string, unknown>, targetHubId: string): Promise<MovedGroupResult> {
  const groupId = String(group.id);
  const sourceHubId = String(group.discussion_id ?? "");
  if (!sourceHubId) throw new Error("group_not_found");
  if (sourceHubId === targetHubId) throw new Error("same_hub");

  const { data: target, error: targetError } = await supabaseAdmin
    .from("area_discussions")
    .select("id,title,origin")
    .eq("id", targetHubId)
    .maybeSingle();
  if (targetError) throwDbError(targetError, "Failed to load destination hub");
  if (!target) throw new Error("discussion_not_found");
  if (target.origin !== "seeded") throw new Error("seeded_hub_required");

  const { data: source, error: sourceError } = await supabaseAdmin
    .from("area_discussions")
    .select("id,title")
    .eq("id", sourceHubId)
    .maybeSingle();
  if (sourceError) throwDbError(sourceError, "Failed to load current hub");

  const previousTitle = String(group.title ?? "").trim() || "Group";
  const archived = Boolean(group.archived_at);
  const nextTitle = archived
    ? previousTitle.slice(0, 40)
    : await uniqueGroupTitle(targetHubId, previousTitle, groupId);

  const now = new Date().toISOString();
  let update = await supabaseAdmin
    .from("discussion_groups")
    .update({
      discussion_id: targetHubId,
      title: nextTitle,
      updated_at: now,
    })
    .eq("id", groupId)
    .select("id,title")
    .maybeSingle();

  const uniqueClash =
    update.error &&
    (update.error.code === "23505" || String(update.error.message ?? "").toLowerCase().includes("unique"));
  if (uniqueClash) {
    const retryTitle = await uniqueGroupTitle(targetHubId, previousTitle, groupId);
    update = await supabaseAdmin
      .from("discussion_groups")
      .update({
        discussion_id: targetHubId,
        title: retryTitle,
        updated_at: now,
      })
      .eq("id", groupId)
      .select("id,title")
      .maybeSingle();
  }
  if (update.error) throwDbError(update.error, "Failed to move group");
  if (!update.data) throw new Error("group_not_found");

  const postsMoved = await moveGroupPosts(groupId, targetHubId);

  const memberIds = await livingProfileIds(await pageGroupMembers(groupId));
  if (memberIds.length) {
    await upsertChunks(
      "area_discussion_participants",
      memberIds.map((userId) => ({ discussion_id: targetHubId, user_id: userId })),
      "discussion_id,user_id",
      "Failed to join members to the destination hub",
    );
  }

  const { error: redirectError } = await supabaseAdmin
    .from("area_discussions")
    .update({ migrated_to_discussion_id: targetHubId, updated_at: now })
    .eq("migrated_to_group_id", groupId);
  if (redirectError && !isMissingSchemaError(redirectError)) {
    console.error("[groups] failed to update hub redirects:", redirectError.message);
  }

  await Promise.all([refreshHubCounts(sourceHubId), refreshHubCounts(targetHubId)]);

  const finalTitle = String(update.data.title ?? nextTitle);
  return {
    group_id: groupId,
    group_title: finalTitle,
    previous_title: previousTitle,
    source_hub_id: sourceHubId,
    source_hub_title: String(source?.title ?? "Unknown hub"),
    target_hub_id: String(target.id),
    target_hub_title: String(target.title ?? ""),
    posts_moved: postsMoved,
    members_joined: memberIds.length,
    renamed: finalTitle.trim().toLowerCase() !== previousTitle.toLowerCase(),
  };
}

const CONTENT_SELECT = "id,parent_id,author_id,body,likes_count,created_at,image_url,gif_preview_url";
const CONTENT_CORE_SELECT = "id,author_id,body,likes_count,created_at";

type ContentRow = {
  id: string;
  parent_id?: string | null;
  author_id: string | null;
  body: string | null;
  likes_count: number | null;
  created_at: string;
  image_url?: string | null;
  gif_preview_url?: string | null;
};

function toContentItem(row: ContentRow, author: ProfileStub | null): AdminGroupContentItem {
  return {
    id: String(row.id),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    body: String(row.body ?? ""),
    likes_count: Number(row.likes_count ?? 0),
    created_at: String(row.created_at ?? ""),
    image_url: row.image_url ?? null,
    gif_preview_url: row.gif_preview_url ?? null,
    author,
    replies: [],
  };
}

export async function listGroupContent(groupId: string): Promise<AdminGroupContentItem[]> {
  let result = await supabaseAdmin
    .from("area_discussion_comments")
    .select(CONTENT_SELECT)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (result.error && isMissingSchemaError(result.error)) {
    result = await supabaseAdmin
      .from("area_discussion_comments")
      .select(CONTENT_CORE_SELECT)
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(500);
  }
  if (result.error) throwDbError(result.error, "Failed to load group content");

  const rows = (result.data ?? []) as ContentRow[];
  const authors = await loadCreators(rows.map((row) => String(row.author_id ?? "")));

  const itemsById = new Map<string, AdminGroupContentItem>();
  for (const row of rows) {
    const author = row.author_id ? authors.get(String(row.author_id)) ?? null : null;
    itemsById.set(String(row.id), toContentItem(row, author));
  }

  const topLevel: AdminGroupContentItem[] = [];
  for (const row of rows) {
    const item = itemsById.get(String(row.id))!;
    const parent = row.parent_id ? itemsById.get(String(row.parent_id)) : undefined;
    if (parent) {
      parent.replies.push(item);
    } else {
      topLevel.push(item);
    }
  }
  for (const item of itemsById.values()) {
    item.replies.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  return topLevel;
}

export async function publishGroupContent(input: {
  groupId: string;
  accountId: string;
  body: string;
  parentId?: string | null;
}): Promise<AdminGroupContentItem> {
  const safeBody = input.body.trim();
  if (!safeBody) throw new Error("Post body is required");

  const { data: group, error: groupError } = await supabaseAdmin
    .from("discussion_groups")
    .select("id,discussion_id")
    .eq("id", input.groupId)
    .maybeSingle();
  if (groupError) throwDbError(groupError, "Failed to load group");
  if (!group) throw new Error("group_not_found");

  // area_discussion_comments has a trigger that rejects any insert that
  // doesn't go through the app's create_area_discussion_comment() RPC (which
  // requires a real authenticated user + device location). Admin seeding has
  // neither, so it goes through admin_create_area_discussion_comment() — a
  // service_role-only exception to that same check.
  const { data, error } = await supabaseAdmin
    .rpc("admin_create_area_discussion_comment", {
      p_discussion_id: group.discussion_id,
      p_group_id: input.groupId,
      p_author_id: input.accountId,
      p_body: safeBody,
      p_parent_id: input.parentId ?? null,
    })
    .single();
  if (error) throwDbError(error, "Failed to publish group content");

  const authors = await loadCreators([input.accountId]);
  const row: ContentRow = {
    id: data.out_id,
    parent_id: data.out_parent_id ?? null,
    author_id: data.out_author_id,
    body: data.out_body,
    likes_count: data.out_likes_count,
    created_at: data.out_created_at,
  };
  return toContentItem(row, authors.get(input.accountId) ?? null);
}

export async function listGroupMembers(groupId: string): Promise<AdminGroupMember[]> {
  const { data, error } = await supabaseAdmin
    .from("discussion_group_members")
    .select("user_id,role")
    .eq("group_id", groupId)
    .limit(500);
  if (error) throwDbError(error, "Failed to load group members");

  const rows = (data ?? []) as Array<{ user_id: string; role: string | null }>;
  const ids = [...new Set(rows.map((r) => String(r.user_id)))];
  const profiles = new Map<
    string,
    { id: string; full_name: string | null; username: string | null; avatar_url: string | null; email: string | null }
  >();
  if (ids.length) {
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,username,avatar_url,email")
      .in("id", ids);
    if (profileError) throwDbError(profileError, "Failed to load member profiles");
    for (const p of profileRows ?? []) profiles.set(String(p.id), p as never);
  }

  return rows.map((r) => {
    const profile = profiles.get(String(r.user_id));
    const email = profile?.email ? String(profile.email).toLowerCase() : "";
    return {
      user_id: String(r.user_id),
      role: r.role ?? "member",
      is_prop_account: email.endsWith(PROP_ACCOUNT_EMAIL_SUFFIX),
      profile: profile
        ? { id: profile.id, full_name: profile.full_name, username: profile.username, avatar_url: profile.avatar_url }
        : null,
    };
  });
}

export async function addGroupMember(groupId: string, userId: string, role = "member"): Promise<void> {
  const { data: group, error: groupError } = await supabaseAdmin
    .from("discussion_groups")
    .select("id,discussion_id")
    .eq("id", groupId)
    .maybeSingle();
  if (groupError) throwDbError(groupError, "Failed to load group");
  if (!group) throw new Error("group_not_found");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throwDbError(profileError, "Failed to verify account");
  if (!profile) throw new Error("account_not_found");

  const { error } = await supabaseAdmin
    .from("discussion_group_members")
    .upsert({ group_id: groupId, user_id: userId, role }, { onConflict: "group_id,user_id" });
  if (error) throwDbError(error, "Failed to add member");

  const { error: participantError } = await supabaseAdmin
    .from("area_discussion_participants")
    .upsert({ discussion_id: group.discussion_id, user_id: userId }, { onConflict: "discussion_id,user_id" });
  if (participantError && !isMissingSchemaError(participantError)) {
    console.error("[groups] failed to join member to hub participants:", participantError.message);
  }
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("discussion_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throwDbError(error, "Failed to remove member");
}

export async function deleteGroupContent(groupId: string, commentId: string): Promise<void> {
  const { data: comment, error: commentError } = await supabaseAdmin
    .from("area_discussion_comments")
    .select("id,group_id")
    .eq("id", commentId)
    .maybeSingle();
  if (commentError) throwDbError(commentError, "Failed to load post");
  if (!comment || String(comment.group_id ?? "") !== groupId) throw new Error("comment_not_found");

  const { error } = await supabaseAdmin.rpc("admin_moderate_discussion_comment", {
    p_comment_id: commentId,
    p_action: "delete",
  });
  if (error) throwDbError(error, "Failed to delete post");
}

export async function moveGroupsToHub(groupIds: string[], targetHubId: string): Promise<MoveGroupsResponse> {
  const uniqueIds = [...new Set(groupIds.map((id) => String(id).trim()).filter(Boolean))];
  if (uniqueIds.length === 0) throw new Error("groups_required");
  if (uniqueIds.length > 50) throw new Error("move_batch_too_large");

  const moved: MovedGroupResult[] = [];
  const errors: Array<{ group_id: string; error: string }> = [];
  let skipped = 0;

  for (const groupId of uniqueIds) {
    try {
      moved.push(await moveGroupToHub(groupId, targetHubId));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to move group";
      if (message === "same_hub" || message.toLowerCase().includes("same_hub")) {
        skipped += 1;
        continue;
      }
      errors.push({ group_id: groupId, error: mapSeededHubRpcError(message) });
    }
  }

  return {
    moved,
    errors,
    moved_count: moved.length,
    error_count: errors.length,
    skipped_count: skipped,
  };
}

const VALID_GROUP_CATEGORIES = new Set(Object.keys(GROUP_CATEGORY_LABELS));

function sanitizeCategories(raw: string[] | undefined): string[] {
  const cleaned = (raw ?? [])
    .map((c) => String(c).trim().toLowerCase())
    .filter((c) => VALID_GROUP_CATEGORIES.has(c));
  const unique = [...new Set(cleaned)].slice(0, 4);
  return unique.length > 0 ? unique : ["other"];
}

function sanitizeVisibility(raw: string | undefined): GroupVisibility {
  const v = (raw ?? "public").trim().toLowerCase();
  return (GROUP_VISIBILITY_VALUES as string[]).includes(v) ? (v as GroupVisibility) : "public";
}

export type SystemGroupAvatarInput = {
  buffer: Buffer;
  contentType: string | null;
} | null;

export type CreateSystemGroupInput = {
  hubId: string;
  title: string;
  description?: string | null;
  categories?: string[];
  visibility?: string;
  avatar?: SystemGroupAvatarInput;
};

/** Creates a group owned by the Sterling system account (no real user), always
 * eligible for public discovery. Admin-only: bypasses the per-user creation
 * cap and the "must be a hub participant" check real users go through. */
export async function createSystemGroup(input: CreateSystemGroupInput): Promise<AdminGroupListItem> {
  const title = input.title.trim();
  if (!title || title.length > 40) throw new Error("discussion_group_title_invalid");

  const { data: hub, error: hubError } = await supabaseAdmin
    .from("area_discussions")
    .select("id,origin")
    .eq("id", input.hubId)
    .maybeSingle();
  if (hubError) throwDbError(hubError, "Failed to load hub");
  if (!hub) throw new Error("discussion_not_found");
  if (hub.origin !== "seeded") throw new Error("seeded_hub_required");

  const ownerId = await getOrCreateSystemGroupOwner();
  const uniqueTitle = await uniqueGroupTitle(input.hubId, title);
  const categories = sanitizeCategories(input.categories);
  const visibility = sanitizeVisibility(input.visibility);

  const { data: row, error } = await supabaseAdmin
    .from("discussion_groups")
    .insert({
      discussion_id: input.hubId,
      creator_id: ownerId,
      title: uniqueTitle,
      description: input.description?.trim() || null,
      category: categories[0],
      categories,
      visibility,
    })
    .select("id")
    .single();
  if (error) throwDbError(error, "Failed to create group");

  await supabaseAdmin
    .from("discussion_group_members")
    .upsert({ group_id: row.id, user_id: ownerId, role: "owner" }, { onConflict: "group_id,user_id" });

  if (input.avatar) {
    const avatarUrl = await uploadGroupAvatar(row.id, input.avatar.buffer, input.avatar.contentType);
    const { error: avatarError } = await supabaseAdmin
      .from("discussion_groups")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (avatarError) throwDbError(avatarError, "Group created, but the photo could not be saved");
  }

  return getAdminGroupById(String(row.id));
}

export type UpdateSystemGroupInput = {
  hubId?: string;
  title?: string;
  description?: string | null;
  categories?: string[];
  visibility?: string;
  avatar?: SystemGroupAvatarInput;
  clearAvatar?: boolean;
};

/** Full edit for a Sterling-owned group: title, description, categories,
 * visibility, photo, and which hub it lives in. Refuses to touch a group a
 * real user owns — this is not a general-purpose group editor. */
export async function updateSystemGroup(
  groupId: string,
  input: UpdateSystemGroupInput,
): Promise<AdminGroupListItem> {
  const ownerId = await getOrCreateSystemGroupOwner();

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("discussion_groups")
    .select("id,creator_id,discussion_id")
    .eq("id", groupId)
    .maybeSingle();
  if (existingError) throwDbError(existingError, "Failed to load group");
  if (!existing) throw new Error("group_not_found");
  if (String(existing.creator_id) !== ownerId) {
    throw new Error("Only Sterling-owned groups can be edited here");
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title || title.length > 40) throw new Error("discussion_group_title_invalid");
    updates.title = title;
  }
  if (input.description !== undefined) {
    updates.description = input.description?.trim() || null;
  }
  if (input.categories !== undefined) {
    const categories = sanitizeCategories(input.categories);
    updates.categories = categories;
    updates.category = categories[0];
  }
  if (input.visibility !== undefined) {
    updates.visibility = sanitizeVisibility(input.visibility);
  }

  if (input.clearAvatar) {
    updates.avatar_url = null;
  } else if (input.avatar) {
    updates.avatar_url = await uploadGroupAvatar(groupId, input.avatar.buffer, input.avatar.contentType);
  }

  if (Object.keys(updates).length > 1) {
    const { error } = await supabaseAdmin.from("discussion_groups").update(updates).eq("id", groupId);
    if (error) throwDbError(error, "Failed to update group");
  }

  const targetHubId = input.hubId?.trim();
  if (targetHubId && targetHubId !== String(existing.discussion_id)) {
    await moveGroupToHub(groupId, targetHubId);
  }

  return getAdminGroupById(groupId);
}
