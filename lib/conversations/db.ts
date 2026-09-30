import { ensureGroupHubWatch } from "@/lib/knowledge/auto-watch";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_EDGE, loadRunEdges } from "@/lib/conversations/edge";
import { memoriesForLine } from "@/lib/conversations/memory";
import { deleteGroupContent } from "@/lib/groups/db";
import { isPropAccountEmail, PROP_ACCOUNT_EMAIL_PATTERN, SYSTEM_GROUP_OWNER_EMAIL } from "@/lib/prop-accounts";
import { loadAccountVoice, loadAccountVoices, saveAccountVoice, writeAccountVoices } from "@/lib/prop-voice-store";
import { EMPTY_PROP_VOICE, accountPace, lineVoice, voiceIsSet, type PropVoice } from "@/lib/prop-voice";
import { loadRunMomentsSince, type RunMomentRow } from "@/lib/conversations/moments";
import { loadExcludedByHub, loadRegionObjectives, loadRunPause } from "@/lib/conversations/region-runs";
import { GROQ_MODEL, GroqCallError, personalityOrDefault, topicOrDefault, writeConversationLine } from "@/lib/conversations/groq";
import { DEFAULT_GRAMMAR, parseAbbrev, parseGrammar, parseRunRules, parseSwearRate, serializeRunRules, type SwearRate } from "@/lib/conversations/rules";
import {
  DEFAULT_CALLS_PER_DAY,
  DEFAULT_WEEK_END,
  DEFAULT_WEEK_EVERY,
  DEFAULT_WEEK_START,
  describeWeek,
  parseCallsPerDay,
  parseEveryMinutes,
  parseWeekDays,
  parseWeekHour,
  postsInWindow,
} from "@/lib/conversations/week";
import { DEFAULT_ZONE, startOfNyDay } from "@/lib/conversations/time";
import { loadGroupLocales, loadHubLocales, type HubLocale } from "@/lib/conversations/hub-locale";
import { loadPropHomes, visitorFrom, type PropHome } from "@/lib/conversations/prop-home";
import type {
  ConversationActiveRun,
  ConversationDashboard,
  ConversationFolder,
  ConversationGroup,
  ConversationLogEntry,
  ConversationPersona,
  ConversationQueueItem,
  RegionRun,
  RegionRunAccount,
  ConversationRunLine,
  ConversationSettings,
  ConversationUsage,
} from "@/lib/conversations/types";

type PropProfile = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function listPropProfiles(): Promise<PropProfile[]> {
  const rows: PropProfile[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, email, avatar_url, bio")
      .ilike("email", PROP_ACCOUNT_EMAIL_PATTERN)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as PropProfile[]));
    if (!data || data.length < 1000) break;
  }
  return rows.filter(
    (row) => isPropAccountEmail(row.email) && row.email?.toLowerCase() !== SYSTEM_GROUP_OWNER_EMAIL,
  );
}

async function membershipsFor(userIds: string[]): Promise<Array<{ group_id: string; user_id: string }>> {
  const rows: Array<{ group_id: string; user_id: string }> = [];
  for (const ids of chunks(userIds, 80)) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from("discussion_group_members")
        .select("group_id, user_id")
        .in("user_id", ids)
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as Array<{ group_id: string; user_id: string }>));
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
}

async function listOpenGroups(): Promise<
  Array<{ id: string; title: string | null; description: string | null; category: string | null; discussion_id: string | null }>
> {
  const rows: Array<{ id: string; title: string | null; description: string | null; category: string | null; discussion_id: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("discussion_groups")
      .select("id, title, description, category, discussion_id")
      .is("archived_at", null)
      .order("title", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Array<{ id: string; title: string | null; description: string | null; category: string | null; discussion_id: string | null }>));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function loadConversationSettings(): Promise<ConversationSettings> {
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_settings")
    .select("enabled, daily_call_budget, active_start_hour, active_end_hour")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conversation settings are missing. Apply supabase/sql/prop_conversations.sql.");
  return {
    enabled: Boolean(data.enabled),
    dailyCallBudget: Number(data.daily_call_budget ?? 0),
    activeStartHour: Number(data.active_start_hour ?? 8),
    activeEndHour: Number(data.active_end_hour ?? 22),
  };
}

export async function loadConversationUsage(since = startOfNyDay()): Promise<ConversationUsage> {
  const usage: ConversationUsage = { calls: 0, promptTokens: 0, completionTokens: 0 };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("prop_groq_calls")
      .select("prompt_tokens, completion_tokens")
      .gte("created_at", since)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      usage.calls += 1;
      usage.promptTokens += Number(row.prompt_tokens ?? 0);
      usage.completionTokens += Number(row.completion_tokens ?? 0);
    }
    if (!data || data.length < 1000) break;
  }
  return usage;
}

