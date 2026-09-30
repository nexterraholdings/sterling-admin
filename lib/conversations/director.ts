import { GEMINI_LITE_MODEL, GEMINI_MODEL, geminiConfigured, geminiJson } from "@/lib/ai/gemini";
import { groqJson, parseJsonObject } from "@/lib/ai/groq-json";
import { listJoinQueue, loadCastingSettings, type CastingSettings, type JoinQueueItem } from "@/lib/conversations/casting";
import { loadConversationSettings, loadConversationUsage, loadPropMemberIdsByGroup } from "@/lib/conversations/db";
import { loadGroupLocales, type HubLocale } from "@/lib/conversations/hub-locale";
import { recordRunMoment } from "@/lib/conversations/moments";
import { hubListsByProp, loadPropHomes } from "@/lib/conversations/prop-home";
import { loadExcludedByGroup, loadPausedGroupIds } from "@/lib/conversations/region-runs";
import { dateKeyIn, dayKeysAheadIn, hourIn, instantIn, startOfDayIn, withinActiveHours } from "@/lib/conversations/time";
import { parseWeekDays } from "@/lib/conversations/week";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { listFactsForGroup, loadWatchedHubIds } from "@/lib/knowledge/db";
import type { KnowledgeFact } from "@/lib/knowledge/types";
import { isPropAccountEmail } from "@/lib/prop-accounts";
import type { PropVoice } from "@/lib/prop-voice";
import { loadAccountVoices } from "@/lib/prop-voice-store";
import { supabaseAdmin } from "@/lib/supabase/server";

export const DIRECTOR_SCHEMA_HINT = "Run supabase/sql/prop_director.sql in Supabase first.";

export type DirectorMode = "off" | "review" | "auto";
export type DirectorSettings = { mode: DirectorMode; everyHours: number; ready: boolean };

export type DirectorAction =
  | { type: "start_post"; propId: string; propName: string; factId: string | null; fact: string | null; brief: string; at: string }
  | { type: "reply"; propId: string; propName: string; commentId: string; comment: string; brief: string; at: string }
  | { type: "like"; propId: string; propName: string; commentId: string; comment: string; at: string }
  | { type: "note"; text: string };

export type DroppedAction = { action: string; reason: string };

export type DirectorPlan = {
  id: string;
  groupId: string | null;
  hubId: string | null;
  kind: "group" | "new_group";
  status: "proposed" | "approved" | "rejected" | "applied" | "failed";
  model: string;
  reasoning: string;
  actions: unknown[];
  dropped: DroppedAction[];
  error: string | null;
  createdAt: string;
  decidedAt: string | null;
  appliedAt: string | null;
};

const MAX_ACTIONS = 12;
const MAX_START_POSTS = 3;
const COMMENTS_IN_CONTEXT = 30;
const JOURNAL_IN_CONTEXT = 10;
const CAST_IN_CONTEXT = 16;
const REFLECT_EVERY_MS = 20 * 60 * 60 * 1000;
const WEATHER_GAP_MS = 20 * 60 * 60 * 1000;

export async function loadDirectorSettings(): Promise<DirectorSettings> {
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_settings")
    .select("director_mode, director_every_hours")
    .eq("id", 1)
    .maybeSingle();
  if (error && isMissingSchemaError(error)) return { mode: "off", everyHours: 6, ready: false };
  if (error) throw new Error(error.message);
  const mode = data?.director_mode === "auto" || data?.director_mode === "off" ? data.director_mode : "review";
  return { mode, everyHours: Math.min(48, Math.max(1, Number(data?.director_every_hours ?? 6))), ready: true };
}

export async function saveDirectorSettings(patch: { mode?: DirectorMode; everyHours?: number }): Promise<void> {
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.mode) next.director_mode = patch.mode;
  if (patch.everyHours != null) next.director_every_hours = Math.min(48, Math.max(1, Math.round(patch.everyHours)));
  const { error } = await supabaseAdmin.from("prop_conversation_settings").update(next).eq("id", 1);
  if (error) throw new Error(isMissingSchemaError(error) ? DIRECTOR_SCHEMA_HINT : error.message);
}

/** Enabled groups the director plans instead of the random scheduler. */
export async function loadDirectorGroupIds(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .select("group_id")
    .eq("enabled", true)
    .eq("planner", "director");
  if (error && isMissingSchemaError(error)) return new Set();
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ group_id: string }>).map((row) => String(row.group_id)));
}

