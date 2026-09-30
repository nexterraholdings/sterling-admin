import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadHubLocales } from "@/lib/conversations/hub-locale";
import { xaiConfigured } from "@/lib/knowledge/xai";
import { ticketmasterConfigured } from "@/lib/knowledge/feeds/events";
import { DEFAULT_FEEDS, KNOWLEDGE_FEEDS } from "@/lib/knowledge/types";
import type {
  KnowledgeApproval,
  KnowledgeDashboard,
  KnowledgeFact,
  KnowledgeFeed,
  KnowledgeHubOption,
  KnowledgeSource,
  KnowledgeItem,
  KnowledgePull,
  KnowledgeStatus,
  KnowledgeWatch,
  KnowledgeWatchInput,
} from "@/lib/knowledge/types";

export const KNOWLEDGE_SCHEMA_HINT = "Run supabase/sql/knowledge_hub.sql in the Supabase SQL editor, then try again.";

type WatchRow = {
  id: string;
  hub_id: string;
  label: string | null;
  feeds: string[] | null;
  search_terms: string | null;
  x_handles: string[] | null;
  teams: string[] | null;
  every_minutes: number | null;
  approval: string | null;
  enabled: boolean | null;
  last_pulled_at: string | null;
  last_error: string | null;
};

type ItemRow = {
  id: string;
  watch_id: string | null;
  hub_id: string;
  source: string;
  claim: string;
  source_url: string;
  author: string | null;
  image_url: string | null;
  posted_at: string | null;
  fetched_at: string;
  expires_at: string;
  status: string;
  verdict: string | null;
  reason: string | null;
  decided_by: string | null;
  used_count: number | null;
};

const WATCH_SELECT = "id, hub_id, label, feeds, search_terms, x_handles, teams, every_minutes, approval, enabled, last_pulled_at, last_error";
const SOURCES: KnowledgeSource[] = ["x", "web", "news", "weather", "sports", "events"];
const ITEM_SELECT =
  "id, watch_id, hub_id, source, claim, source_url, author, image_url, posted_at, fetched_at, expires_at, status, verdict, reason, decided_by, used_count";

function fail(error: { message?: string; code?: string } | null): never {
  if (error && isMissingSchemaError(error)) throw new Error(KNOWLEDGE_SCHEMA_HINT);
  throw new Error(error?.message ?? "Knowledge hub request failed");
}

export function parseHandles(value: string | string[]): string[] {
  const parts = Array.isArray(value) ? value : value.split(/[\s,]+/);
  return [...new Set(parts.map((part) => part.trim().replace(/^@+/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15)).filter(Boolean))].slice(0, 20);
}

export function parseTeams(value: string | string[]): string[] {
  const parts = Array.isArray(value) ? value : value.split(/[,\n]+/);
  return [...new Set(parts.map((part) => part.replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean))].slice(0, 4);
}

export function feedsOf(value: readonly string[] | null | undefined): KnowledgeFeed[] {
  if (!value) return [...DEFAULT_FEEDS];
  return KNOWLEDGE_FEEDS.filter((feed) => value.includes(feed));
}

function approvalOf(value: string | null): KnowledgeApproval {
  return value === "auto" ? "auto" : "review";
}

function toWatch(row: WatchRow, hubs: Map<string, KnowledgeHubOption>): KnowledgeWatch {
  const hub = hubs.get(String(row.hub_id));
  return {
    id: String(row.id),
    hubId: String(row.hub_id),
    hubTitle: hub?.title ?? "Hub",
    place: hub?.place ?? "",
    label: String(row.label ?? ""),
    feeds: feedsOf(row.feeds),
    searchTerms: String(row.search_terms ?? ""),
    xHandles: parseHandles(row.x_handles ?? []),
    teams: parseTeams(row.teams ?? []),
    everyMinutes: Number(row.every_minutes ?? 360),
    approval: approvalOf(row.approval),
    enabled: Boolean(row.enabled),
    lastPulledAt: row.last_pulled_at,
    lastError: row.last_error,
  };
}