export async function loadConversationDashboard(): Promise<ConversationDashboard> {
  const since = startOfNyDay();
  const [settings, usage, props, openGroups, configResult, personaResult, folderResult, folderMemberResult, logResult, queueResult, openJobResult, todayJobResult, finishedJobResult, edges] =
    await Promise.all([
    loadConversationSettings(),
    loadConversationUsage(since),
    listPropProfiles(),
    listOpenGroups(),
    supabaseAdmin.from("prop_conversation_groups").select("group_id, enabled, topic, posts_per_day, replies_per_post, auto_continue, rules, swear, swear_rate, grammar, abbrev, week_days, week_start_hour, week_end_hour, week_every_minutes, calls_per_day"),
    loadAccountVoices(),
    supabaseAdmin.from("admin_prop_folders").select("id,name,parent_id").order("name", { ascending: true }).limit(1000),
    supabaseAdmin.from("admin_prop_folder_members").select("folder_id,user_id").limit(5000),
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id, group_id, author_id, comment_id, kind, body, error, status, finished_at")
      .neq("kind", "like")
      .gte("created_at", since)
      .in("status", ["done", "failed"])
      .order("finished_at", { ascending: false })
      .limit(40),
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id, group_id, author_id, kind, run_at")
      .neq("kind", "like")
      .eq("status", "pending")
      .order("run_at", { ascending: true })
      .limit(50),
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id, group_id, author_id, kind, status, run_at, body, error, cast_ids, spread_minutes, created_at")
      .neq("kind", "like")
      .in("status", ["pending", "running"])
      .order("run_at", { ascending: true })
      .limit(120),
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id, group_id, author_id, kind, status, run_at, body, error, cast_ids, spread_minutes, created_at")
      .neq("kind", "like")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id, group_id, author_id, kind, status, run_at, body, error, cast_ids, spread_minutes, created_at")
      .neq("kind", "like")
      .gte("finished_at", since)
      .in("status", ["done", "failed", "skipped"])
      .order("finished_at", { ascending: false })
      .limit(200),
    loadRunEdges(),
  ]);

  if (configResult.error) throw new Error(configResult.error.message);
  if (folderResult.error && !isMissingSchemaError(folderResult.error)) throw new Error(folderResult.error.message);
  if (folderMemberResult.error && !isMissingSchemaError(folderMemberResult.error)) {
    throw new Error(folderMemberResult.error.message);
  }
  if (logResult.error) throw new Error(logResult.error.message);
  if (queueResult.error) throw new Error(queueResult.error.message);
  if (openJobResult.error) throw new Error(openJobResult.error.message);
  if (todayJobResult.error) throw new Error(todayJobResult.error.message);
  if (finishedJobResult.error) throw new Error(finishedJobResult.error.message);

  const memberships = await membershipsFor(props.map((profile) => profile.id));
  const membersByGroup = new Map<string, number>();
  const memberIdsByGroup = new Map<string, string[]>();
  for (const row of memberships) {
    const id = String(row.group_id);
    const userId = String(row.user_id);
    membersByGroup.set(id, (membersByGroup.get(id) ?? 0) + 1);
    const ids = memberIdsByGroup.get(id) ?? [];
    ids.push(userId);
    memberIdsByGroup.set(id, ids);
  }

  const hubIds = [...new Set(openGroups.map((row) => String(row.discussion_id ?? "")).filter(Boolean))];
  const hubs = new Map<string, string>();
  for (const ids of chunks(hubIds, 80)) {
    const { data, error } = await supabaseAdmin.from("area_discussions").select("id, title").in("id", ids);
    if (error) throw new Error(error.message);
    for (const hub of data ?? []) hubs.set(String(hub.id), String(hub.title ?? ""));
  }

  const configByGroup = new Map<
    string,
    {
      enabled: boolean;
      topic: string;
      postsPerDay: number;
      repliesPerPost: number;
      autoContinue: boolean;
      rules: string[];
      swear: boolean;
      swearRate: SwearRate;
      grammar: number;
      abbrev: number;
      weekDays: number;
      weekStartHour: number;
      weekEndHour: number;
      weekEveryMinutes: number;
      callsPerDay: number;
    }
  >(
    ((configResult.data ?? []) as Array<{
      group_id: string;
      enabled: boolean | null;
      topic: string | null;
      posts_per_day: number | null;
      replies_per_post: number | null;
      auto_continue: boolean | null;
      rules: string | null;
      swear: boolean | null;
      swear_rate: string | null;
      grammar: number | null;
      abbrev: number | null;
      week_days: number | null;
      week_start_hour: number | null;
      week_end_hour: number | null;
      week_every_minutes: number | null;
      calls_per_day: number | null;
    }>).map((row) => [
      String(row.group_id),
      {
        enabled: Boolean(row.enabled),
        topic: String(row.topic ?? ""),
        postsPerDay: Number(row.posts_per_day ?? 2),
        repliesPerPost: Number(row.replies_per_post ?? 2),
        autoContinue: row.auto_continue !== false,
        rules: parseRunRules(row.rules),
        swear: Boolean(row.swear),
        swearRate: parseSwearRate(row.swear_rate),
        grammar: parseGrammar(row.grammar),
        abbrev: parseAbbrev(row.abbrev),
        weekDays: parseWeekDays(row.week_days),
        weekStartHour: parseWeekHour(row.week_start_hour, DEFAULT_WEEK_START, 0, 23),
        weekEndHour: parseWeekHour(row.week_end_hour, DEFAULT_WEEK_END, 1, 24),
        weekEveryMinutes: parseEveryMinutes(row.week_every_minutes),
        callsPerDay: parseCallsPerDay(row.calls_per_day),
      },
    ]),
  );

  const profileName = (profile: PropProfile) => profile.full_name?.trim() || profile.username?.trim() || "Prop account";
  const nameByUser = new Map(props.map((profile) => [profile.id, profileName(profile)]));
  const profileById = new Map(props.map((profile) => [profile.id, profile]));

  const groups: ConversationGroup[] = openGroups.map((row) => {
    const id = String(row.id);
    const config = configByGroup.get(id);
    const enabled = config?.enabled ?? false;
    const members = (memberIdsByGroup.get(id) ?? [])
      .map((userId) => {
        const profile = profileById.get(userId);
        return {
          userId,
          name: profile ? profileName(profile) : "Prop account",
          username: profile?.username ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      id,
      title: String(row.title ?? "Untitled group"),
      description: row.description?.trim() ? row.description.trim() : null,
      category: row.category?.trim() ? row.category.trim() : null,
      hubId: String(row.discussion_id ?? ""),
      hubTitle: hubs.get(String(row.discussion_id ?? "")) ?? null,
      propMemberCount: membersByGroup.get(id) ?? 0,
      enabled,
      autoContinue: config?.autoContinue ?? true,
      topic: config?.topic ?? "",
      rules: config?.rules ?? parseRunRules(null),
      swear: config?.swear ?? false,
      swearRate: config?.swearRate ?? "sometimes",
      edge: edges.get(id) ?? DEFAULT_EDGE,
      grammar: config?.grammar ?? DEFAULT_GRAMMAR,
      abbrev: config?.abbrev ?? 0,
      weekDays: config?.weekDays ?? 0,
      weekStartHour: config?.weekStartHour ?? DEFAULT_WEEK_START,
      weekEndHour: config?.weekEndHour ?? DEFAULT_WEEK_END,
      weekEveryMinutes: config?.weekEveryMinutes ?? DEFAULT_WEEK_EVERY,
      callsPerDay: config?.callsPerDay ?? DEFAULT_CALLS_PER_DAY,
      postsPerDay: config?.postsPerDay ?? 2,
      repliesPerPost: config?.repliesPerPost ?? 2,
      members,
    };
  });

  const folderByUser = new Map<string, string>();
  if (!folderMemberResult.error) {
    for (const row of (folderMemberResult.data ?? []) as Array<{ folder_id: string; user_id: string }>) {
      folderByUser.set(String(row.user_id), String(row.folder_id));
    }
  }
  const folders: ConversationFolder[] = folderResult.error
    ? []
    : ((folderResult.data ?? []) as Array<{ id: string; name: string; parent_id: string | null }>).map((row) => ({
        id: String(row.id),
        name: row.name,
        parentId: row.parent_id ? String(row.parent_id) : null,
      }));

  const personas: ConversationPersona[] = props
    .map((profile) => {
      const voice = personaResult.get(profile.id) ?? EMPTY_PROP_VOICE;
      return {
      userId: profile.id,
      name: profileName(profile),
      username: profile.username,
      personality: voice.personality,
      swear: voice.swear,
      swearRate: voice.swearRate,
      grammar: voice.grammar,
      abbrev: voice.abbrev,
      behavior: voice.behavior,
      traits: voice.traits,
      folderId: folderByUser.get(profile.id) ?? null,
      avatarUrl: profile.avatar_url?.trim() ? profile.avatar_url : null,
      bio: profile.bio ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const titleByGroup = new Map(groups.map((group) => [group.id, group.title]));
  const log: ConversationLogEntry[] = (
    (logResult.data ?? []) as Array<{
      id: string;
      group_id: string;
      author_id: string;
      comment_id: string | null;
      kind: string;
      body: string | null;
      error: string | null;
      status: string;
      finished_at: string | null;
    }>
  ).map((row) => ({
    id: String(row.id),
    groupId: String(row.group_id),
    commentId: row.comment_id ? String(row.comment_id) : null,
    groupTitle: titleByGroup.get(String(row.group_id)) ?? "Group",
    authorName: nameByUser.get(String(row.author_id)) ?? "Prop account",
    kind: row.kind === "reply" ? "reply" : "start_post",
    status: row.status === "failed" ? "failed" : "done",
    body: String(row.body ?? ""),
    error: row.error ? String(row.error) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  }));
  const queue: ConversationQueueItem[] = (
    (queueResult.data ?? []) as Array<{
      id: string;
      group_id: string;
      author_id: string;
      kind: string;
      run_at: string;
    }>
  ).map((row) => ({
    id: String(row.id),
    groupTitle: titleByGroup.get(String(row.group_id)) ?? "Group",
    authorName: nameByUser.get(String(row.author_id)) ?? "Prop account",
    kind: row.kind === "reply" ? "reply" : "start_post",
    runAt: String(row.run_at),
  }));

  const moments = await loadRunMomentsSince(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  const hubsByProp = new Map<string, string[]>();
  for (const group of groups) {
    if (!group.hubId) continue;
    for (const member of group.members) hubsByProp.set(member.userId, [...(hubsByProp.get(member.userId) ?? []), group.hubId]);
  }
  const [objectives, excludedByHub, pausedByHub, hubLocales, homes] = await Promise.all([
    loadRegionObjectives(),
    loadExcludedByHub(),
    loadRunPause(),
    loadHubLocales(groups.map((group) => group.hubId)),
    loadPropHomes(hubsByProp),
  ]);
  const activeRuns = buildActiveRuns(
    openJobResult.data ?? [],
    [...(todayJobResult.data ?? []), ...(finishedJobResult.data ?? [])],
    groups,
    nameByUser,
    moments,
    personaResult,
  );
  const regionRuns = buildRegionRuns(groups, activeRuns, objectives, excludedByHub, pausedByHub, personaResult, hubLocales, homes);

  return {
    settings,
    usage,
    topics: groups
      .filter((group) => group.enabled)
      .map((group) => ({ groupId: group.id, title: group.title, topic: group.topic })),
    groups,
    folders,
    personas,
    queue,
    log,
    activeRuns,
    regionRuns,
  };
}

type RunJobRow = {
  id: string;
  group_id: string;
  author_id: string;
  kind: string;
  status: string;
  run_at: string;
  body: string | null;
  error: string | null;
  cast_ids: string[] | null;
  spread_minutes: number | null;
  created_at: string;
};

function paceLabel(spread: number | null): string {
  if (spread != null && spread >= 1000) {
    const min = Math.floor(spread / 1000);
    const max = spread % 1000;
    if (min >= 1 && max >= min) return `Every ${min}–${max} minutes`;
  }
  if (spread != null && spread > 0) return `Over ${spread} minutes`;
  return "Right now";
}

function runStatus(status: string): ConversationRunLine["status"] {
  if (status === "running" || status === "done" || status === "failed" || status === "skipped") return status;
  return "pending";
}

function buildActiveRuns(
  openJobs: RunJobRow[],
  recentJobs: RunJobRow[],
  groups: ConversationGroup[],
  nameByUser: Map<string, string>,
  moments: RunMomentRow[],
  voices: Map<string, PropVoice>,
): ConversationActiveRun[] {
  const merged = new Map<string, RunJobRow>();
  for (const job of [...recentJobs, ...openJobs]) merged.set(String(job.id), job);
  const byGroup = new Map<string, RunJobRow[]>();
  for (const job of merged.values()) {
    const groupId = String(job.group_id);
    const list = byGroup.get(groupId) ?? [];
    list.push(job);
    byGroup.set(groupId, list);
  }
  const latestMoment = new Map<string, RunMomentRow>();
  for (const moment of moments) {
    const key = `${moment.group_id}:${moment.user_id}`;
    if (!latestMoment.has(key)) latestMoment.set(key, moment);
  }
  const runs: ConversationActiveRun[] = [];
  for (const group of groups) {
    if (group.members.length === 0) continue;
    const groupId = group.id;
    const jobs = byGroup.get(groupId) ?? [];
    const posts = [...jobs]
      .filter((job) => job.kind === "start_post")
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const castSource = posts.find((job) => Array.isArray(job.cast_ids) && job.cast_ids.length > 0) ?? posts[0];
    const paceSource = posts.find((job) => (job.spread_minutes ?? 0) > 0) ?? posts[0];
    const cast = Array.isArray(castSource?.cast_ids) ? castSource.cast_ids.map((id) => String(id)).filter(Boolean) : [];
    const accountIds = cast.length > 0 ? cast : (group?.members ?? []).map((member) => member.userId);
    const accountNames = accountIds.map(
      (userId) => nameByUser.get(userId) ?? group?.members.find((member) => member.userId === userId)?.name ?? "Prop account",
    );
    const lines: ConversationRunLine[] = [...jobs]
      .sort((a, b) => String(a.run_at).localeCompare(String(b.run_at)))
      .map((job) => ({
        id: String(job.id),
        authorId: String(job.author_id),
        authorName: nameByUser.get(String(job.author_id)) ?? "Prop account",
        groupTitle: group?.title ?? "Group",
        kind: job.kind === "reply" ? "reply" : "start_post",
        status: runStatus(String(job.status)),
        runAt: String(job.run_at),
        body: String(job.body ?? ""),
        error: job.error ? String(job.error) : null,
      }));
    const waiting = lines.filter((line) => line.status === "pending");
    const live = lines.some((line) => line.status === "pending" || line.status === "running" || line.status === "done");
    const accounts = (group.members.length > 0 ? group.members : accountIds.map((userId) => ({ userId, name: nameByUser.get(userId) ?? "Prop account", username: null }))).map(
      (member) => {
        const moment = latestMoment.get(`${groupId}:${member.userId}`) ?? null;
        const spoke = lines
          .filter((line) => line.authorId === member.userId && line.status === "done")
          .map((line) => line.runAt)
          .sort()
          .at(-1);
        return {
          userId: member.userId,
          name: member.name,
          pace: moment?.pace || accountPace(voices.get(member.userId)),
          lastSpokeAt: spoke ?? null,
          moment: moment
            ? { at: moment.at, decision: moment.decision, subject: moment.subject, pace: moment.pace }
            : null,
        };
      },
    );
    runs.push({
      groupId,
      groupTitle: group?.title ?? "Group",
      topic: group?.topic?.trim() || "Whatever the group is about",
      accountIds,
      accountNames,
      posts: lines.filter((line) => line.kind === "start_post").length,
      repliesPerPost: group?.repliesPerPost ?? 0,
      repliesQueued: lines.filter((line) => line.kind === "reply").length,
      pace: group && group.weekDays > 0
        ? describeWeek(group.weekDays, group.weekStartHour, group.weekEndHour, group.weekEveryMinutes, group.callsPerDay)
        : paceLabel(paceSource?.spread_minutes ?? null),
      autoContinue: Boolean(group?.enabled && group.autoContinue),
      postsPerDay: group?.postsPerDay ?? 0,
      rules: group?.rules ?? parseRunRules(null),
      swear: group?.swear ?? false,
      swearRate: group?.swearRate ?? "sometimes",
      edge: group?.edge ?? DEFAULT_EDGE,
      grammar: group?.grammar ?? DEFAULT_GRAMMAR,
      abbrev: group?.abbrev ?? 0,
      weekDays: group?.weekDays ?? 0,
      weekStartHour: group?.weekStartHour ?? DEFAULT_WEEK_START,
      weekEndHour: group?.weekEndHour ?? DEFAULT_WEEK_END,
      weekEveryMinutes: group?.weekEveryMinutes ?? DEFAULT_WEEK_EVERY,
      callsPerDay: group?.callsPerDay ?? DEFAULT_CALLS_PER_DAY,
      sent: lines.filter((line) => line.status === "done").length,
      waiting: waiting.length,
      running: lines.filter((line) => line.status === "running").length,
      failed: lines.filter((line) => line.status === "failed").length,
      total: lines.length,
      nextAt: waiting.map((line) => line.runAt).sort()[0] ?? null,
      lines,
      interacting: Boolean(group.enabled && live),
      accounts,
    });
  }
  return runs.sort((a, b) => Number(b.interacting) - Number(a.interacting) || a.groupTitle.localeCompare(b.groupTitle));
}

function emptySnapshot(group: ConversationGroup): ConversationActiveRun {
  return {
    groupId: group.id,
    groupTitle: group.title,
    topic: group.topic.trim() || "Whatever the group is about",
    accountIds: group.members.map((member) => member.userId),
    accountNames: group.members.map((member) => member.name),
    posts: 0,
    repliesPerPost: group.repliesPerPost,
    repliesQueued: 0,
    pace: group.weekDays > 0
      ? describeWeek(group.weekDays, group.weekStartHour, group.weekEndHour, group.weekEveryMinutes, group.callsPerDay)
      : "Right now",
    autoContinue: group.enabled && group.autoContinue,
    postsPerDay: group.postsPerDay,
    rules: group.rules,
    swear: group.swear,
    swearRate: group.swearRate,
    edge: group.edge,
    grammar: group.grammar,
    abbrev: group.abbrev,
    weekDays: group.weekDays,
    weekStartHour: group.weekStartHour,
    weekEndHour: group.weekEndHour,
    weekEveryMinutes: group.weekEveryMinutes,
    callsPerDay: group.callsPerDay,
    sent: 0,
    waiting: 0,
    running: 0,
    failed: 0,
    total: 0,
    nextAt: null,
    lines: [],
    interacting: false,
    accounts: [],
  };
}

function mergeSnapshots(runs: ConversationActiveRun[], fallback: ConversationGroup): ConversationActiveRun {
  const base = runs[0] ?? emptySnapshot(fallback);
  if (runs.length <= 1) return base;
  const lines = runs.flatMap((run) => run.lines).sort((a, b) => a.runAt.localeCompare(b.runAt));
  const waiting = lines.filter((line) => line.status === "pending");
  return {
    ...base,
    posts: lines.filter((line) => line.kind === "start_post").length,
    repliesQueued: lines.filter((line) => line.kind === "reply").length,
    sent: lines.filter((line) => line.status === "done").length,
    waiting: waiting.length,
    running: lines.filter((line) => line.status === "running").length,
    failed: lines.filter((line) => line.status === "failed").length,
    total: lines.length,
    nextAt: waiting.map((line) => line.runAt).sort()[0] ?? null,
    lines,
    interacting: runs.some((run) => run.interacting),
    accounts: runs.flatMap((run) => run.accounts),
  };
}

function homeOf(home: PropHome | undefined): RegionRunAccount["home"] {
  return home
    ? { hubId: home.hubId, place: home.place, languages: home.languages, source: home.source, languagesSet: home.languagesSet }
    : null;
}

function buildRegionRuns(
  groups: ConversationGroup[],
  runs: ConversationActiveRun[],
  objectives: Map<string, string>,
  excludedByHub: Map<string, Set<string>>,
  pausedByHub: Map<string, boolean>,
  voices: Map<string, PropVoice>,
  hubLocales: Map<string, HubLocale>,
  homes: Map<string, PropHome>,
): RegionRun[] {
  const runByGroup = new Map(runs.map((run) => [run.groupId, run]));
  const byHub = new Map<string, ConversationGroup[]>();
  for (const group of groups) {
    const list = byHub.get(group.hubId) ?? [];
    list.push(group);
    byHub.set(group.hubId, list);
  }
  const regions: RegionRun[] = [];
  for (const [hubId, hubGroups] of byHub) {
    if (!hubGroups.some((group) => group.propMemberCount > 0)) continue;
    const excluded = excludedByHub.get(hubId) ?? new Set<string>();
    const included = hubGroups.filter((group) => group.enabled);
    const includedRuns = included.map((group) => runByGroup.get(group.id)).filter((run): run is ConversationActiveRun => Boolean(run));
    const lead = included[0] ?? hubGroups[0];
    if (!lead) continue;
    const accounts = new Map<string, RegionRunAccount>();
    for (const group of hubGroups) {
      const run = runByGroup.get(group.id);
      for (const member of group.members) {
        const current = accounts.get(member.userId);
        const fromRun = run?.accounts.find((account) => account.userId === member.userId);
        const moment = fromRun?.moment ?? null;
        const newer = moment && (!current?.moment || moment.at > current.moment.at);
        accounts.set(member.userId, {
          userId: member.userId,
          name: member.name,
          pace: fromRun?.pace || current?.pace || accountPace(voices.get(member.userId)),
          lastSpokeAt: [current?.lastSpokeAt, fromRun?.lastSpokeAt].filter(Boolean).sort().at(-1) ?? null,
          moment: newer || !current?.moment ? moment ?? current?.moment ?? null : current.moment,
          included: !excluded.has(member.userId),
          groupTitles: [...(current?.groupTitles ?? []), group.title],
          home: homeOf(homes.get(member.userId)),
          visitorFrom: visitorFrom(homes.get(member.userId), hubLocales.get(hubId)),
        });
      }
    }
    const snapshot = mergeSnapshots(includedRuns, lead);
    const locale = hubLocales.get(hubId);
    regions.push({
      hubId,
      title: hubId ? lead.hubTitle?.trim() || "Region" : "No region",
      objective: objectives.get(hubId) ?? "",
      timeZone: locale?.timeZone ?? DEFAULT_ZONE,
      language: locale?.language ?? "English",
      place: locale?.place ?? "",
      localeSource: locale?.source ?? "default",
      paused: Boolean(pausedByHub.get(hubId)),
      interacting: includedRuns.some((run) => run.interacting),
      groups: hubGroups
        .map((group) => ({
          groupId: group.id,
          title: group.title,
          included: group.enabled,
          interacting: Boolean(runByGroup.get(group.id)?.interacting),
          propMemberCount: group.propMemberCount,
        }))
        .sort((a, b) => Number(b.included) - Number(a.included) || a.title.localeCompare(b.title)),
      accounts: [...accounts.values()].sort((a, b) => Number(b.included) - Number(a.included) || a.name.localeCompare(b.name)),
      snapshot,
    });
  }
  return regions.sort((a, b) => Number(b.interacting) - Number(a.interacting) || a.title.localeCompare(b.title));
}

export async function saveConversationSettings(patch: Partial<ConversationSettings>): Promise<void> {
  const current = await loadConversationSettings();
  const next = {
    enabled: patch.enabled ?? current.enabled,
    daily_call_budget: clampInt(patch.dailyCallBudget ?? current.dailyCallBudget, 0, 1000),
    active_start_hour: clampInt(patch.activeStartHour ?? current.activeStartHour, 0, 23),
    active_end_hour: clampInt(patch.activeEndHour ?? current.activeEndHour, 1, 24),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("prop_conversation_settings").update(next).eq("id", 1);
  if (error) throw new Error(error.message);
}

export async function loadPropMemberIdsByGroup(): Promise<Map<string, string[]>> {
  const props = await listPropProfiles();
  const memberships = await membershipsFor(props.map((profile) => profile.id));
  const map = new Map<string, string[]>();
  for (const row of memberships) {
    const groupId = String(row.group_id);
    const list = map.get(groupId) ?? [];
    list.push(String(row.user_id));
    map.set(groupId, list);
  }
  return map;
}

export async function countPropMembers(groupId: string): Promise<number> {
  const props = await listPropProfiles();
  if (props.length === 0) return 0;
  const ids = new Set(props.map((profile) => profile.id));
  const memberships = await membershipsFor([...ids]);
  return memberships.filter((row) => String(row.group_id) === groupId && ids.has(String(row.user_id))).length;
}

export async function setRegionGroups(hubId: string, groupIds: string[]): Promise<void> {
  const wanted = new Set(groupIds);
  const { data, error } = await supabaseAdmin.from("discussion_groups").select("id").eq("discussion_id", hubId);
  if (error) throw new Error(error.message);
  const inHub = ((data ?? []) as Array<{ id: string }>).map((row) => String(row.id));
  if ([...wanted].some((id) => !inHub.includes(id))) throw new Error("Choose groups in the same region.");
  for (const id of inHub) await setGroupIncluded(id, wanted.has(id));
}

export async function setGroupIncluded(groupId: string, included: boolean): Promise<void> {
  if (!included) {
    const { error } = await supabaseAdmin
      .from("prop_conversation_groups")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("group_id", groupId);
    if (error) throw new Error(error.message);
    return;
  }
  const propMembers = await countPropMembers(groupId);
  if (propMembers < 2) throw new Error("A group needs at least two prop accounts before it can join the run.");
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("prop_conversation_groups")
    .select("topic, posts_per_day, replies_per_post")
    .eq("group_id", groupId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const { error } = await supabaseAdmin.from("prop_conversation_groups").upsert(
    {
      group_id: groupId,
      enabled: true,
      topic: String(existing?.topic ?? "").slice(0, 280),
      posts_per_day: clampInt(Number(existing?.posts_per_day ?? 2), 0, 20),
      replies_per_post: clampInt(Number(existing?.replies_per_post ?? 2), 0, 6),
      auto_continue: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "group_id" },
  );
  if (error) throw new Error(error.message);
  await ensureGroupHubWatch(groupId);
}

export async function saveConversationGroup(input: {
  groupId: string;
  enabled: boolean;
  topic: string;
  postsPerDay: number;
  repliesPerPost: number;
}): Promise<void> {
  const { data: group, error: groupError } = await supabaseAdmin
    .from("discussion_groups")
    .select("id")
    .eq("id", input.groupId)
    .maybeSingle();
  if (groupError) throw new Error(groupError.message);
  if (!group) throw new Error("Group not found");

  if (input.enabled) {
    const propMembers = await countPropMembers(input.groupId);
    if (propMembers < 2) throw new Error("Choose a group with at least two prop accounts.");
  }

  const { error } = await supabaseAdmin.from("prop_conversation_groups").upsert(
    {
      group_id: input.groupId,
      enabled: input.enabled,
      topic: input.topic.trim().slice(0, 280),
      posts_per_day: clampInt(input.postsPerDay, 0, 20),
      replies_per_post: clampInt(input.repliesPerPost, 0, 6),
      auto_continue: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "group_id" },
  );
  if (error) throw new Error(error.message);
  if (input.enabled) await ensureGroupHubWatch(input.groupId);
}

export async function savePersona(userId: string, voice: PropVoice): Promise<void> {
  await saveAccountVoice(userId, voice);
}

export async function pauseAllConversationGroups(): Promise<void> {
  const { error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("enabled", true);
  if (error) throw new Error(error.message);
}

export async function saveWeekSchedule(
  groupId: string,
  input: {
    days: number;
    startHour: number;
    endHour: number;
    everyMinutes: number;
    callsPerDay: number;
  },
): Promise<void> {
  const days = parseWeekDays(input.days);
  const startHour = parseWeekHour(input.startHour, DEFAULT_WEEK_START, 0, 23);
  const endHour = parseWeekHour(input.endHour, DEFAULT_WEEK_END, 1, 24);
  if (days > 0 && endHour <= startHour) throw new Error("The end time has to be later than the start.");
  if (days > 0) {
    const { data: current, error: currentError } = await supabaseAdmin
      .from("prop_conversation_groups")
      .select("replies_per_post")
      .eq("group_id", groupId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    const replies = Number(current?.replies_per_post ?? 0);
    if (postsInWindow(startHour, endHour, parseEveryMinutes(input.everyMinutes), parseCallsPerDay(input.callsPerDay), replies) < 1) {
      throw new Error("Allow enough calls a day for each post and its replies.");
    }
  }
  const patch: Record<string, unknown> = {
    week_days: days,
    week_start_hour: startHour,
    week_end_hour: endHour,
    week_every_minutes: parseEveryMinutes(input.everyMinutes),
    calls_per_day: parseCallsPerDay(input.callsPerDay),
    updated_at: new Date().toISOString(),
  };
  if (days > 0) {
    patch.enabled = true;
    patch.auto_continue = true;
  }
  const { data, error } = await supabaseAdmin.from("prop_conversation_groups").update(patch).eq("group_id", groupId).select("group_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("That group has no conversation settings yet. Start a run first.");
}

export async function clearFutureStartPosts(groupId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .delete()
    .eq("group_id", groupId)
    .eq("kind", "start_post")
    .eq("status", "pending")
    .gt("run_at", new Date(Date.now() + 2 * 60_000).toISOString());
  if (error) throw new Error(error.message);
}

export async function saveRunAbbrev(groupId: string, abbrev: number): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .update({ abbrev: parseAbbrev(abbrev), updated_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .select("group_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("That group has no conversation settings yet. Start a run first.");
}

export async function saveRunGrammar(groupId: string, grammar: number): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .update({ grammar: parseGrammar(grammar), updated_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .select("group_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("That group has no conversation settings yet. Start a run first.");
}

export async function saveRunSwear(groupId: string, swear: boolean, swearRate: SwearRate): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .update({ swear, swear_rate: parseSwearRate(swearRate), updated_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .select("group_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("That group has no conversation settings yet. Start a run first.");
}

export async function saveRunRules(groupId: string, rules: string[]): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .update({ rules: serializeRunRules(rules), updated_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .select("group_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("That group has no conversation settings yet. Start a run first.");
}

export async function setConversationAutoContinue(
  groupId: string,
  autoContinue: boolean,
  postsPerDay: number,
): Promise<void> {
  const patch: Record<string, unknown> = {
    auto_continue: autoContinue,
    updated_at: new Date().toISOString(),
  };
  if (autoContinue) {
    patch.enabled = true;
    patch.posts_per_day = clampInt(postsPerDay, 1, 20);
  }
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .update(patch)
    .eq("group_id", groupId)
    .select("group_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("That group has no conversation settings yet. Start a run first.");
}

export async function retryFailedConversationJobs(): Promise<void> {
  const { error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .update({ status: "pending", error: null, run_at: new Date().toISOString(), finished_at: null })
    .eq("status", "failed")
    .gte("created_at", startOfNyDay());
  if (error) throw new Error(error.message);
}

export async function sendConversationJobNow(jobId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .update({ run_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

export async function queueConversationPost(groupId: string, userId: string): Promise<void> {
  const members = await loadPropMemberIdsByGroup();
  const ids = members.get(groupId) ?? [];
  if (!ids.includes(userId)) throw new Error("That account is not in this group.");
  if (ids.length < 2) throw new Error("Choose a group with at least two prop accounts.");
  const { error } = await supabaseAdmin.from("prop_engagement_jobs").insert({
    group_id: groupId,
    author_id: userId,
    kind: "start_post",
    run_at: new Date().toISOString(),
    status: "pending",
  });
  if (error && error.code === "23505") throw new Error("That group already has a post waiting.");
  if (error) throw new Error(error.message);
}

export async function updateSentConversationLine(jobId: string, body: string): Promise<void> {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Write something before saving.");
  if (text.length > 1000) throw new Error("Keep the post under 1000 characters.");

  const { data, error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("id, group_id, comment_id")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.comment_id || !data.group_id) throw new Error("That line has no post to edit.");

  const { error: rpcError } = await supabaseAdmin.rpc("admin_update_area_discussion_comment", {
    p_comment_id: data.comment_id,
    p_body: text,
  });
  if (rpcError) {
    const missing = /could not find the function|does not exist|PGRST202/i.test(rpcError.message ?? "");
    if (!missing) throw new Error(rpcError.message);
    const { error: updateError } = await supabaseAdmin
      .from("area_discussion_comments")
      .update({ body: text })
      .eq("id", data.comment_id)
      .eq("group_id", data.group_id);
    if (updateError) throw new Error(updateError.message);
  }

  const { error: jobError } = await supabaseAdmin.from("prop_engagement_jobs").update({ body: text }).eq("id", jobId);
  if (jobError) throw new Error(jobError.message);
}

export async function removeSentConversationLine(jobId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("id, group_id, comment_id")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.comment_id || !data.group_id) throw new Error("That line has no post to remove.");
  await deleteGroupContent(String(data.group_id), String(data.comment_id));
  const { error: updateError } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .update({ status: "skipped", error: "Removed", finished_at: new Date().toISOString() })
    .eq("id", jobId);
  if (updateError) throw new Error(updateError.message);
}

export async function copyPersonalityToCast(userId: string): Promise<number> {
  const voice = await loadAccountVoice(userId);
  if (!voiceIsSet(voice)) throw new Error("Set this account's behavior before copying it.");

  const { data: enabledRows, error: enabledError } = await supabaseAdmin
    .from("prop_conversation_groups")
    .select("group_id")
    .eq("enabled", true);
  if (enabledError) throw new Error(enabledError.message);
  const enabled = new Set(((enabledRows ?? []) as Array<{ group_id: string }>).map((row) => String(row.group_id)));
  const members = await loadPropMemberIdsByGroup();
  const targets = new Set<string>();
  for (const [groupId, ids] of members) {
    if (!enabled.has(groupId) || !ids.includes(userId)) continue;
    for (const id of ids) {
      if (id !== userId) targets.add(id);
    }
  }
  if (targets.size === 0) throw new Error("No other accounts in the groups that are on.");

  await writeAccountVoices([...targets], voice);
  return targets.size;
}

export async function skipConversationJob(jobId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .update({ status: "skipped", error: "Skipped", finished_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

export async function clearConversationQueue(): Promise<void> {
  const { error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .update({ status: "skipped", error: "Cleared", finished_at: new Date().toISOString() })
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

async function logGroqCall(input: {
  model: string;
  ok: boolean;
  promptTokens: number;
  completionTokens: number;
  error: string | null;
}) {
  const { error } = await supabaseAdmin.from("prop_groq_calls").insert({
    job_id: null,
    model: input.model,
    ok: input.ok,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    error: input.error,
  });
  if (error) console.error("[conversations] failed to record Groq call:", error.message);
}

export async function previewGroupLine(groupId: string, userId: string): Promise<string> {
  const settings = await loadConversationSettings();
  const usage = await loadConversationUsage();
  if (usage.calls >= settings.dailyCallBudget) throw new Error("Daily call cap reached.");

  const members = await loadPropMemberIdsByGroup();
  if (!(members.get(groupId) ?? []).includes(userId)) throw new Error("That account is not in this group.");

  const [{ data: config, error: configError }, voice, locales, edges, memories] = await Promise.all([
    supabaseAdmin.from("prop_conversation_groups").select("topic, rules, swear, swear_rate, grammar, abbrev").eq("group_id", groupId).maybeSingle(),
    loadAccountVoice(userId),
    loadGroupLocales([groupId]),
    loadRunEdges([groupId]),
    memoriesForLine(userId, groupId).catch(() => [] as string[]),
  ]);
  const edge = edges.get(groupId) ?? DEFAULT_EDGE;
  if (configError) throw new Error(configError.message);
  const speaking = lineVoice(voice, {
    swear: Boolean(config?.swear),
    swearRate: parseSwearRate(config?.swear_rate),
    grammar: parseGrammar(config?.grammar),
    abbrev: parseAbbrev(config?.abbrev),
  });

  try {
    const line = await writeConversationLine({
      topic: topicOrDefault(config?.topic),
      personality: personalityOrDefault(speaking.personality),
      behavior: speaking.behavior,
      character: speaking.character,
      kind: "start_post",
      parentBody: null,
      rules: parseRunRules(config?.rules),
      swear: speaking.swear,
      swearRate: speaking.swearRate,
      swearStrength: edge.swearStrength,
      attitude: edge.attitude,
      minor: speaking.minor,
      grammar: speaking.grammar,
      abbrev: speaking.abbrev,
      language: locales.get(groupId)?.language,
      memories,
    });
    await logGroqCall({
      model: line.model,
      ok: true,
      promptTokens: line.promptTokens,
      completionTokens: line.completionTokens,
      error: null,
    });
    return line.text;
  } catch (error) {
    const groqError = error instanceof GroqCallError ? error : null;
    const message = error instanceof Error ? error.message : "Groq failed";
    if (!message.includes("GROQ_API_KEY")) {
      await logGroqCall({
        model: groqError?.model ?? GROQ_MODEL,
        ok: false,
        promptTokens: groqError?.promptTokens ?? 0,
        completionTokens: groqError?.completionTokens ?? 0,
        error: message.slice(0, 300),
      });
    }
    throw error instanceof Error ? error : new Error(message);
  }
}
