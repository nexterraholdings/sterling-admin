import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";
import {
  clampSeededRadius,
  isValidSeededCoordinate,
  placeKindForRadius,
  type CityHubsLaunchState,
  type CityHubsReleaseResult,
  type ConvertedHubResult,
  type NearbyUserHub,
  type SeededHubListItem,
  type SeededPlaceKind,
} from "@/lib/seeded-hubs/types";
import { isHubNameUniqueViolation, prepareUniqueHubName } from "@/lib/hub-name-db";

const SEEDED_SELECT =
  "id,title,description,center_lat,center_lng,radius_miles,location_hint,place_kind,place_key,avatar_url,unique_participant_count,comment_count,created_at,origin,seeded_visible";

const USER_SELECT =
  "id,title,description,center_lat,center_lng,radius_miles,location_hint,lifecycle_status,avatar_url,creator_id,unique_participant_count,comment_count,created_at,origin";

type HubRow = {
  id: string;
  title: string;
  description: string | null;
  center_lat: number;
  center_lng: number;
  radius_miles: number;
  location_hint: string | null;
  place_kind?: string | null;
  place_key?: string | null;
  avatar_url: string | null;
  unique_participant_count: number | null;
  comment_count: number | null;
  created_at: string;
  origin?: string | null;
  lifecycle_status?: string;
  creator_id?: string | null;
  banner_url?: string | null;
  is_live?: boolean;
  migrated_at?: string | null;
  seeded_visible?: boolean | null;
};

function throwDbError(error: { message?: string } | null, fallback: string): never {
  throw new Error(mapSeededHubRpcError(error?.message || fallback));
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function defaultDescription(kind: SeededPlaceKind, hint: string | null): string {
  const place = kind === "neighborhood" ? "neighborhood" : "city";
  const where = hint ? ` for ${hint}` : "";
  return `The ${place} hub${where}. Join to post, or start a group for a local spot.`;
}

function toSeededItem(row: HubRow, groupCount = 0): SeededHubListItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    center_lat: Number(row.center_lat),
    center_lng: Number(row.center_lng),
    radius_miles: Number(row.radius_miles),
    location_hint: row.location_hint,
    place_kind: row.place_kind === "neighborhood" ? "neighborhood" : row.place_kind === "city" ? "city" : null,
    place_key: row.place_key ?? null,
    avatar_url: row.avatar_url,
    unique_participant_count: Number(row.unique_participant_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
    created_at: row.created_at,
    group_count: groupCount,
    seeded_visible: Boolean(row.seeded_visible),
  };
}