function toItem(row: ItemRow, hubs: Map<string, KnowledgeHubOption>): KnowledgeItem {
  return {
    id: String(row.id),
    watchId: row.watch_id ? String(row.watch_id) : null,
    hubId: String(row.hub_id),
    hubTitle: hubs.get(String(row.hub_id))?.title ?? "Hub",
    source: SOURCES.find((source) => source === row.source) ?? "web",
    claim: row.claim,
    sourceUrl: row.source_url,
    author: String(row.author ?? ""),
    imageUrl: row.image_url,
    postedAt: row.posted_at,
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
    status: row.status === "approved" || row.status === "rejected" ? row.status : "new",
    verdict: row.verdict === "approve" || row.verdict === "reject" ? row.verdict : null,
    reason: String(row.reason ?? ""),
    decidedBy: String(row.decided_by ?? ""),
    usedCount: Number(row.used_count ?? 0),
  };
}

/** Hubs that have prop conversation groups, plus any hub already watched. */
async function loadHubOptions(extraHubIds: string[]): Promise<Map<string, KnowledgeHubOption>> {
  const { data: convoRows, error: convoError } = await supabaseAdmin.from("prop_conversation_groups").select("group_id").limit(2000);
  if (convoError && !isMissingSchemaError(convoError)) throw new Error(convoError.message);
  const groupIds = ((convoRows ?? []) as Array<{ group_id: string }>).map((row) => String(row.group_id));
  const hubIds = new Set(extraHubIds);
  for (let index = 0; index < groupIds.length; index += 200) {
    const { data, error } = await supabaseAdmin.from("discussion_groups").select("discussion_id").in("id", groupIds.slice(index, index + 200));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ discussion_id: string | null }>) if (row.discussion_id) hubIds.add(String(row.discussion_id));
  }
  const ids = [...hubIds];
  if (ids.length === 0) return new Map();
  const [{ data: hubs, error }, locales] = await Promise.all([
    supabaseAdmin.from("area_discussions").select("id, title").in("id", ids),
    loadHubLocales(ids),
  ]);
  if (error) throw new Error(error.message);
  const map = new Map<string, KnowledgeHubOption>();
  for (const hub of (hubs ?? []) as Array<{ id: string; title: string | null }>) {
    const id = String(hub.id);
    map.set(id, { id, title: String(hub.title ?? "Hub"), place: locales.get(id)?.place ?? "" });
  }
  return map;
}

