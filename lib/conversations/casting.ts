import { GEMINI_LITE_MODEL, geminiConfigured, geminiJson } from "@/lib/ai/gemini";
import { groqJson, parseJsonObject } from "@/lib/ai/groq-json";
import { listPropProfiles, loadConversationSettings, loadPropMemberIdsByGroup } from "@/lib/conversations/db";
import { loadGroupLocales, loadHubLocales, type HubLocale } from "@/lib/conversations/hub-locale";
import { hubListsByProp, loadPropHomes, LOCAL_MILES, type PropHome } from "@/lib/conversations/prop-home";
import { loadExcludedByHub, loadPausedGroupIds } from "@/lib/conversations/region-runs";
import { hourIn, withinActiveHours } from "@/lib/conversations/time";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { addGroupMembers } from "@/lib/groups/db";
import { ensureHubWatch } from "@/lib/knowledge/auto-watch";
import { SYSTEM_GROUP_OWNER_EMAIL } from "@/lib/prop-accounts";
import { isMinorVoice, type PropVoice } from "@/lib/prop-voice";
import { loadAccountVoices } from "@/lib/prop-voice-store";
import { milesBetween } from "@/lib/seeded-hubs/worldCities";
import { supabaseAdmin } from "@/lib/supabase/server";

export const CASTING_SCHEMA_HINT = "Run supabase/sql/prop_casting.sql in Supabase first.";

export type CastingSettings = {
  ready: boolean;
  enabled: boolean;
  maxJoinsPerDay: number;
  maxPropShare: number;
  maxGroupsPerProp: number;
};

export type JoinQueueItem = {
  id: string;
  propId: string;
  propName: string;
  groupId: string;
  groupTitle: string;
  runAt: string;
  status: "pending" | "done" | "skipped" | "cancelled";
  fit: number;
  reason: string;
  error: string | null;
};

export type CastingResult = { joined: number; queued: number; activated: number; watches: number; notes: string[] };

/** A group gets its own director run once this many props are in it. */
const ACTIVATE_AT_PROPS = 3;
const CAST_EVERY_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PROPS_PER_BATCH = 20;
const GROUPS_PER_BATCH = 25;

export async function loadCastingSettings(): Promise<CastingSettings> {
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_settings")
    .select("casting_enabled, max_joins_per_day, max_prop_share, max_groups_per_prop")
    .eq("id", 1)
    .maybeSingle();
  if (error && isMissingSchemaError(error)) {
    return { ready: false, enabled: false, maxJoinsPerDay: 3, maxPropShare: 0.4, maxGroupsPerProp: 6 };
  }
  if (error) throw new Error(error.message);
  return {
    ready: true,
    enabled: Boolean(data?.casting_enabled),
    maxJoinsPerDay: Number(data?.max_joins_per_day ?? 3),
    maxPropShare: Number(data?.max_prop_share ?? 0.4),
    maxGroupsPerProp: Number(data?.max_groups_per_prop ?? 6),
  };
}

export async function saveCastingSettings(patch: Partial<Omit<CastingSettings, "ready">>): Promise<void> {
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.enabled != null) next.casting_enabled = patch.enabled;
  if (patch.maxJoinsPerDay != null) next.max_joins_per_day = Math.min(50, Math.max(0, Math.round(patch.maxJoinsPerDay)));
  if (patch.maxPropShare != null) next.max_prop_share = Math.min(1, Math.max(0.05, patch.maxPropShare));
  if (patch.maxGroupsPerProp != null) next.max_groups_per_prop = Math.min(50, Math.max(1, Math.round(patch.maxGroupsPerProp)));
  const { error } = await supabaseAdmin.from("prop_conversation_settings").update(next).eq("id", 1);
  if (error) throw new Error(isMissingSchemaError(error) ? CASTING_SCHEMA_HINT : error.message);
}

