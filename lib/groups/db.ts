import { supabaseAdmin } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import type { ProfileStub } from "@/lib/discussions/types";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";
import type {
  AdminGroupContentItem,
  AdminGroupHub,
  AdminGroupListItem,
  MoveGroupsResponse,
  MovedGroupResult,
} from "@/lib/groups/types";

const GROUP_SELECT =
  "id,discussion_id,creator_id,title,description,category,categories,avatar_url,archived_at,created_at,updated_at";
const GROUP_CORE_SELECT =
  "id,discussion_id,creator_id,title,description,archived_at,created_at";

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
): AdminGroupListItem {
  const categoryRaw = row.category != null ? String(row.category) : null;
  const categories = parseCategories(row.categories, categoryRaw);
  return {
    id: String(row.id),
    discussion_id: String(row.discussion_id ?? ""),
    creator_id: String(row.creator_id ?? ""),
    title: String(row.title ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    category: categories[0] ?? categoryRaw,
    categories,
    avatar_url: typeof row.avatar_url === "string" && row.avatar_url.trim() ? row.avatar_url : null,
    archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
    created_at: String(row.created_at ?? ""),
    member_count: memberCount,
    post_count: postCount,
    hub,
    creator,
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
  const [hubs, creators, memberCounts, postCounts] = await Promise.all([
    loadHubs(rows.map((row) => String(row.discussion_id ?? ""))),
    loadCreators(rows.map((row) => String(row.creator_id ?? ""))),
    countForGroups("discussion_group_members", ids),
    countForGroups("area_discussion_comments", ids),
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
      );
    }),
    total: Number(result.count ?? rows.length),
    page,
    pageSize,
  };
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