export async function loadKnowledgeDashboard(): Promise<KnowledgeDashboard> {
  const [watchResult, itemResult, pullResult] = await Promise.all([
    supabaseAdmin.from("knowledge_watches").select(WATCH_SELECT).order("created_at", { ascending: true }).limit(500),
    supabaseAdmin.from("knowledge_items").select(ITEM_SELECT).order("fetched_at", { ascending: false }).limit(300),
    supabaseAdmin
      .from("knowledge_pulls")
      .select("id, hub_id, ok, items_found, items_kept, x_posts_fetched, error, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  const missing = [watchResult.error, itemResult.error, pullResult.error].find((error) => error && isMissingSchemaError(error));
  if (missing) {
    const hubs = await loadHubOptions([]);
    return {
      schemaReady: false,
      xaiConfigured: xaiConfigured(),
      ticketmasterConfigured: ticketmasterConfigured(),
      loadedAt: Date.now(),
      hubs: [...hubs.values()], watches: [], items: [], pulls: [] };
  }
  for (const result of [watchResult, itemResult, pullResult]) if (result.error) throw new Error(result.error.message);

  const watchRows = (watchResult.data ?? []) as WatchRow[];
  const itemRows = (itemResult.data ?? []) as ItemRow[];
  const pullRows = (pullResult.data ?? []) as Array<{
    id: string;
    hub_id: string | null;
    ok: boolean;
    items_found: number;
    items_kept: number;
    x_posts_fetched: number;
    error: string | null;
    created_at: string;
  }>;
  const hubs = await loadHubOptions([
    ...watchRows.map((row) => String(row.hub_id)),
    ...itemRows.map((row) => String(row.hub_id)),
  ]);
  const pulls: KnowledgePull[] = pullRows.map((row) => ({
    id: String(row.id),
    hubTitle: row.hub_id ? hubs.get(String(row.hub_id))?.title ?? "Hub" : "Hub",
    ok: Boolean(row.ok),
    itemsFound: Number(row.items_found ?? 0),
    itemsKept: Number(row.items_kept ?? 0),
    xPostsFetched: Number(row.x_posts_fetched ?? 0),
    error: row.error,
    createdAt: row.created_at,
  }));
  return {
    schemaReady: true,
    xaiConfigured: xaiConfigured(),
    ticketmasterConfigured: ticketmasterConfigured(),
    loadedAt: Date.now(),
    hubs: [...hubs.values()].sort((a, b) => a.title.localeCompare(b.title)),
    watches: watchRows.map((row) => toWatch(row, hubs)),
    items: itemRows.map((row) => toItem(row, hubs)),
    pulls,
  };
}

function watchPatch(input: KnowledgeWatchInput) {
  const label = input.label.trim().slice(0, 80);
  const searchTerms = input.searchTerms.trim().slice(0, 400);
  const everyMinutes = Math.min(1440, Math.max(30, Math.trunc(Number(input.everyMinutes) || 360)));
  return {
    hub_id: input.hubId,
    label,
    feeds: feedsOf(input.feeds),
    search_terms: searchTerms,
    x_handles: parseHandles(input.xHandles),
    teams: parseTeams(input.teams),
    every_minutes: everyMinutes,
    approval: approvalOf(input.approval),
    enabled: Boolean(input.enabled),
    updated_at: new Date().toISOString(),
  };
}

function checkPatch(patch: ReturnType<typeof watchPatch>) {
  if (patch.feeds.length === 0) throw new Error("Turn on at least one source.");
  if (patch.feeds.includes("sports") && patch.teams.length === 0) throw new Error("Add at least one team for sports, or turn sports off.");
}

export async function createWatch(input: KnowledgeWatchInput): Promise<string> {
  if (!input.hubId) throw new Error("Pick a hub to watch.");
  const patch = watchPatch(input);
  checkPatch(patch);
  const { data, error } = await supabaseAdmin.from("knowledge_watches").insert(patch).select("id").single();
  if (error) fail(error);
  return String(data.id);
}

export async function updateWatch(id: string, input: KnowledgeWatchInput): Promise<void> {
  const patch = watchPatch(input);
  checkPatch(patch);
  const { error } = await supabaseAdmin.from("knowledge_watches").update(patch).eq("id", id);
  if (error) fail(error);
}

export async function deleteWatch(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("knowledge_watches").delete().eq("id", id);
  if (error) fail(error);
}

export async function decideItem(id: string, status: KnowledgeStatus, decidedBy: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("knowledge_items")
    .update({ status, decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(error);
}

export async function loadWatch(id: string): Promise<WatchRow | null> {
  const { data, error } = await supabaseAdmin.from("knowledge_watches").select(WATCH_SELECT).eq("id", id).maybeSingle();
  if (error) fail(error);
  return (data as WatchRow | null) ?? null;
}

/** Enabled watches whose interval has passed, oldest pull first. */
export async function loadDueWatches(limit: number): Promise<WatchRow[]> {
  const { data, error } = await supabaseAdmin
    .from("knowledge_watches")
    .select(WATCH_SELECT)
    .eq("enabled", true)
    .order("last_pulled_at", { ascending: true, nullsFirst: true })
    .limit(500);
  if (error && isMissingSchemaError(error)) return [];
  if (error) throw new Error(error.message);
  const now = Date.now();
  return ((data ?? []) as WatchRow[])
    .filter((row) => !row.last_pulled_at || now - new Date(row.last_pulled_at).getTime() >= Number(row.every_minutes ?? 360) * 60_000)
    .slice(0, limit);
}

/** Hubs with at least one enabled watch. Opening posts there need an approved fact. */
export async function loadWatchedHubIds(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from("knowledge_watches").select("hub_id").eq("enabled", true).limit(1000);
  if (error && isMissingSchemaError(error)) return new Set();
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ hub_id: string }>).map((row) => String(row.hub_id)));
}

const DAY_MS = 24 * 60 * 60_000;
/** A group opens with the weather at most once in this window. */
const WEATHER_GAP_MS = 20 * 60 * 60_000;

/**
 * A fresh approved fact for this hub that this group has not posted about yet. Sources rotate:
 * the group's least-used source over the last day goes first, and weather at most once a day.
 */
export async function pickFactForGroup(hubId: string, groupId: string): Promise<KnowledgeFact | null> {
  return (await listFactsForGroup(hubId, groupId, 1))[0] ?? null;
}

/** Same rotation as pickFactForGroup, best first. */
export async function listFactsForGroup(hubId: string, groupId: string, limit: number): Promise<KnowledgeFact[]> {
  const now = Date.now();
  const { data, error } = await supabaseAdmin
    .from("knowledge_items")
    .select("id, claim, author, source, source_url, used_count, fetched_at")
    .eq("hub_id", hubId)
    .eq("status", "approved")
    .gt("expires_at", new Date(now).toISOString())
    .order("used_count", { ascending: true })
    .order("fetched_at", { ascending: false })
    .limit(60);
  if (error && isMissingSchemaError(error)) return [];
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; claim: string; author: string | null; source: string; source_url: string }>;
  if (rows.length === 0) return [];

  const [{ data: usedRows, error: usedError }, { data: recentRows, error: recentError }] = await Promise.all([
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("knowledge_item_id")
      .eq("group_id", groupId)
      .in("knowledge_item_id", rows.map((row) => row.id)),
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("run_at, knowledge_items(source)")
      .eq("group_id", groupId)
      .not("knowledge_item_id", "is", null)
      .gte("run_at", new Date(now - DAY_MS).toISOString())
      .lte("run_at", new Date(now).toISOString())
      .limit(100),
  ]);
  for (const result of [usedError, recentError]) if (result && !isMissingSchemaError(result)) throw new Error(result.message);
  const used = new Set(((usedRows ?? []) as Array<{ knowledge_item_id: string | null }>).map((row) => String(row.knowledge_item_id ?? "")));

  const recentBySource = new Map<string, number>();
  let weatherLocked = false;
  type RecentRow = { run_at: string; knowledge_items: { source?: string } | Array<{ source?: string }> | null };
  for (const row of (recentRows ?? []) as unknown as RecentRow[]) {
    const joined = Array.isArray(row.knowledge_items) ? row.knowledge_items[0] : row.knowledge_items;
    const source = joined?.source ?? "";
    if (!source) continue;
    recentBySource.set(source, (recentBySource.get(source) ?? 0) + 1);
    if (source === "weather" && now - new Date(row.run_at).getTime() < WEATHER_GAP_MS) weatherLocked = true;
  }

  const candidates = rows
    .map((row, rank) => ({ row, rank }))
    .filter(({ row }) => !used.has(String(row.id)) && !(weatherLocked && row.source === "weather"));
  candidates.sort((a, b) => (recentBySource.get(a.row.source) ?? 0) - (recentBySource.get(b.row.source) ?? 0) || a.rank - b.rank);
  return candidates.slice(0, limit).map(({ row }) => ({
    id: String(row.id),
    claim: row.claim,
    author: String(row.author ?? ""),
    sourceUrl: row.source_url,
    source: row.source,
  }));
}

export async function loadFact(id: string): Promise<KnowledgeFact | null> {
  const { data, error } = await supabaseAdmin.from("knowledge_items").select("id, claim, author, source_url").eq("id", id).maybeSingle();
  if (error && isMissingSchemaError(error)) return null;
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: String(data.id), claim: String(data.claim), author: String(data.author ?? ""), sourceUrl: String(data.source_url) };
}

/** The fact the opening post of this thread was written from, if any. */
export async function loadFactForThread(parentCommentId: string): Promise<KnowledgeFact | null> {
  const { data, error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("knowledge_item_id")
    .eq("comment_id", parentCommentId)
    .eq("kind", "start_post")
    .not("knowledge_item_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error && isMissingSchemaError(error)) return null;
  if (error) throw new Error(error.message);
  return data?.knowledge_item_id ? loadFact(String(data.knowledge_item_id)) : null;
}

export async function markFactUsed(id: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from("knowledge_items").select("used_count").eq("id", id).maybeSingle();
  if (error || !data) return;
  await supabaseAdmin
    .from("knowledge_items")
    .update({ used_count: Number(data.used_count ?? 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", id);
}