export async function listJoinQueue(limit = 40): Promise<JoinQueueItem[]> {
  const { data, error } = await supabaseAdmin
    .from("prop_join_queue")
    .select("id, prop_id, group_id, run_at, status, fit, reason, error, profiles(full_name, username), discussion_groups(title)")
    .order("run_at", { ascending: false })
    .limit(limit);
  if (error && isMissingSchemaError(error)) return [];
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    prop_id: string;
    group_id: string;
    run_at: string;
    status: JoinQueueItem["status"];
    fit: number;
    reason: string;
    error: string | null;
    profiles: { full_name?: string | null; username?: string | null } | Array<{ full_name?: string | null; username?: string | null }> | null;
    discussion_groups: { title?: string | null } | Array<{ title?: string | null }> | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const group = Array.isArray(row.discussion_groups) ? row.discussion_groups[0] : row.discussion_groups;
    return {
      id: String(row.id),
      propId: String(row.prop_id),
      propName: profile?.full_name?.trim() || profile?.username?.trim() || "Prop",
      groupId: String(row.group_id),
      groupTitle: group?.title ?? "Group",
      runAt: row.run_at,
      status: row.status,
      fit: Number(row.fit ?? 2),
      reason: row.reason ?? "",
      error: row.error,
    };
  });
}

export async function cancelJoin(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("prop_join_queue").update({ status: "cancelled", done_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  if (error) throw new Error(isMissingSchemaError(error) ? CASTING_SCHEMA_HINT : error.message);
}

type GroupRow = { id: string; title: string | null; description: string | null; categories: string[] | null; discussion_id: string | null };

type World = {
  propIds: Set<string>;
  systemOwnerId: string | null;
  names: Map<string, string>;
  voices: Map<string, PropVoice>;
  homes: Map<string, PropHome>;
  groups: GroupRow[];
  hubLocales: Map<string, HubLocale>;
  members: Map<string, Set<string>>;
  groupsByProp: Map<string, Set<string>>;
  bans: Set<string>;
  queued: Set<string>;
};

async function loadWorld(): Promise<World> {
  const [profiles, voices, propGroups] = await Promise.all([listPropProfiles(), loadAccountVoices(), loadPropMemberIdsByGroup()]);
  const propIds = new Set(profiles.map((row) => String(row.id)));
  const names = new Map(profiles.map((row) => [String(row.id), row.full_name?.trim() || row.username?.trim() || "Member"]));
  const locales = await loadGroupLocales([...propGroups.keys()]);
  const hubLists = hubListsByProp(propGroups, locales);
  for (const id of propIds) if (!hubLists.has(id)) hubLists.set(id, []);
  const homes = await loadPropHomes(hubLists);

  const { data: owner } = await supabaseAdmin.from("profiles").select("id").eq("email", SYSTEM_GROUP_OWNER_EMAIL).maybeSingle();
  const groups: GroupRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("discussion_groups")
      .select("id, title, description, categories, discussion_id")
      .is("archived_at", null)
      .eq("visibility", "public")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    groups.push(...((data ?? []) as GroupRow[]));
    if (!data || data.length < 1000) break;
  }
  const hubLocales = await loadHubLocales(groups.map((group) => String(group.discussion_id ?? "")));

  const members = new Map<string, Set<string>>();
  const groupIds = groups.map((group) => String(group.id));
  for (let index = 0; index < groupIds.length; index += 80) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from("discussion_group_members")
        .select("group_id, user_id")
        .in("group_id", groupIds.slice(index, index + 80))
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as Array<{ group_id: string; user_id: string }>) {
        const set = members.get(String(row.group_id)) ?? new Set<string>();
        set.add(String(row.user_id));
        members.set(String(row.group_id), set);
      }
      if (!data || data.length < 1000) break;
    }
  }
  const groupsByProp = new Map<string, Set<string>>();
  for (const [groupId, ids] of propGroups) {
    for (const id of ids) groupsByProp.set(id, (groupsByProp.get(id) ?? new Set<string>()).add(groupId));
  }

  const [{ data: banRows }, { data: queueRows }] = await Promise.all([
    supabaseAdmin.from("discussion_group_bans").select("group_id, user_id").limit(5000),
    supabaseAdmin.from("prop_join_queue").select("prop_id, group_id").in("status", ["pending", "done"]).limit(5000),
  ]);
  return {
    propIds,
    systemOwnerId: owner?.id ? String(owner.id) : null,
    names,
    voices,
    homes,
    groups,
    hubLocales,
    members,
    groupsByProp,
    bans: new Set(((banRows ?? []) as Array<{ group_id: string; user_id: string }>).map((row) => `${row.group_id}:${row.user_id}`)),
    queued: new Set(((queueRows ?? []) as Array<{ prop_id: string; group_id: string }>).map((row) => `${row.group_id}:${row.prop_id}`)),
  };
}