export async function listSeededHubs(search: string | null): Promise<SeededHubListItem[]> {
  let query = supabaseAdmin
    .from("area_discussions")
    .select(SEEDED_SELECT)
    .eq("origin", "seeded")
    .order("title", { ascending: true })
    .limit(2000);

  const q = search?.trim().replace(/[,()%]/g, "").slice(0, 80);
  if (q) {
    query = query.or(`title.ilike.%${q}%,location_hint.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throwDbError(error, "Failed to list seeded hubs");

  const hubs = (data ?? []) as HubRow[];
  const ids = hubs.map((hub) => hub.id);
  const groupCounts = new Map<string, number>();
  if (ids.length) {
    const { data: groups, error: groupError } = await supabaseAdmin
      .from("discussion_groups")
      .select("discussion_id, archived_at")
      .in("discussion_id", ids);
    if (!groupError) {
      for (const group of groups ?? []) {
        if (group.archived_at) continue;
        const id = String(group.discussion_id);
        groupCounts.set(id, (groupCounts.get(id) ?? 0) + 1);
      }
    }
  }

  return hubs.map((hub) => toSeededItem(hub, groupCounts.get(hub.id) ?? 0));
}

export async function listNearbyUserHubs(
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<NearbyUserHub[]> {
  const pad = radiusMiles / 69 + 0.02;
  const { data, error } = await supabaseAdmin
    .from("area_discussions")
    .select(USER_SELECT)
    .or("origin.eq.user,origin.is.null")
    .gte("center_lat", lat - pad)
    .lte("center_lat", lat + pad)
    .gte("center_lng", lng - pad)
    .lte("center_lng", lng + pad)
    .limit(500);
  if (error) throwDbError(error, "Failed to list nearby hubs");

  const inside = ((data ?? []) as HubRow[])
    .filter((row) => {
      if (!isLiveUserHub(row)) return false;
      const distance = haversineMiles(lat, lng, Number(row.center_lat), Number(row.center_lng));
      return distance <= radiusMiles;
    })
    .map((row) => ({
      row,
      distance: haversineMiles(lat, lng, Number(row.center_lat), Number(row.center_lng)),
    }))
    .sort((a, b) => a.distance - b.distance || a.row.title.localeCompare(b.row.title))
    .slice(0, 200);

  const creators = await loadCreators(inside.map((item) => item.row.creator_id));
  return inside.map(({ row, distance }) =>
    toUserHub(row, creators, Math.round(distance * 100) / 100, true),
  );
}

function isLiveUserHub(row: HubRow): boolean {
  if (row.origin === "seeded") return false;
  if (row.lifecycle_status === "expired" && Number(row.comment_count ?? 0) === 0) return false;
  return true;
}

async function loadCreators(ids: Array<string | null | undefined>) {
  const creatorIds = [...new Set(ids.filter(Boolean))] as string[];
  const creators = new Map<string, NearbyUserHub["creator"]>();
  if (!creatorIds.length) return creators;
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,username,avatar_url")
    .in("id", creatorIds);
  for (const profile of profiles ?? []) {
    creators.set(String(profile.id), {
      id: String(profile.id),
      full_name: profile.full_name ?? null,
      username: profile.username ?? null,
      avatar_url: profile.avatar_url ?? null,
    });
  }
  return creators;
}

function toUserHub(
  row: HubRow,
  creators: Map<string, NearbyUserHub["creator"]>,
  distance: number | null,
  inRange?: boolean,
): NearbyUserHub {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    center_lat: Number(row.center_lat),
    center_lng: Number(row.center_lng),
    radius_miles: Number(row.radius_miles),
    location_hint: row.location_hint,
    lifecycle_status: row.lifecycle_status ?? "active",
    avatar_url: row.avatar_url,
    creator_id: row.creator_id ?? null,
    unique_participant_count: Number(row.unique_participant_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
    created_at: row.created_at,
    distance_miles: distance,
    in_range: inRange,
    creator: row.creator_id ? creators.get(row.creator_id) ?? null : null,
  };
}

export async function listAllUserHubs(input?: {
  search?: string | null;
  fromLat?: number | null;
  fromLng?: number | null;
  radiusMiles?: number | null;
}): Promise<NearbyUserHub[]> {
  const { data, error } = await supabaseAdmin
    .from("area_discussions")
    .select(USER_SELECT)
    .or("origin.eq.user,origin.is.null")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throwDbError(error, "Failed to list user hubs");

  const q = input?.search?.trim().toLowerCase() ?? "";
  const fromLat = input?.fromLat ?? null;
  const fromLng = input?.fromLng ?? null;
  const radius = input?.radiusMiles ?? null;
  const hasCenter = fromLat != null && fromLng != null && Number.isFinite(fromLat) && Number.isFinite(fromLng);

  const rows = ((data ?? []) as HubRow[]).filter((row) => {
    if (!isLiveUserHub(row)) return false;
    if (!q) return true;
    return `${row.title} ${row.location_hint ?? ""}`.toLowerCase().includes(q);
  });
  const creators = await loadCreators(rows.map((row) => row.creator_id));

  return rows
    .map((row) => {
      const distance = hasCenter
        ? Math.round(haversineMiles(fromLat, fromLng, Number(row.center_lat), Number(row.center_lng)) * 100) / 100
        : null;
      const inRange = distance != null && radius != null ? distance <= radius : undefined;
      return toUserHub(row, creators, distance, inRange);
    })
    .sort((a, b) => {
      if (a.distance_miles != null && b.distance_miles != null) return a.distance_miles - b.distance_miles;
      return a.title.localeCompare(b.title);
    });
}

export async function createSeededHub(input: {
  title: string;
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
  locationHint: string | null;
  placeKind: SeededPlaceKind;
  description: string | null;
}): Promise<SeededHubListItem> {
  const radius = clampSeededRadius(input.radiusMiles);
  if (!isValidSeededCoordinate(input.centerLat, input.centerLng)) {
    throw new Error("invalid_coordinates");
  }

  const slug = await prepareUniqueHubName(input.title);
  const kind = placeKindForRadius(radius);

  const hint = input.locationHint?.trim() || null;
  const description = input.description?.trim() || defaultDescription(kind, hint);
  const insert = {
    creator_id: null,
    title: slug,
    description,
    center_lat: input.centerLat,
    center_lng: input.centerLng,
    radius_miles: radius,
    location_hint: hint,
    lifecycle_status: "active",
    bootstrap_expires_at: null,
    unique_participant_count: 0,
    last_engagement_at: new Date().toISOString(),
    origin: "seeded",
    place_kind: kind,
    place_key: `admin:${randomUUID().replace(/-/g, "")}`,
    never_expires: true,
  };

  const { data, error } = await supabaseAdmin
    .from("area_discussions")
    .insert(insert)
    .select(SEEDED_SELECT)
    .single();
  if (error) {
    if (isHubNameUniqueViolation(error)) throw new Error("That hub name is already in use.");
    throwDbError(error, "Failed to create seeded hub");
  }
  return toSeededItem(data as HubRow);
}

async function groupCountForHub(id: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("discussion_groups")
    .select("id, archived_at")
    .eq("discussion_id", id);
  if (error) return 0;
  return (data ?? []).filter((row: { archived_at?: string | null }) => !row.archived_at).length;
}

export async function updateSeededHubCoverage(
  id: string,
  input: {
    centerLat?: number;
    centerLng?: number;
    radiusMiles?: number;
    locationHint?: string | null;
    placeKind?: SeededPlaceKind;
  },
): Promise<SeededHubListItem> {
  const { data: existing, error: loadError } = await supabaseAdmin
    .from("area_discussions")
    .select(SEEDED_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (loadError) throwDbError(loadError, "Failed to load seeded hub");
  if (!existing) throw new Error("Hub not found.");
  if (existing.origin !== "seeded") throw new Error("Pick a seeded city hub as the destination.");

  const nextLat = input.centerLat ?? Number(existing.center_lat);
  const nextLng = input.centerLng ?? Number(existing.center_lng);
  if (!isValidSeededCoordinate(nextLat, nextLng)) {
    throw new Error("invalid_coordinates");
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    center_lat: nextLat,
    center_lng: nextLng,
  };
  if (input.radiusMiles != null) {
    patch.radius_miles = clampSeededRadius(input.radiusMiles);
    patch.place_kind = placeKindForRadius(Number(patch.radius_miles));
  } else if (input.placeKind) {
    patch.place_kind = input.placeKind;
  }
  if (input.locationHint !== undefined) patch.location_hint = input.locationHint?.trim() || null;

  const { data, error } = await supabaseAdmin
    .from("area_discussions")
    .update(patch)
    .eq("id", id)
    .eq("origin", "seeded")
    .select(SEEDED_SELECT)
    .single();
  if (error) throwDbError(error, "Failed to update seeded hub");
  const saved = data as HubRow;
  if (input.radiusMiles != null && clampSeededRadius(Number(saved.radius_miles)) !== clampSeededRadius(input.radiusMiles)) {
    throw new Error("invalid_seeded_radius");
  }
  return toSeededItem(saved, await groupCountForHub(id));
}

export async function deleteSeededHub(id: string): Promise<{
  id: string;
  title: string;
  group_count: number;
  comment_count: number;
  member_count: number;
}> {
  const { data: existing, error: loadError } = await supabaseAdmin
    .from("area_discussions")
    .select(SEEDED_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (loadError) throwDbError(loadError, "Failed to load seeded hub");
  if (!existing) throw new Error("Hub not found.");
  if (existing.origin !== "seeded") throw new Error("Only seeded city hubs can be deleted here.");

  const groupCount = await groupCountForHub(id);
  const { data: deletedRows, error: deleteError } = await supabaseAdmin
    .from("area_discussions")
    .delete()
    .eq("id", id)
    .eq("origin", "seeded")
    .select("id");
  if (deleteError) throwDbError(deleteError, "Failed to delete seeded hub");
  if (!deletedRows?.length) throw new Error("Hub not found.");

  return {
    id,
    title: existing.title,
    group_count: groupCount,
    comment_count: Number(existing.comment_count ?? 0),
    member_count: Number(existing.unique_participant_count ?? 0),
  };
}

async function uniqueGroupTitle(discussionId: string, wanted: string): Promise<string> {
  const base = (wanted.trim() || "Group").slice(0, 40);
  const { data } = await supabaseAdmin
    .from("discussion_groups")
    .select("title, archived_at")
    .eq("discussion_id", discussionId);
  const taken = new Set(
    (data ?? [])
      .filter((row: { title?: string | null; archived_at?: string | null }) => !row.archived_at)
      .map((row: { title?: string | null }) => String(row.title).trim().toLowerCase()),
  );
  for (let i = 1; i <= 50; i += 1) {
    const suffix = i === 1 ? "" : ` ${i}`;
    const title = `${base.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
    if (!taken.has(title.toLowerCase())) return title;
  }
  throw new Error("A group with that name already exists in this hub.");
}

async function pageColumn(
  table: string,
  column: string,
  discussionId: string,
  orderColumn = column,
): Promise<string[]> {
  const ids: string[] = [];
  const page = 1000;
  for (let from = 0; from < 20000; from += page) {
    const select = orderColumn === column ? column : `${column},${orderColumn}`;
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(select)
      .eq("discussion_id", discussionId)
      .order(orderColumn, { ascending: true })
      .range(from, from + page - 1);
    if (error) throwDbError(error, "Failed to load hub members");
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    for (const row of batch) {
      const value = String(row[column] ?? "").trim();
      if (value) ids.push(value);
    }
    if (batch.length < page) break;
  }
  return ids;
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

async function copyHubImageToGroup(sourceId: string, groupId: string): Promise<boolean> {
  for (const file of ["avatar.jpg", "banner.jpg"]) {
    const { data, error } = await supabaseAdmin.storage.from("hub-images").download(`${sourceId}/${file}`);
    if (error || !data) continue;
    const { error: uploadError } = await supabaseAdmin.storage.from("group-images").upload(
      `${groupId}/avatar.jpg`,
      data,
      { upsert: true, contentType: "image/jpeg", cacheControl: "3600" },
    );
    if (uploadError) continue;
    const { data: pub } = supabaseAdmin.storage.from("group-images").getPublicUrl(`${groupId}/avatar.jpg`);
    const publicUrl = String(pub?.publicUrl ?? "").split("?")[0];
    if (!publicUrl) continue;
    const { error: updateError } = await supabaseAdmin
      .from("discussion_groups")
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", groupId);
    if (!updateError) return true;
  }
  return false;
}

async function moveHubPostsToGroup(sourceId: string, targetId: string, groupId: string): Promise<number> {
  const { error } = await supabaseAdmin
    .from("area_discussion_comments")
    .update({ discussion_id: targetId, group_id: groupId })
    .eq("discussion_id", sourceId);
  if (error) throwDbError(error, "Failed to move posts");

  const { count, error: countError } = await supabaseAdmin
    .from("area_discussion_comments")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);
  if (countError) throwDbError(countError, "Failed to move posts");
  return count ?? 0;
}

export async function convertUserHubToGroup(
  sourceId: string,
  targetId: string,
): Promise<ConvertedHubResult> {
  if (sourceId === targetId) throw new Error("Cannot convert a hub into itself.");

  const sourceSelect = `${USER_SELECT},banner_url,is_live,migrated_at`;
  let sourceQuery = await supabaseAdmin.from("area_discussions").select(sourceSelect).eq("id", sourceId).maybeSingle();
  if (sourceQuery.error) {
    sourceQuery = await supabaseAdmin
      .from("area_discussions")
      .select(`${USER_SELECT},banner_url,is_live`)
      .eq("id", sourceId)
      .maybeSingle();
  }
  const { data: target, error: targetError } = await supabaseAdmin
    .from("area_discussions")
    .select(SEEDED_SELECT)
    .eq("id", targetId)
    .maybeSingle();
  if (sourceQuery.error) throwDbError(sourceQuery.error, "Failed to load hub");
  if (targetError) throwDbError(targetError, "Failed to load seeded hub");
  const source = sourceQuery.data as HubRow | null;
  if (!source) throw new Error("Hub not found.");
  if (!target) throw new Error("Hub not found.");
  if (target.origin !== "seeded") throw new Error("Pick a seeded city hub as the destination.");
  if (source.origin === "seeded") throw new Error("Only user-created hubs can be turned into groups.");
  if (source.migrated_at) throw new Error("That hub was already converted.");

  const [participantIds, authorIds] = await Promise.all([
    pageColumn("area_discussion_participants", "user_id", sourceId),
    pageColumn("area_discussion_comments", "author_id", sourceId, "id"),
  ]);
  const memberIds = await livingProfileIds([
    String(source.creator_id ?? ""),
    ...participantIds,
    ...authorIds,
  ]);
  const ownerId = memberIds.find((id) => id === source.creator_id) ?? memberIds[0] ?? null;
  if (!ownerId) throw new Error("That hub has no steward to become the group owner.");

  if (source.is_live) {
    await supabaseAdmin.rpc("admin_force_end_discussion_live", { p_discussion_id: sourceId });
  }

  const groupTitle = await uniqueGroupTitle(targetId, source.title);
  const groupDescription = (source.description ?? "").trim().slice(0, 240) || null;

  let groupInsert = await supabaseAdmin
    .from("discussion_groups")
    .insert({
      discussion_id: targetId,
      creator_id: ownerId,
      title: groupTitle,
      description: groupDescription,
      category: "neighbors",
      categories: ["neighbors"],
    })
    .select("id,title")
    .single();

  if (groupInsert.error) {
    groupInsert = await supabaseAdmin
      .from("discussion_groups")
      .insert({
        discussion_id: targetId,
        creator_id: ownerId,
        title: groupTitle,
        description: groupDescription,
      })
      .select("id,title")
      .single();
  }
  if (groupInsert.error || !groupInsert.data) {
    throwDbError(groupInsert.error, "Failed to create group");
  }

  const groupId = String(groupInsert.data.id);
  await copyHubImageToGroup(sourceId, groupId);

  const memberRows = [
    { group_id: groupId, user_id: ownerId, role: "owner" },
    ...memberIds
      .filter((id) => id !== ownerId)
      .map((id) => ({ group_id: groupId, user_id: id, role: "member" })),
  ];
  await upsertChunks("discussion_group_members", memberRows, "group_id,user_id", "Failed to copy group members");
  await upsertChunks(
    "area_discussion_participants",
    memberIds.map((userId) => ({ discussion_id: targetId, user_id: userId })),
    "discussion_id,user_id",
    "Failed to join members to the city hub",
  );

  const postsMoved = await moveHubPostsToGroup(sourceId, targetId, groupId);

  const [{ count: commentCount }, { count: participantCount }] = await Promise.all([
    supabaseAdmin
      .from("area_discussion_comments")
      .select("id", { count: "exact", head: true })
      .eq("discussion_id", targetId),
    supabaseAdmin
      .from("area_discussion_participants")
      .select("user_id", { count: "exact", head: true })
      .eq("discussion_id", targetId),
  ]);

  await supabaseAdmin
    .from("area_discussions")
    .update({
      comment_count: commentCount ?? 0,
      unique_participant_count: participantCount ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetId);

  const expirePatch: Record<string, unknown> = {
    lifecycle_status: "expired",
    is_live: false,
    live_expires_at: null,
    grace_expires_at: null,
    comment_count: 0,
    updated_at: new Date().toISOString(),
  };
  let expire = await supabaseAdmin.from("area_discussions").update({
    ...expirePatch,
    migrated_at: new Date().toISOString(),
    migrated_to_discussion_id: targetId,
    migrated_to_group_id: groupId,
    creator_id: null,
  }).eq("id", sourceId);
  if (expire.error) {
    expire = await supabaseAdmin.from("area_discussions").update(expirePatch).eq("id", sourceId);
  }
  if (expire.error) throwDbError(expire.error, "Failed to retire the old hub");

  return {
    source_id: sourceId,
    source_title: source.title,
    target_id: targetId,
    group_id: groupId,
    group_title: String(groupInsert.data.title),
    posts_moved: postsMoved,
    group_members: memberRows.length,
  };
}

export async function convertUserHubsToGroups(targetId: string, sourceIds: string[]) {
  const converted: ConvertedHubResult[] = [];
  const errors: Array<{ source_id: string; error: string }> = [];
  for (const sourceId of sourceIds) {
    try {
      converted.push(await convertUserHubToGroup(sourceId, targetId));
    } catch (error: unknown) {
      errors.push({
        source_id: sourceId,
        error: error instanceof Error ? error.message : "Failed to convert hub",
      });
    }
  }
  return {
    converted,
    errors,
    converted_count: converted.length,
    error_count: errors.length,
  };
}

type LaunchRow = {
  seeded_public: boolean;
  lifecycle_paused: boolean;
  released_at: string | null;
  leftover_converted: number | null;
  leftover_failed: number | null;
};

type LeftoverHub = {
  id: string;
  title: string;
  center_lat: number;
  center_lng: number;
  creator_id: string | null;
  origin: string | null;
  migrated_at: string | null;
  migrated_to_group_id: string | null;
  lifecycle_status: string | null;
  comment_count: number | null;
  unique_participant_count: number | null;
};

function emptyLaunchCounts() {
  return {
    leftover_converted: 0,
    leftover_failed: 0,
    seeded_count: 0,
    leftover_user_hubs: 0,
    hubs_with_stewards: 0,
    already_converted: 0,
  };
}

function toLaunchState(row: LaunchRow | null, counts: ReturnType<typeof emptyLaunchCounts>): CityHubsLaunchState {
  return {
    seeded_public: Boolean(row?.seeded_public),
    lifecycle_paused: Boolean(row?.lifecycle_paused),
    released_at: row?.released_at ?? null,
    leftover_converted: Number(row?.leftover_converted ?? counts.leftover_converted),
    leftover_failed: Number(row?.leftover_failed ?? counts.leftover_failed),
    seeded_count: counts.seeded_count,
    leftover_user_hubs: counts.leftover_user_hubs,
    hubs_with_stewards: counts.hubs_with_stewards,
    already_converted: counts.already_converted,
  };
}

async function loadLaunchRow(): Promise<LaunchRow | null> {
  const { data, error } = await supabaseAdmin
    .from("city_hubs_launch")
    .select("seeded_public,lifecycle_paused,released_at,leftover_converted,leftover_failed")
    .eq("id", 1)
    .maybeSingle();
  if (error) throwDbError(error, "Failed to load launch state");
  return (data as LaunchRow | null) ?? null;
}

async function countLaunchPreview(): Promise<ReturnType<typeof emptyLaunchCounts>> {
  const counts = emptyLaunchCounts();
  const [{ count: seededCount }, { data: leftover }, { count: convertedCount }] = await Promise.all([
    supabaseAdmin.from("area_discussions").select("id", { count: "exact", head: true }).eq("origin", "seeded"),
    supabaseAdmin
      .from("area_discussions")
      .select("id,creator_id,lifecycle_status,comment_count,migrated_at")
      .or("origin.eq.user,origin.is.null")
      .is("migrated_at", null)
      .limit(2000),
    supabaseAdmin
      .from("area_discussions")
      .select("id", { count: "exact", head: true })
      .or("origin.eq.user,origin.is.null")
      .not("migrated_at", "is", null),
  ]);
  counts.seeded_count = seededCount ?? 0;
  counts.already_converted = convertedCount ?? 0;
  const rows = (leftover ?? []) as Array<{
    creator_id: string | null;
    lifecycle_status: string | null;
    comment_count: number | null;
  }>;
  const live = rows.filter((row) => !(row.lifecycle_status === "expired" && Number(row.comment_count ?? 0) === 0));
  counts.leftover_user_hubs = live.length;
  counts.hubs_with_stewards = live.filter((row) => Boolean(row.creator_id)).length;
  return counts;
}

function shouldAutoConvertLeftover(hub: LeftoverHub): boolean {
  if (hub.migrated_at) return false;
  if (hub.origin === "seeded") return false;
  if (hub.lifecycle_status === "expired" && Number(hub.comment_count ?? 0) === 0 && !hub.creator_id) {
    return false;
  }
  return true;
}

function nearestSeededId(
  hub: LeftoverHub,
  seeded: Array<{ id: string; center_lat: number; center_lng: number }>,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const city of seeded) {
    const distance = haversineMiles(
      Number(hub.center_lat),
      Number(hub.center_lng),
      Number(city.center_lat),
      Number(city.center_lng),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = city.id;
    }
  }
  return bestId;
}

export async function getCityHubsLaunchPreview(): Promise<CityHubsLaunchState> {
  const [row, counts] = await Promise.all([loadLaunchRow(), countLaunchPreview()]);
  return toLaunchState(row, counts);
}

export async function setSeededHubsVisibility(
  ids: string[],
  visible: boolean,
): Promise<{ hubs: SeededHubListItem[]; launch: CityHubsLaunchState }> {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("seeded_ids_required");
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("area_discussions")
    .update({ seeded_visible: visible, updated_at: now })
    .in("id", uniqueIds)
    .eq("origin", "seeded")
    .select("id");
  if (error) throwDbError(error, "Failed to update store visibility");
  if (!updated?.length) {
    throw new Error("no_seeded_hubs");
  }

  const existing = await loadLaunchRow();
  if (!existing) {
    const { error: insertError } = await supabaseAdmin.from("city_hubs_launch").insert({
      id: 1,
      seeded_public: false,
      lifecycle_paused: false,
      updated_at: now,
    });
    if (insertError && !String(insertError.message ?? "").toLowerCase().includes("duplicate")) {
      throwDbError(insertError, "Failed to create launch row");
    }
  } else if (existing.seeded_public) {
    const { error: hideGlobal } = await supabaseAdmin
      .from("city_hubs_launch")
      .update({ seeded_public: false, updated_at: now })
      .eq("id", 1);
    if (hideGlobal) throwDbError(hideGlobal, "Failed to clear global store visibility");
  }

  const [hubs, launch] = await Promise.all([listSeededHubs(null), getCityHubsLaunchPreview()]);
  return { hubs, launch };
}

export async function releaseCityHubs(actorId: string): Promise<CityHubsReleaseResult> {
  const existing = await loadLaunchRow();
  if (existing?.released_at) {
    throw new Error("already_released");
  }

  const seeded = await listSeededHubs(null);
  if (seeded.length === 0) {
    throw new Error("no_seeded_hubs");
  }

  const leftoverQuery = await supabaseAdmin
    .from("area_discussions")
    .select("id,title,center_lat,center_lng,creator_id,origin,migrated_at,migrated_to_group_id,lifecycle_status,comment_count,unique_participant_count")
    .or("origin.eq.user,origin.is.null")
    .is("migrated_at", null)
    .limit(2000);
  if (leftoverQuery.error) throwDbError(leftoverQuery.error, "Failed to load leftover hubs");

  const leftovers = ((leftoverQuery.data ?? []) as LeftoverHub[]).filter(shouldAutoConvertLeftover);
  const converted: ConvertedHubResult[] = [];
  const errors: Array<{ source_id: string; error: string }> = [];

  for (const hub of leftovers) {
    const targetId = nearestSeededId(hub, seeded);
    if (!targetId) {
      errors.push({ source_id: hub.id, error: "No city hub is close enough to nest this pin." });
      continue;
    }
    try {
      converted.push(await convertUserHubToGroup(hub.id, targetId));
    } catch (error: unknown) {
      errors.push({
        source_id: hub.id,
        error: error instanceof Error ? error.message : "Failed to convert hub",
      });
    }
  }

  const migratedOwners = await supabaseAdmin
    .from("area_discussions")
    .select("creator_id,migrated_to_group_id")
    .not("migrated_to_group_id", "is", null)
    .not("creator_id", "is", null)
    .limit(2000);
  if (!migratedOwners.error) {
    const ownerRows = (migratedOwners.data ?? []) as Array<{
      creator_id: string | null;
      migrated_to_group_id: string | null;
    }>;
    const memberRows = ownerRows
      .filter((row) => row.creator_id && row.migrated_to_group_id)
      .map((row) => ({
        group_id: String(row.migrated_to_group_id),
        user_id: String(row.creator_id),
        role: "owner",
      }));
    if (memberRows.length) {
      await upsertChunks("discussion_group_members", memberRows, "group_id,user_id", "Failed to attach group owners");
    }
  }

  const { error: stripError } = await supabaseAdmin
    .from("area_discussions")
    .update({ creator_id: null, updated_at: new Date().toISOString() })
    .not("creator_id", "is", null);
  if (stripError) throwDbError(stripError, "Failed to remove hub ownership from profiles");

  await supabaseAdmin.from("area_discussions").update({
    check_in_due_at: null,
    grace_expires_at: null,
    claim_window_opens_at: null,
    claim_window_closes_at: null,
    bootstrap_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq("origin", "seeded");

  await supabaseAdmin.from("discussion_stewardship_claims").delete().not("id", "is", null);
  await supabaseAdmin
    .from("hub_ownership_downsizes")
    .update({ resolved_at: new Date().toISOString() })
    .is("resolved_at", null);

  const now = new Date().toISOString();
  const result = {
    leftover_converted: converted.length,
    leftover_failed: errors.length,
    converted,
    errors,
  };
  const { data: saved, error: saveError } = await supabaseAdmin
    .from("city_hubs_launch")
    .update({
      seeded_public: true,
      lifecycle_paused: true,
      released_at: now,
      released_by: actorId,
      leftover_converted: converted.length,
      leftover_failed: errors.length,
      result,
      updated_at: now,
    })
    .eq("id", 1)
    .is("released_at", null)
    .select("seeded_public,lifecycle_paused,released_at,leftover_converted,leftover_failed")
    .maybeSingle();
  if (saveError) throwDbError(saveError, "Failed to publish city hubs");
  if (!saved) throw new Error("already_released");

  const counts = await countLaunchPreview();
  counts.leftover_converted = converted.length;
  counts.leftover_failed = errors.length;
  return {
    ...toLaunchState(saved as LaunchRow, counts),
    converted,
    errors,
  };
}
