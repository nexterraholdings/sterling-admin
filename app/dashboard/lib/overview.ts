import { supabaseAdmin } from "@/lib/supabase/server";
import { listSeededHubs } from "@/lib/seeded-hubs/db";
import { fetchDashboardMetrics } from "./metrics";

export type OverviewHub = {
  id: string;
  title: string;
  place: string | null;
  comments: number;
  groups: number;
  onStore: boolean;
};

export type OverviewGroup = {
  id: string;
  title: string;
  hubTitle: string | null;
  createdAt: string;
};

export type OverviewPoint = { label: string; value: number };

export type OverviewSnapshot = {
  plantedHubs: number;
  hubsOnStore: number;
  hubsHidden: number;
  busiestHubs: OverviewHub[];
  groupCount: number;
  recentGroups: OverviewGroup[];
  users: number;
  newUsersThisWeek: number;
  posts: number;
  postsThisWeek: OverviewPoint[];
};

export const emptyOverviewSnapshot: OverviewSnapshot = {
  plantedHubs: 0,
  hubsOnStore: 0,
  hubsHidden: 0,
  busiestHubs: [],
  groupCount: 0,
  recentGroups: [],
  users: 0,
  newUsersThisWeek: 0,
  posts: 0,
  postsThisWeek: [],
};

function weekBuckets(rows: { created_at: string }[]): OverviewPoint[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const points = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      value: 0,
      day: day.toDateString(),
    };
  });
  const byDay = new Map(points.map((point) => [point.day, point]));
  for (const row of rows) {
    const point = byDay.get(new Date(row.created_at).toDateString());
    if (point) point.value += 1;
  }
  return points.map(({ label, value }) => ({ label, value }));
}

async function loadGroups(): Promise<{ total: number; recent: OverviewGroup[] }> {
  const archived = await supabaseAdmin
    .from("discussion_groups")
    .select("id,title,discussion_id,created_at", { count: "exact" })
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(6);

  const result = archived.error
    ? await supabaseAdmin
        .from("discussion_groups")
        .select("id,title,discussion_id,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(6)
    : archived;

  if (result.error) return { total: 0, recent: [] };

  const rows = (result.data ?? []) as Array<{
    id: string;
    title: string | null;
    discussion_id: string | null;
    created_at: string;
  }>;
  const hubIds = [...new Set(rows.map((row) => row.discussion_id).filter(Boolean))] as string[];
  const hubTitles = new Map<string, string>();
  if (hubIds.length) {
    const { data } = await supabaseAdmin.from("area_discussions").select("id,title").in("id", hubIds);
    for (const hub of data ?? []) hubTitles.set(String(hub.id), String(hub.title ?? ""));
  }

  return {
    total: result.count ?? rows.length,
    recent: rows.map((row) => ({
      id: String(row.id),
      title: row.title?.trim() || "Untitled group",
      hubTitle: row.discussion_id ? hubTitles.get(String(row.discussion_id)) || null : null,
      createdAt: row.created_at,
    })),
  };
}

export async function fetchOverviewSnapshot(): Promise<OverviewSnapshot> {
  try {
    return await loadOverviewSnapshot();
  } catch {
    return emptyOverviewSnapshot;
  }
}

async function loadOverviewSnapshot(): Promise<OverviewSnapshot> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);

  const [metrics, hubs, groups, postsWeek] = await Promise.all([
    fetchDashboardMetrics(),
    listSeededHubs(null).catch(() => []),
    loadGroups(),
    supabaseAdmin
      .from("area_discussion_comments")
      .select("created_at")
      .is("parent_id", null)
      .gte("created_at", weekAgo.toISOString())
      .limit(8000),
  ]);

  const busiest = [...hubs].sort((a, b) => b.comment_count - a.comment_count || b.group_count - a.group_count).slice(0, 6);

  return {
    plantedHubs: hubs.length,
    hubsOnStore: hubs.filter((hub) => hub.seeded_visible).length,
    hubsHidden: hubs.filter((hub) => !hub.seeded_visible).length,
    busiestHubs: busiest.map((hub) => ({
      id: hub.id,
      title: hub.title,
      place: hub.location_hint,
      comments: hub.comment_count,
      groups: hub.group_count,
      onStore: hub.seeded_visible,
    })),
    groupCount: groups.total,
    recentGroups: groups.recent,
    users: metrics.activeUsers,
    newUsersThisWeek: metrics.newUsersThisWeek,
    posts: metrics.totalPosts,
    postsThisWeek: weekBuckets(Array.isArray(postsWeek.data) ? postsWeek.data : []),
  };
}