function groupMix(world: World, groupId: string): { props: number; real: number } {
  let props = 0;
  let real = 0;
  for (const id of world.members.get(groupId) ?? []) {
    if (world.propIds.has(id)) props += 1;
    else if (id !== world.systemOwnerId) real += 1;
  }
  return { props, real };
}

/** Groups with real members keep props under the share cap. Prop and Sterling-only groups have no cap. */
function underShare(mix: { props: number; real: number }, share: number): boolean {
  if (mix.real === 0) return true;
  return (mix.props + 1) / (mix.props + mix.real + 1) <= share;
}

function isNear(home: PropHome, hub: HubLocale | undefined): boolean {
  if (!hub) return false;
  if (hub.hubId === home.hubId) return true;
  if (home.lat === null || home.lng === null || hub.lat === null || hub.lng === null) return false;
  return milesBetween(home.lat, home.lng, hub.lat, hub.lng) <= LOCAL_MILES;
}

function pairBlocked(world: World, settings: CastingSettings, excludedByHub: Map<string, Set<string>>, propId: string, group: GroupRow): string | null {
  const groupId = String(group.id);
  if (world.members.get(groupId)?.has(propId)) return "already a member";
  if (world.bans.has(`${groupId}:${propId}`)) return "banned there";
  if (world.queued.has(`${groupId}:${propId}`)) return "already queued";
  if ((world.groupsByProp.get(propId)?.size ?? 0) >= settings.maxGroupsPerProp) return "in enough groups";
  if (excludedByHub.get(String(group.discussion_id ?? ""))?.has(propId)) return "left out of that region's run";
  const mix = groupMix(world, groupId);
  if (isMinorVoice(world.voices.get(propId)) && mix.real > 0) return "teen persona, group has real members";
  if (!underShare(mix, settings.maxPropShare)) return "group already has enough props";
  return null;
}

function personaLine(world: World, propId: string, index: number): string {
  const voice = world.voices.get(propId);
  const traits = voice?.traits;
  const bits = [
    traits?.age != null ? `${traits.age} years old` : "",
    traits?.temperament || "",
    traits?.life || "",
    traits?.interests ? `into ${traits.interests}` : "",
    voice?.personality ? voice.personality.slice(0, 120) : "",
  ].filter(Boolean);
  return `M${index + 1}. ${world.names.get(propId) ?? "Member"}: ${bits.join(", ") || "no persona"}`;
}

async function rankPairs(world: World, propIds: string[], groups: GroupRow[], place: string) {
  const system = [
    `You match members of a local social app in ${place || "one area"} to groups they would realistically join on their own.`,
    "Only suggest a group when the member's interests, age, or life clearly fit what the group is about. Most members fit few groups. Suggesting nothing is fine.",
    "Teen members only fit school, teen, or hobby groups for their age.",
    "fit is 3 for a clear match, 2 for a good one, 1 for weak. At most 2 groups per member.",
    'Answer with JSON only: {"matches":[{"member":1,"group":2,"fit":3,"why":"short reason"}]}',
  ].join("\n");
  const prompt = [
    "Members:",
    ...propIds.map((id, index) => personaLine(world, id, index)),
    "",
    "Groups:",
    ...groups.map(
      (group, index) =>
        `G${index + 1}. ${group.title ?? "Group"}${group.categories?.length ? ` [${group.categories.join(", ")}]` : ""}${group.description ? `: ${group.description.slice(0, 160)}` : ""}`,
    ),
  ].join("\n");
  let text = "";
  if (geminiConfigured()) {
    try {
      text = (await geminiJson({ system, prompt, model: GEMINI_LITE_MODEL, maxOutputTokens: 2048, timeoutMs: 12_000 })).text;
    } catch (error) {
      console.error("[casting] gemini failed:", error instanceof Error ? error.message : error);
    }
  }
  if (!text) text = (await groqJson(system, prompt, { label: "casting", maxTokens: 1500, timeoutMs: 10_000 })).text;
  const raw = parseJsonObject(text);
  const list = Array.isArray(raw?.matches) ? (raw.matches as Array<Record<string, unknown>>) : [];
  return list
    .map((item) => ({
      propId: propIds[Number(item.member) - 1],
      group: groups[Number(item.group) - 1],
      fit: Math.min(3, Math.max(1, Math.round(Number(item.fit) || 1))),
      why: String(item.why ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    }))
    .filter((item): item is { propId: string; group: GroupRow; fit: number; why: string } => Boolean(item.propId && item.group));
}

function spreadTime(zone: string, startHour: number, endHour: number): string {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const at = new Date(Date.now() + (20 + Math.random() * 22 * 60) * 60_000);
    if (withinActiveHours(startHour, endHour, hourIn(zone, at))) return at.toISOString();
  }
  return new Date(Date.now() + (60 + Math.random() * 600) * 60_000).toISOString();
}