export async function setGroupPlanner(groupId: string, planner: "random" | "director"): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .update({ planner, updated_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .select("group_id");
  if (error) throw new Error(isMissingSchemaError(error) ? DIRECTOR_SCHEMA_HINT : error.message);
  if (!data || data.length === 0) throw new Error("That group has no conversation settings yet. Start a run first.");
}

/** Brief and preset fact the director gave a job. Null for jobs it did not plan. */
export async function loadJobDirection(jobId: string): Promise<{ brief: string; knowledgeItemId: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("brief, knowledge_item_id, director_plan_id")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return null;
  if (!data?.director_plan_id) return null;
  return { brief: String(data.brief ?? "").trim(), knowledgeItemId: data.knowledge_item_id ? String(data.knowledge_item_id) : null };
}

type GroupConfig = {
  group_id: string;
  topic: string | null;
  posts_per_day: number | null;
  week_days: number | null;
  week_start_hour: number | null;
  week_end_hour: number | null;
  calls_per_day: number | null;
};

type CommentRow = { id: string; author_id: string; body: string | null; parent_id: string | null; created_at: string };

type Context = {
  groupId: string;
  title: string;
  description: string;
  hubId: string;
  locale: HubLocale | undefined;
  zone: string;
  window: { start: number; end: number };
  horizonHours: number;
  cast: Array<{ id: string; name: string; voice: PropVoice | undefined; lastSpoke: string | null; memories: string[] }>;
  comments: Array<CommentRow & { authorName: string; isProp: boolean }>;
  facts: KnowledgeFact[];
  watched: boolean;
  weatherUsedAt: number | null;
  startsToday: number;
  postsPerDay: number;
  callsLeft: number;
  pending: Array<{ kind: string; author: string; runAt: string }>;
  journal: string[];
  likedBy: Set<string>;
};

async function gatherContext(groupId: string, horizonHours: number): Promise<Context> {
  const [{ data: group, error: groupError }, { data: config, error: configError }, settings, usage, members, excludedByGroup, locales, watched, voices] =
    await Promise.all([
      supabaseAdmin.from("discussion_groups").select("id, title, description, discussion_id").eq("id", groupId).maybeSingle(),
      supabaseAdmin
        .from("prop_conversation_groups")
        .select("group_id, topic, posts_per_day, week_days, week_start_hour, week_end_hour, calls_per_day")
        .eq("group_id", groupId)
        .maybeSingle(),
      loadConversationSettings(),
      loadConversationUsage(),
      loadPropMemberIdsByGroup(),
      loadExcludedByGroup(),
      loadGroupLocales([groupId]),
      loadWatchedHubIds(),
      loadAccountVoices(),
    ]);
  if (groupError) throw new Error(groupError.message);
  if (configError) throw new Error(configError.message);
  if (!group) throw new Error("group_not_found");
  const cfg = (config ?? { group_id: groupId }) as GroupConfig;
  const hubId = String(group.discussion_id ?? "");
  const locale = locales.get(groupId);
  const zone = locale?.timeZone ?? "America/New_York";
  const scheduled = parseWeekDays(cfg.week_days) > 0;
  const window = scheduled
    ? { start: Number(cfg.week_start_hour ?? 9), end: Number(cfg.week_end_hour ?? 21) }
    : { start: settings.activeStartHour, end: settings.activeEndHour };

  const excluded = excludedByGroup.get(groupId);
  const castIds = (members.get(groupId) ?? []).filter((id) => !excluded?.has(id));
  const since = startOfDayIn(zone);

  const [{ data: comments, error: commentError }, { data: doneJobs }, { data: pendingJobs }, { data: memoryRows }, { data: journalRows }, profiles] =
    await Promise.all([
      supabaseAdmin
        .from("area_discussion_comments")
        .select("id, author_id, body, parent_id, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(COMMENTS_IN_CONTEXT),
      supabaseAdmin
        .from("prop_engagement_jobs")
        .select("author_id, kind, finished_at, created_at, knowledge_item_id, knowledge_items(source)")
        .eq("group_id", groupId)
        .eq("status", "done")
        .gte("finished_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("finished_at", { ascending: false })
        .limit(300),
      supabaseAdmin
        .from("prop_engagement_jobs")
        .select("author_id, kind, run_at, created_at, status")
        .eq("group_id", groupId)
        .in("status", ["pending", "running"])
        .order("run_at", { ascending: true })
        .limit(40),
      castIds.length > 0
        ? supabaseAdmin
            .from("prop_memories")
            .select("prop_id, about_id, fact, importance, created_at")
            .in("prop_id", castIds)
            .order("importance", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(castIds.length * 8)
        : Promise.resolve({ data: [], error: null }),
      supabaseAdmin.from("prop_group_journal").select("note").eq("group_id", groupId).not("note", "like", "Lesson: nothing clear%").order("created_at", { ascending: false }).limit(JOURNAL_IN_CONTEXT),
      profilesFor([...castIds]),
    ]);
  if (commentError) throw new Error(commentError.message);

  const commentRows = ((comments ?? []) as CommentRow[]).reverse();
  const authorProfiles = await profilesFor(commentRows.map((row) => String(row.author_id)));
  const lastSpoke = new Map<string, string>();
  let weatherUsedAt: number | null = null;
  type DoneRow = { author_id: string; kind: string; finished_at: string | null; knowledge_items: { source?: string } | Array<{ source?: string }> | null };
  for (const row of (doneJobs ?? []) as unknown as DoneRow[]) {
    const author = String(row.author_id);
    if (row.kind !== "like" && !lastSpoke.has(author) && row.finished_at) lastSpoke.set(author, row.finished_at);
    const joined = Array.isArray(row.knowledge_items) ? row.knowledge_items[0] : row.knowledge_items;
    if (joined?.source === "weather" && row.finished_at) {
      const at = new Date(row.finished_at).getTime();
      weatherUsedAt = Math.max(weatherUsedAt ?? 0, at);
    }
  }
  const startsToday =
    ((doneJobs ?? []) as unknown as Array<DoneRow & { created_at: string }>).filter((row) => row.kind === "start_post" && row.created_at >= since).length +
    ((pendingJobs ?? []) as Array<{ kind: string }>).filter((row) => row.kind === "start_post").length;
  const callsToday = ((doneJobs ?? []) as unknown as Array<DoneRow & { created_at: string }>).filter(
    (row) => row.kind !== "like" && (row.finished_at ?? "") >= since,
  ).length;
  const groupCallsLeft = scheduled ? Math.max(0, Number(cfg.calls_per_day ?? 12) - callsToday) : Number.POSITIVE_INFINITY;
  const callsLeft = Math.max(0, Math.min(settings.dailyCallBudget - usage.calls, groupCallsLeft));

  const memoryList = (memoryRows ?? []) as Array<{ prop_id: string; about_id: string | null; fact: string }>;
  const aboutNames = await profilesFor(memoryList.map((row) => String(row.about_id ?? "")));
  const memoriesByProp = new Map<string, string[]>();
  const counts = new Map<string, { own: number; about: number }>();
  for (const row of memoryList) {
    const propId = String(row.prop_id);
    const count = counts.get(propId) ?? { own: 0, about: 0 };
    const about = row.about_id ? aboutNames.get(String(row.about_id))?.name : null;
    if (about ? count.about >= 2 : count.own >= 3) continue;
    if (about) count.about += 1;
    else count.own += 1;
    counts.set(propId, count);
    memoriesByProp.set(propId, [...(memoriesByProp.get(propId) ?? []), about ? `About ${about}: ${row.fact}` : row.fact]);
  }

  const facts = hubId && watched.has(hubId) ? await listFactsForGroup(hubId, groupId, 8) : [];
  const commentIds = commentRows.map((row) => String(row.id));
  const { data: likes } = commentIds.length
    ? await supabaseAdmin.from("area_discussion_comment_likes").select("comment_id, user_id").in("comment_id", commentIds)
    : { data: [] };

  return {
    groupId,
    title: String(group.title ?? ""),
    description: String(group.description ?? ""),
    hubId,
    locale,
    zone,
    window,
    horizonHours,
    cast: pickCast(castIds, lastSpoke, commentRows).map((id) => ({
      id,
      name: profiles.get(id)?.name ?? "Member",
      voice: voices.get(id),
      lastSpoke: lastSpoke.get(id) ?? null,
      memories: memoriesByProp.get(id) ?? [],
    })),
    comments: commentRows.map((row) => {
      const author = authorProfiles.get(String(row.author_id));
      return { ...row, id: String(row.id), author_id: String(row.author_id), authorName: author?.name ?? "Member", isProp: Boolean(author?.isProp) };
    }),
    facts,
    watched: Boolean(hubId && watched.has(hubId)),
    weatherUsedAt,
    startsToday,
    postsPerDay: Math.max(1, Number(cfg.posts_per_day ?? 2)),
    callsLeft,
    pending: ((pendingJobs ?? []) as Array<{ kind: string; author_id: string; run_at: string }>).map((row) => ({
      kind: row.kind,
      author: profiles.get(String(row.author_id))?.name ?? "Member",
      runAt: row.run_at,
    })),
    journal: ((journalRows ?? []) as Array<{ note: string }>).map((row) => row.note),
    likedBy: new Set(((likes ?? []) as Array<{ comment_id: string; user_id: string }>).map((row) => `${row.comment_id}:${row.user_id}`)),
  };
}

/** Big groups get a rotating slice: whoever is in the recent chat, then whoever has been quiet longest. */
function pickCast(castIds: string[], lastSpoke: Map<string, string>, comments: CommentRow[]): string[] {
  if (castIds.length <= CAST_IN_CONTEXT) return castIds;
  const inChat = new Set(comments.slice(-12).map((row) => String(row.author_id)));
  const ranked = [...castIds].sort(
    (a, b) =>
      Number(inChat.has(b)) - Number(inChat.has(a)) ||
      new Date(lastSpoke.get(a) ?? 0).getTime() - new Date(lastSpoke.get(b) ?? 0).getTime(),
  );
  const talkers = ranked.filter((id) => inChat.has(id)).slice(0, Math.floor(CAST_IN_CONTEXT / 2));
  return [...talkers, ...ranked.filter((id) => !talkers.includes(id))].slice(0, CAST_IN_CONTEXT);
}

async function profilesFor(ids: string[]): Promise<Map<string, { name: string; isProp: boolean }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, { name: string; isProp: boolean }>();
  for (let index = 0; index < unique.length; index += 100) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, email")
      .in("id", unique.slice(index, index + 100));
    for (const row of (data ?? []) as Array<{ id: string; full_name: string | null; username: string | null; email: string | null }>) {
      map.set(String(row.id), { name: row.full_name?.trim() || row.username?.trim() || "Member", isProp: isPropAccountEmail(row.email) });
    }
  }
  return map;
}

function localTime(zone: string, iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return "under an hour ago";
  if (hours < 36) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function castLine(member: Context["cast"][number], index: number, homes: Map<string, { place: string }>): string {
  const traits = member.voice?.traits;
  const bits = [
    traits?.age != null ? `${traits.age} years old` : "",
    traits?.temperament || "",
    traits?.life || "",
    traits?.interests ? `into ${traits.interests}` : "",
    homes.get(member.id)?.place ? `lives in ${homes.get(member.id)?.place}` : "",
    member.voice?.personality ? member.voice.personality.slice(0, 140) : "",
  ].filter(Boolean);
  const memories = member.memories.length ? ` Remembers: ${member.memories.join(" | ")}` : "";
  return `P${index + 1}. ${member.name} (${bits.join(", ") || "no persona set"}). Last spoke ${ago(member.lastSpoke)}.${memories}`;
}

function buildPrompt(ctx: Context, homes: Map<string, { place: string }>): { system: string; prompt: string } {
  const place = ctx.locale?.place || ctx.title;
  const now = new Date();
  const system = [
    `You direct the prop members of a neighborhood group chat on Sterling in ${place}. They are AI characters. You decide what they do over the next ${ctx.horizonHours} hours so the group feels like real neighbors talking.`,
    "Rules:",
    "- Quiet is normal. Real groups have lulls. Plan between 0 and 8 actions, and plan nothing when nothing fits.",
    "- Spread activity out like real people: different times, gaps of at least 10 minutes, never the same person twice in a row, and not everyone at once.",
    "- New posts should come from the real facts listed when there are any. Pick what locals would actually talk about. At most one weather post a day.",
    "- Without a fact, never present news, weather, scores, prices, or events as true. Posts without a fact are about personal life, opinions, plans, or questions.",
    "- A reply brief answers that exact comment, not a different one.",
    "- Replies only go to comments already listed. Replies to the new posts you plan get scheduled on their own after they go live.",
    "- Replies should move the conversation: disagree, joke, ask a follow up, or call back to what someone remembers. Build running bits and friendly rivalries between members over time.",
    "- Fit each member: their age, temperament, interests, and memories. Never have them contradict what they remember.",
    "- A brief is one sentence telling the writer what this person wants to say or do. Do not write the message itself.",
    "- Only reply to or like comments marked prop. Comments from real members are context only.",
    "- Likes are cheap and common. People like more than they reply.",
    `- Times are local HH:MM between ${ctx.window.start}:00 and ${ctx.window.end}:00, within the next ${ctx.horizonHours} hours.`,
    "- Add a note when you learn something about this group worth remembering for next time.",
    'Answer with JSON only: {"reasoning":"two or three sentences","actions":[{"type":"start_post","prop":1,"fact":2,"brief":"...","at":"18:40"},{"type":"reply","prop":3,"comment":5,"brief":"...","at":"18:55"},{"type":"like","prop":2,"comment":5,"at":"19:02"},{"type":"note","text":"..."}]}',
    'Use "fact": null for a post without a fact. prop, comment, and fact are the numbers from the lists.',
  ].join("\n");

  const lines = [
    `Group: ${ctx.title}${ctx.description ? `. ${ctx.description.slice(0, 200)}` : ""}`,
    `Local time now: ${localTime(ctx.zone, now.toISOString())} (${ctx.zone})`,
    withinActiveHours(ctx.window.start, ctx.window.end, hourIn(ctx.zone))
      ? `Active until ${ctx.window.end}:00 local.`
      : `Active hours are over for now. They open again at ${ctx.window.start}:00 local. Plan only for then, or plan nothing.`,
    `New posts today: ${ctx.startsToday} of ${ctx.postsPerDay}. Model calls left today: ${Number.isFinite(ctx.callsLeft) ? ctx.callsLeft : "plenty"}.`,
    ctx.callsLeft <= 0 ? "No model calls left today, so only likes and notes are possible." : "",
    ctx.weatherUsedAt && now.getTime() - ctx.weatherUsedAt < WEATHER_GAP_MS ? "A weather post already went out today." : "",
    "",
    "Members you control:",
    ...ctx.cast.map((member, index) => castLine(member, index, homes)),
    "",
    "Recent comments, oldest first:",
    ...(ctx.comments.length
      ? ctx.comments.map((comment, index) => {
          const parent = comment.parent_id ? ctx.comments.findIndex((row) => row.id === comment.parent_id) : -1;
          const who = comment.isProp ? `${comment.authorName} (prop)` : "a real member";
          return `C${index + 1}. ${who}, ${localTime(ctx.zone, comment.created_at)}${parent >= 0 ? `, replying to C${parent + 1}` : ""}: ${String(comment.body ?? "").replace(/\s+/g, " ").slice(0, 220)}`;
        })
      : ["(none yet)"]),
    "",
    ctx.facts.length ? "Real facts you can open with:" : ctx.watched ? "No fresh facts right now, so do not plan new posts." : "No fact feed for this city. New posts can be everyday local life.",
    ...ctx.facts.map((fact, index) => `F${index + 1}. [${fact.source ?? "news"}] ${fact.claim}`),
    "",
    ctx.pending.length ? "Already scheduled:" : "",
    ...ctx.pending.map((job) => `- ${job.author} ${job.kind === "start_post" ? "posts" : job.kind} at ${localTime(ctx.zone, job.runAt)}`),
    "",
    ctx.journal.length ? "Your notes about this group:" : "",
    ...ctx.journal.map((note) => `- ${note}`),
  ];
  return { system, prompt: lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n") };
}

async function askModel(system: string, prompt: string, model = GEMINI_MODEL): Promise<{ text: string; model: string }> {
  if (geminiConfigured()) {
    const models = [...new Set([model, GEMINI_LITE_MODEL])];
    for (const [index, name] of models.entries()) {
      try {
        const reply = await geminiJson({ system, prompt, model: name, maxOutputTokens: 4096, timeoutMs: index === 0 ? 18_000 : 12_000 });
        if (reply.text) return reply;
      } catch (error) {
        console.error(`[director] ${name} failed:`, error instanceof Error ? error.message : error);
      }
    }
  }
  return groqJson(system, prompt, { label: "director", maxTokens: 2000, timeoutMs: 12_000 });
}

function parseAt(value: unknown, ctx: Context): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const now = Date.now();
  let at = instantIn(ctx.zone, dateKeyIn(ctx.zone), hour, minute);
  if (at.getTime() < now - 5 * 60_000) at = instantIn(ctx.zone, dayKeysAheadIn(ctx.zone, 2)[1] ?? dateKeyIn(ctx.zone), hour, minute);
  return at;
}

function inWindow(at: Date, ctx: Context): string | null {
  if (at.getTime() > Date.now() + (ctx.horizonHours + 1) * 3_600_000) return `after the next ${ctx.horizonHours} hours`;
  if (!withinActiveHours(ctx.window.start, ctx.window.end, hourIn(ctx.zone, at))) return "outside active hours";
  return null;
}

function validate(raw: Record<string, unknown> | null, ctx: Context): { reasoning: string; actions: DirectorAction[]; dropped: DroppedAction[] } {
  const reasoning = String(raw?.reasoning ?? "").trim().slice(0, 1200);
  const list = Array.isArray(raw?.actions) ? (raw.actions as Array<Record<string, unknown>>) : [];
  const actions: DirectorAction[] = [];
  const dropped: DroppedAction[] = [];
  const drop = (item: Record<string, unknown>, reason: string) => dropped.push({ action: JSON.stringify(item).slice(0, 300), reason });
  let starts = 0;
  let calls = 0;
  let weatherPlanned = Boolean(ctx.weatherUsedAt && Date.now() - ctx.weatherUsedAt < WEATHER_GAP_MS);
  const replyKeys = new Set<string>();
  const likeKeys = new Set<string>(ctx.likedBy);
  const lastAuthor: { id: string | null; at: number } = { id: null, at: 0 };

  for (const item of list.slice(0, MAX_ACTIONS * 2)) {
    if (actions.length >= MAX_ACTIONS) {
      drop(item, "too many actions in one plan");
      continue;
    }
    const type = String(item.type ?? "");
    if (type === "wait") continue;
    if (type === "note") {
      const text = String(item.text ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
      if (text.length >= 3) actions.push({ type: "note", text });
      continue;
    }
    const prop = ctx.cast[Number(item.prop) - 1];
    if (!prop) {
      drop(item, "unknown member");
      continue;
    }
    const at = parseAt(item.at, ctx);
    if (!at) {
      drop(item, "missing or bad time");
      continue;
    }
    const outside = inWindow(at, ctx);
    if (outside) {
      drop(item, outside);
      continue;
    }
    if (type !== "like" && lastAuthor.id === prop.id && Math.abs(at.getTime() - lastAuthor.at) < 30 * 60_000) {
      drop(item, "same member twice in a row");
      continue;
    }

    if (type === "start_post") {
      if (starts >= MAX_START_POSTS || ctx.startsToday + starts >= ctx.postsPerDay + 1) {
        drop(item, "enough new posts for today");
        continue;
      }
      if (calls >= ctx.callsLeft) {
        drop(item, "no model calls left today");
        continue;
      }
      const factIndex = item.fact == null ? -1 : Number(item.fact) - 1;
      const fact = factIndex >= 0 ? ctx.facts[factIndex] : undefined;
      if (item.fact != null && !fact) {
        drop(item, "unknown fact");
        continue;
      }
      if (ctx.watched && !fact) {
        drop(item, "this city needs a real fact for new posts");
        continue;
      }
      if (fact?.source === "weather") {
        if (weatherPlanned) {
          drop(item, "one weather post a day");
          continue;
        }
        weatherPlanned = true;
      }
      const brief = String(item.brief ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
      actions.push({ type: "start_post", propId: prop.id, propName: prop.name, factId: fact?.id ?? null, fact: fact?.claim ?? null, brief, at: at.toISOString() });
      starts += 1;
      calls += 1;
      lastAuthor.id = prop.id;
      lastAuthor.at = at.getTime();
      continue;
    }

    const comment = ctx.comments[Number(item.comment) - 1];
    if (!comment) {
      drop(item, "unknown comment");
      continue;
    }
    if (!comment.isProp) {
      drop(item, "a real member's comment, waiting on the AI badge");
      continue;
    }
    if (comment.author_id === prop.id) {
      drop(item, "their own comment");
      continue;
    }
    if (at.getTime() < new Date(comment.created_at).getTime()) {
      drop(item, "before the comment exists");
      continue;
    }

    if (type === "reply") {
      const key = `${comment.id}:${prop.id}`;
      if (replyKeys.has(key)) {
        drop(item, "already replying there");
        continue;
      }
      if (calls >= ctx.callsLeft) {
        drop(item, "no model calls left today");
        continue;
      }
      replyKeys.add(key);
      const brief = String(item.brief ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
      actions.push({
        type: "reply",
        propId: prop.id,
        propName: prop.name,
        commentId: comment.id,
        comment: String(comment.body ?? "").slice(0, 160),
        brief,
        at: at.toISOString(),
      });
      calls += 1;
      lastAuthor.id = prop.id;
      lastAuthor.at = at.getTime();
      continue;
    }

    if (type === "like") {
      const key = `${comment.id}:${prop.id}`;
      if (likeKeys.has(key)) {
        drop(item, "already liked");
        continue;
      }
      likeKeys.add(key);
      actions.push({ type: "like", propId: prop.id, propName: prop.name, commentId: comment.id, comment: String(comment.body ?? "").slice(0, 160), at: at.toISOString() });
      continue;
    }
    drop(item, "unknown action type");
  }
  return { reasoning, actions, dropped };
}

/** Asks the director for one group's next few hours. Auto mode applies the plan right away. */
export async function planGroup(groupId: string, options: { apply: boolean }): Promise<DirectorPlan> {
  const settings = await loadDirectorSettings();
  if (!settings.ready) throw new Error(DIRECTOR_SCHEMA_HINT);
  const ctx = await gatherContext(groupId, settings.everyHours);
  if (ctx.cast.length < 2) throw new Error("This group needs at least two prop members.");
  const homes = await loadPropHomes(hubListsByProp(new Map([[groupId, ctx.cast.map((member) => member.id)]]), new Map(ctx.locale ? [[groupId, ctx.locale]] : [])));
  const { system, prompt } = buildPrompt(ctx, homes);

  let model = "";
  let parsed: ReturnType<typeof validate>;
  let failure: string | null = null;
  try {
    const reply = await askModel(system, prompt);
    model = reply.model;
    const raw = parseJsonObject(reply.text);
    if (!raw) throw new Error("The director did not answer with JSON");
    parsed = validate(raw, ctx);
  } catch (error) {
    failure = error instanceof Error ? error.message : "Director call failed";
    parsed = { reasoning: "", actions: [], dropped: [] };
  }

  await supabaseAdmin
    .from("prop_director_plans")
    .update({ status: "rejected", error: "Replaced by a newer plan", decided_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .eq("status", "proposed");

  const { data, error } = await supabaseAdmin
    .from("prop_director_plans")
    .insert({
      group_id: groupId,
      hub_id: ctx.hubId || null,
      kind: "group",
      status: failure ? "failed" : "proposed",
      model,
      reasoning: parsed.reasoning,
      actions: parsed.actions,
      dropped: parsed.dropped,
      error: failure,
    })
    .select("id")
    .single();
  if (error) throw new Error(isMissingSchemaError(error) ? DIRECTOR_SCHEMA_HINT : error.message);
  const id = String(data.id);
  if (!failure && options.apply) await applyPlan(id, "auto");
  return (await loadPlan(id)) as DirectorPlan;
}

export async function loadPlan(id: string): Promise<DirectorPlan | null> {
  const { data, error } = await supabaseAdmin.from("prop_director_plans").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(isMissingSchemaError(error) ? DIRECTOR_SCHEMA_HINT : error.message);
  return data ? mapPlan(data as Record<string, unknown>) : null;
}

export function mapPlan(row: Record<string, unknown>): DirectorPlan {
  return {
    id: String(row.id),
    groupId: row.group_id ? String(row.group_id) : null,
    hubId: row.hub_id ? String(row.hub_id) : null,
    kind: row.kind === "new_group" ? "new_group" : "group",
    status: (["proposed", "approved", "rejected", "applied", "failed"].includes(String(row.status)) ? row.status : "proposed") as DirectorPlan["status"],
    model: String(row.model ?? ""),
    reasoning: String(row.reasoning ?? ""),
    actions: Array.isArray(row.actions) ? (row.actions as unknown[]) : [],
    dropped: Array.isArray(row.dropped) ? (row.dropped as DroppedAction[]) : [],
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at),
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    appliedAt: row.applied_at ? String(row.applied_at) : null,
  };
}

export async function rejectPlan(id: string, decidedBy: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("prop_director_plans")
    .update({ status: "rejected", decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["proposed", "failed"]);
  if (error) throw new Error(isMissingSchemaError(error) ? DIRECTOR_SCHEMA_HINT : error.message);
}

export async function applyPlan(id: string, decidedBy: string): Promise<DirectorPlan> {
  const plan = await loadPlan(id);
  if (!plan) throw new Error("plan_not_found");
  if (plan.status !== "proposed" && plan.status !== "approved") throw new Error(`This plan is already ${plan.status}.`);
  await supabaseAdmin
    .from("prop_director_plans")
    .update({ status: "approved", decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq("id", id);
  try {
    const result =
      plan.kind === "group" ? await applyGroupPlan(plan) : await (await import("@/lib/conversations/prop-groups")).applyNewGroupPlan(plan);
    await supabaseAdmin
      .from("prop_director_plans")
      .update({ status: "applied", applied_at: new Date().toISOString(), dropped: [...plan.dropped, ...result.dropped] })
      .eq("id", id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apply failed";
    await supabaseAdmin.from("prop_director_plans").update({ status: "failed", error: message.slice(0, 300) }).eq("id", id);
    throw error;
  }
  return (await loadPlan(id)) as DirectorPlan;
}

async function applyGroupPlan(plan: DirectorPlan): Promise<{ applied: number; dropped: DroppedAction[] }> {
  const groupId = plan.groupId;
  if (!groupId) throw new Error("This plan has no group.");
  const members = (await loadPropMemberIdsByGroup()).get(groupId) ?? [];
  const dropped: DroppedAction[] = [];
  let applied = 0;
  for (const action of plan.actions as DirectorAction[]) {
    if (action.type === "note") {
      const { error } = await supabaseAdmin.from("prop_group_journal").insert({ group_id: groupId, note: action.text });
      if (!error) applied += 1;
      continue;
    }
    if (!members.includes(action.propId)) {
      dropped.push({ action: `${action.type} by ${action.propName}`, reason: "no longer a member" });
      continue;
    }
    let runAt = new Date(action.at).getTime();
    if (runAt < Date.now()) runAt = Date.now() + (2 + Math.random() * 12) * 60_000;
    const row: Record<string, unknown> = {
      group_id: groupId,
      author_id: action.propId,
      kind: action.type,
      run_at: new Date(runAt).toISOString(),
      status: "pending",
      keep_today: action.type === "start_post",
      director_plan_id: plan.id,
    };
    if (action.type === "start_post") {
      row.cast_ids = members;
      row.brief = action.brief || null;
      if (action.factId) row.knowledge_item_id = action.factId;
    } else {
      row.parent_comment_id = action.commentId;
      if (action.type === "reply") row.brief = action.brief || null;
    }
    const { data, error } = await supabaseAdmin.from("prop_engagement_jobs").insert(row).select("id").maybeSingle();
    if (error) {
      dropped.push({
        action: `${action.type} by ${action.propName}`,
        reason: error.code === "23505" ? "already queued" : error.code === "23514" ? "likes need supabase/sql/prop_likes.sql" : error.message,
      });
      continue;
    }
    applied += 1;
    if (action.type !== "like") {
      await recordRunMoment({
        groupId,
        userId: action.propId,
        jobId: data?.id ? String(data.id) : null,
        decision: "jumped_in",
        subject: action.brief,
        pace: "Planned by the director",
      });
    }
  }
  return { applied, dropped };
}

export type DirectorDashboard = {
  settings: DirectorSettings;
  groups: Array<{ groupId: string; title: string; hubTitle: string; planner: "random" | "director"; enabled: boolean; props: number }>;
  plans: Array<DirectorPlan & { groupTitle: string }>;
  journal: Array<{ groupId: string; note: string; createdAt: string }>;
  casting: CastingSettings;
  joins: JoinQueueItem[];
  geminiReady: boolean;
  loadedAt: string;
};

export async function loadDirectorDashboard(): Promise<DirectorDashboard> {
  const settings = await loadDirectorSettings();
  const [{ data: configs, error: configError }, members] = await Promise.all([
    supabaseAdmin.from("prop_conversation_groups").select(settings.ready ? "group_id, enabled, planner" : "group_id, enabled"),
    loadPropMemberIdsByGroup(),
  ]);
  if (configError) throw new Error(configError.message);
  const configRows = (configs ?? []) as unknown as Array<{ group_id: string; enabled: boolean; planner?: string }>;
  const groupIds = configRows.map((row) => String(row.group_id));
  const { data: groupRows } = groupIds.length
    ? await supabaseAdmin.from("discussion_groups").select("id, title, discussion_id").in("id", groupIds)
    : { data: [] };
  const hubIds = [...new Set(((groupRows ?? []) as Array<{ discussion_id: string | null }>).map((row) => String(row.discussion_id ?? "")).filter(Boolean))];
  const { data: hubRows } = hubIds.length ? await supabaseAdmin.from("area_discussions").select("id, title").in("id", hubIds) : { data: [] };
  const hubTitle = new Map(((hubRows ?? []) as Array<{ id: string; title: string | null }>).map((row) => [String(row.id), String(row.title ?? "")]));
  const groupInfo = new Map(
    ((groupRows ?? []) as Array<{ id: string; title: string | null; discussion_id: string | null }>).map((row) => [
      String(row.id),
      { title: String(row.title ?? "Group"), hubTitle: hubTitle.get(String(row.discussion_id ?? "")) ?? "" },
    ]),
  );

  let plans: DirectorDashboard["plans"] = [];
  let journal: DirectorDashboard["journal"] = [];
  if (settings.ready) {
    const [{ data: planRows }, { data: journalRows }] = await Promise.all([
      supabaseAdmin.from("prop_director_plans").select("*").order("created_at", { ascending: false }).limit(40),
      supabaseAdmin.from("prop_group_journal").select("group_id, note, created_at").order("created_at", { ascending: false }).limit(60),
    ]);
    plans = ((planRows ?? []) as Array<Record<string, unknown>>).map((row) => {
      const plan = mapPlan(row);
      return { ...plan, groupTitle: plan.groupId ? groupInfo.get(plan.groupId)?.title ?? "Group" : "New group" };
    });
    journal = ((journalRows ?? []) as Array<{ group_id: string; note: string; created_at: string }>).map((row) => ({
      groupId: String(row.group_id),
      note: row.note,
      createdAt: row.created_at,
    }));
  }

  const [casting, joins] = await Promise.all([loadCastingSettings(), listJoinQueue()]);
  return {
    settings,
    casting,
    joins,
    groups: configRows
      .map((row) => ({
        groupId: String(row.group_id),
        title: groupInfo.get(String(row.group_id))?.title ?? "Group",
        hubTitle: groupInfo.get(String(row.group_id))?.hubTitle ?? "",
        planner: (row.planner === "director" ? "director" : "random") as "random" | "director",
        enabled: Boolean(row.enabled),
        props: (members.get(String(row.group_id)) ?? []).length,
      }))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.title.localeCompare(b.title)),
    plans,
    journal,
    geminiReady: geminiConfigured(),
    loadedAt: new Date().toISOString(),
  };
}

/** Once a day per director group: what got replies and likes, turned into a few lessons for the journal. */
export async function reflectOnGroup(groupId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: posts } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("comment_id, kind, body, knowledge_items(source)")
    .eq("group_id", groupId)
    .eq("status", "done")
    .gte("finished_at", since)
    .not("comment_id", "is", null)
    .limit(80);
  type PostRow = { comment_id: string; kind: string; body: string | null; knowledge_items: { source?: string } | Array<{ source?: string }> | null };
  const rows = (posts ?? []) as unknown as PostRow[];
  if (rows.length === 0) return 0;
  const ids = rows.map((row) => String(row.comment_id));
  const [{ data: stats }, { data: replies }] = await Promise.all([
    supabaseAdmin.from("area_discussion_comments").select("id, likes_count").in("id", ids),
    supabaseAdmin.from("area_discussion_comments").select("parent_id, author_id").in("parent_id", ids),
  ]);
  const likes = new Map(((stats ?? []) as Array<{ id: string; likes_count: number | null }>).map((row) => [String(row.id), Number(row.likes_count ?? 0)]));
  const replyAuthors = await profilesFor(((replies ?? []) as Array<{ author_id: string }>).map((row) => String(row.author_id)));
  const replyCounts = new Map<string, { props: number; members: number }>();
  for (const row of (replies ?? []) as Array<{ parent_id: string; author_id: string }>) {
    const entry = replyCounts.get(String(row.parent_id)) ?? { props: 0, members: 0 };
    if (replyAuthors.get(String(row.author_id))?.isProp) entry.props += 1;
    else entry.members += 1;
    replyCounts.set(String(row.parent_id), entry);
  }
  const lines = rows.map((row) => {
    const joined = Array.isArray(row.knowledge_items) ? row.knowledge_items[0] : row.knowledge_items;
    const counts = replyCounts.get(String(row.comment_id)) ?? { props: 0, members: 0 };
    return `- ${row.kind === "start_post" ? "post" : "reply"}${joined?.source ? ` from ${joined.source}` : ""}: ${likes.get(String(row.comment_id)) ?? 0} likes, ${counts.members} replies from real members, ${counts.props} from props. "${String(row.body ?? "").slice(0, 140)}"`;
  });
  const system = [
    "You review the last day of a neighborhood group chat run by AI prop members and write short lessons for the director who plans it.",
    "Real member replies and likes matter most. Say what drew them in and what fell flat, like topics, times, or who posted.",
    "Write 1 to 3 lessons, each one sentence under 200 characters. No lesson when there is nothing clear to learn.",
    'Answer with JSON only: {"lessons":["..."]}',
  ].join("\n");
  const reply = await askModel(system, lines.join("\n"), GEMINI_LITE_MODEL);
  const raw = parseJsonObject(reply.text);
  const lessons = Array.isArray(raw?.lessons) ? (raw.lessons as unknown[]).map((item) => String(item).trim()).filter((item) => item.length >= 3) : [];
  const notes = lessons.length > 0 ? lessons.slice(0, 3) : ["nothing clear from the last day."];
  const { error } = await supabaseAdmin
    .from("prop_group_journal")
    .insert(notes.map((note) => ({ group_id: groupId, note: `Lesson: ${note}`.slice(0, 400) })));
  if (error) throw new Error(error.message);
  return Math.min(3, lessons.length);
}

export type DirectorRunResult = { planned: number; applied: number; reflected: number; notes: string[] };

/** The cron entry: plans due director groups, then reflects on one group a day each, inside the time limit. */
export async function runDirector(options: { maxMs: number }): Promise<DirectorRunResult> {
  const startedAt = Date.now();
  const result: DirectorRunResult = { planned: 0, applied: 0, reflected: 0, notes: [] };
  const settings = await loadDirectorSettings();
  if (!settings.ready) {
    result.notes.push(DIRECTOR_SCHEMA_HINT);
    return result;
  }
  const conversation = await loadConversationSettings();
  if (settings.mode === "off" || !conversation.enabled) {
    result.notes.push(settings.mode === "off" ? "Director is off." : "Conversations are off.");
    return result;
  }
  const [groupIds, paused] = await Promise.all([loadDirectorGroupIds(), loadPausedGroupIds()]);
  const active = [...groupIds].filter((id) => !paused.has(id));
  if (active.length === 0) return result;

  const { data: latest } = await supabaseAdmin
    .from("prop_director_plans")
    .select("group_id, created_at")
    .in("group_id", active)
    .eq("kind", "group")
    .order("created_at", { ascending: false })
    .limit(active.length * 4);
  const lastPlan = new Map<string, number>();
  for (const row of (latest ?? []) as Array<{ group_id: string; created_at: string }>) {
    if (!lastPlan.has(String(row.group_id))) lastPlan.set(String(row.group_id), new Date(row.created_at).getTime());
  }
  const locales = await loadGroupLocales(active);
  const due = active
    .filter((id) => Date.now() - (lastPlan.get(id) ?? 0) >= settings.everyHours * 3_600_000)
    .filter((id) => {
      const zone = locales.get(id)?.timeZone ?? "America/New_York";
      return withinActiveHours(conversation.activeStartHour, conversation.activeEndHour, hourIn(zone));
    })
    .sort((a, b) => (lastPlan.get(a) ?? 0) - (lastPlan.get(b) ?? 0));

  for (const groupId of due) {
    if (Date.now() - startedAt > options.maxMs) break;
    try {
      const plan = await planGroup(groupId, { apply: settings.mode === "auto" });
      result.planned += 1;
      if (plan.status === "applied") result.applied += 1;
      if (plan.error) result.notes.push(plan.error);
    } catch (error) {
      result.notes.push(error instanceof Error ? error.message : "Planning failed");
    }
  }

  const { data: reflections } = await supabaseAdmin
    .from("prop_group_journal")
    .select("group_id, created_at")
    .in("group_id", active)
    .like("note", "Lesson:%")
    .order("created_at", { ascending: false })
    .limit(active.length * 3);
  const lastReflection = new Map<string, number>();
  for (const row of (reflections ?? []) as Array<{ group_id: string; created_at: string }>) {
    if (!lastReflection.has(String(row.group_id))) lastReflection.set(String(row.group_id), new Date(row.created_at).getTime());
  }
  for (const groupId of active) {
    if (Date.now() - startedAt > options.maxMs) break;
    if (Date.now() - (lastReflection.get(groupId) ?? 0) < REFLECT_EVERY_MS) continue;
    if (!(lastPlan.has(groupId) || due.includes(groupId))) continue;
    try {
      result.reflected += await reflectOnGroup(groupId);
    } catch (error) {
      result.notes.push(error instanceof Error ? `Reflection: ${error.message}` : "Reflection failed");
    }
    break;
  }
  return result;
}