async function joinsInLastDay(): Promise<{ total: number; byGroup: Map<string, number> }> {
  const { data } = await supabaseAdmin
    .from("prop_join_queue")
    .select("group_id, status, run_at, created_at")
    .in("status", ["pending", "done"])
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString())
    .limit(2000);
  const byGroup = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ group_id: string }>) byGroup.set(String(row.group_id), (byGroup.get(String(row.group_id)) ?? 0) + 1);
  return { total: (data ?? []).length, byGroup };
}

/** Scores one home hub's props against nearby groups and queues the best few joins. */
async function castHub(world: World, settings: CastingSettings, hubId: string, excludedByHub: Map<string, Set<string>>): Promise<number> {
  const hub = world.hubLocales.get(hubId) ?? (await loadHubLocales([hubId])).get(hubId);
  const props = [...world.homes.entries()].filter(([, home]) => home.hubId === hubId).map(([id]) => id);
  const nearGroups = world.groups.filter((group) => {
    const home = world.homes.get(props[0] ?? "");
    return home ? isNear(home, world.hubLocales.get(String(group.discussion_id ?? ""))) : false;
  });
  const open = (propId: string) => nearGroups.filter((group) => !pairBlocked(world, settings, excludedByHub, propId, group));
  const castable = props
    .filter((id) => open(id).length > 0)
    .sort((a, b) => (world.groupsByProp.get(a)?.size ?? 0) - (world.groupsByProp.get(b)?.size ?? 0))
    .slice(0, PROPS_PER_BATCH);
  const candidateGroups = [...new Set(castable.flatMap(open))]
    .sort((a, b) => groupMix(world, String(a.id)).props - groupMix(world, String(b.id)).props)
    .slice(0, GROUPS_PER_BATCH);
  let queued = 0;
  if (castable.length > 0 && candidateGroups.length > 0) {
    const matches = (await rankPairs(world, castable, candidateGroups, hub?.place ?? "")).filter((match) => match.fit >= 2);
    matches.sort((a, b) => b.fit - a.fit);
    const conversation = await loadConversationSettings();
    const recent = await joinsInLastDay();
    let total = recent.total;
    const perProp = new Map<string, number>();
    for (const match of matches) {
      if (total >= settings.maxJoinsPerDay) break;
      const groupId = String(match.group.id);
      if ((recent.byGroup.get(groupId) ?? 0) >= 1) continue;
      if ((perProp.get(match.propId) ?? 0) >= 1) continue;
      if (pairBlocked(world, settings, excludedByHub, match.propId, match.group)) continue;
      const zone = world.hubLocales.get(String(match.group.discussion_id ?? ""))?.timeZone ?? hub?.timeZone ?? "America/New_York";
      const { error } = await supabaseAdmin.from("prop_join_queue").insert({
        prop_id: match.propId,
        group_id: groupId,
        hub_id: match.group.discussion_id,
        run_at: spreadTime(zone, conversation.activeStartHour, conversation.activeEndHour),
        fit: match.fit,
        reason: match.why,
      });
      if (error) {
        if (error.code !== "23505") console.error("[casting] could not queue a join:", error.message);
        continue;
      }
      world.queued.add(`${groupId}:${match.propId}`);
      recent.byGroup.set(groupId, 1);
      perProp.set(match.propId, 1);
      total += 1;
      queued += 1;
    }
  }
  await supabaseAdmin
    .from("prop_casting_runs")
    .upsert({ hub_id: hubId, ran_at: new Date().toISOString(), queued, note: `${castable.length} props, ${candidateGroups.length} groups` }, { onConflict: "hub_id" });
  return queued;
}

/** Turns a group on for the director once enough props are in it. Groups an admin already set up are left alone. */
export async function activateIfReady(groupId: string, propIds: Set<string>): Promise<boolean> {
  const { data: members } = await supabaseAdmin.from("discussion_group_members").select("user_id").eq("group_id", groupId);
  const props = ((members ?? []) as Array<{ user_id: string }>).filter((row) => propIds.has(String(row.user_id))).length;
  if (props < ACTIVATE_AT_PROPS) return false;
  const { data: existing } = await supabaseAdmin.from("prop_conversation_groups").select("group_id").eq("group_id", groupId).maybeSingle();
  if (existing) return false;
  const { error } = await supabaseAdmin.from("prop_conversation_groups").insert({
    group_id: groupId,
    enabled: true,
    planner: "director",
    topic: "",
    posts_per_day: 2,
    replies_per_post: 2,
    auto_continue: true,
  });
  if (error) {
    if (error.code !== "23505") console.error("[casting] could not turn the group on:", error.message);
    return false;
  }
  return true;
}

async function applyDueJoins(world: World, settings: CastingSettings, result: CastingResult): Promise<void> {
  const { data } = await supabaseAdmin
    .from("prop_join_queue")
    .select("id, prop_id, group_id, hub_id")
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(5);
  const excludedByHub = await loadExcludedByHub();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  for (const row of (data ?? []) as Array<{ id: string; prop_id: string; group_id: string; hub_id: string | null }>) {
    const propId = String(row.prop_id);
    const groupId = String(row.group_id);
    const group = world.groups.find((item) => String(item.id) === groupId);
    world.queued.delete(`${groupId}:${propId}`);
    const blocked = !group ? "group is gone or not public" : pairBlocked(world, settings, excludedByHub, propId, group);
    const { count } = await supabaseAdmin
      .from("prop_join_queue")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("status", "done")
      .gte("done_at", since);
    const reason = blocked ?? ((count ?? 0) >= 1 ? "one join per group per day" : null);
    if (reason) {
      await supabaseAdmin.from("prop_join_queue").update({ status: "skipped", error: reason, done_at: new Date().toISOString() }).eq("id", row.id);
      continue;
    }
    try {
      await addGroupMembers(groupId, [propId], "member");
      await supabaseAdmin.from("prop_join_queue").update({ status: "done", done_at: new Date().toISOString() }).eq("id", row.id);
      world.members.set(groupId, (world.members.get(groupId) ?? new Set<string>()).add(propId));
      world.groupsByProp.set(propId, (world.groupsByProp.get(propId) ?? new Set<string>()).add(groupId));
      world.queued.add(`${groupId}:${propId}`);
      result.joined += 1;
      if (await activateIfReady(groupId, world.propIds)) {
        result.activated += 1;
        if (group?.discussion_id && (await ensureHubWatch(String(group.discussion_id)))) result.watches += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Join failed";
      await supabaseAdmin.from("prop_join_queue").update({ status: "skipped", error: message.slice(0, 300), done_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
}

/** Applies joins that are due, then casts the home hub that has waited longest, inside the time limit. */
export async function runCasting(options: { maxMs: number }): Promise<CastingResult> {
  const startedAt = Date.now();
  const result: CastingResult = { joined: 0, queued: 0, activated: 0, watches: 0, notes: [] };
  const settings = await loadCastingSettings();
  if (!settings.ready || !settings.enabled) return result;
  if (!(await loadConversationSettings()).enabled) return result;
  const world = await loadWorld();
  await applyDueJoins(world, settings, result);
  if (Date.now() - startedAt > options.maxMs) return result;

  const paused = await loadPausedGroupIds();
  const pausedHubs = new Set(world.groups.filter((group) => paused.has(String(group.id))).map((group) => String(group.discussion_id ?? "")));
  const homeHubs = [...new Set([...world.homes.values()].map((home) => home.hubId))].filter((id) => !pausedHubs.has(id));
  if (homeHubs.length === 0) return result;
  const { data: runs } = await supabaseAdmin.from("prop_casting_runs").select("hub_id, ran_at").in("hub_id", homeHubs);
  const lastRun = new Map(((runs ?? []) as Array<{ hub_id: string; ran_at: string }>).map((row) => [String(row.hub_id), new Date(row.ran_at).getTime()]));
  const due = homeHubs.filter((id) => Date.now() - (lastRun.get(id) ?? 0) >= CAST_EVERY_MS).sort((a, b) => (lastRun.get(a) ?? 0) - (lastRun.get(b) ?? 0));
  const hubId = due[0];
  if (!hubId) return result;
  try {
    result.queued += await castHub(world, settings, hubId, await loadExcludedByHub());
  } catch (error) {
    result.notes.push(error instanceof Error ? `Casting: ${error.message}` : "Casting failed");
  }
  return result;
}

