import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { deleteGroupContent } from "@/lib/groups/db";
import { isPropAccountEmail, PROP_ACCOUNT_EMAIL_PATTERN, SYSTEM_GROUP_OWNER_EMAIL } from "@/lib/prop-accounts";
import { GROQ_MODEL, GroqCallError, personalityOrDefault, topicOrDefault, writeConversationLine } from "@/lib/conversations/groq";
import { startOfNyDay } from "@/lib/conversations/time";
import type {
  ConversationActiveRun,
  ConversationDashboard,
  ConversationFolder,
  ConversationGroup,
  ConversationLogEntry,
  ConversationPersona,
  ConversationQueueItem,
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

async function listPropProfiles(): Promise<PropProfile[]> {
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
  const [settings, usage, props, openGroups, configResult, personaResult, folderResult, folderMemberResult, logResult, queueResult, openJobResult, todayJobResult] =
    await Promise.all([
    loadConversationSettings(),
    loadConversationUsage(since),
    listPropProfiles(),
    listOpenGroups(),
    supabaseAdmin.from("prop_conversation_groups").select("group_id, enabled, topic, posts_per_day, replies_per_post, auto_continue"),
    supabaseAdmin.from("prop_account_personas").select("user_id, personality"),
    supabaseAdmin.from("admin_prop_folders").select("id,name,parent_id").order("name", { ascending: true }).limit(1000),
    supabaseAdmin.from("admin_prop_folder_members").select("folder_id,user_id").limit(5000),
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id, group_id, author_id, comment_id, kind, body, error, status, finished_at")
      .gte("created_at", since)
      .in("status", ["done", "failed"])
      .order("finished_at", { ascending: false })
      .limit(40),
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id, group_id, author_id, kind, run_at")
      .eq("status", "pending")
      .order("run_at", { ascending: true })
      .limit(50),
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id, group_id, author_id, kind, status, run_at, body, error, cast_ids, spread_minutes, created_at")
      .in("status", ["pending", "running"])
      .order("run_at", { ascending: true })
      .limit(120),
    supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id, group_id, author_id, kind, status, run_at, body, error, cast_ids, spread_minutes, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (configResult.error) throw new Error(configResult.error.message);
  if (personaResult.error) throw new Error(personaResult.error.message);
  if (folderResult.error && !isMissingSchemaError(folderResult.error)) throw new Error(folderResult.error.message);
  if (folderMemberResult.error && !isMissingSchemaError(folderMemberResult.error)) {
    throw new Error(folderMemberResult.error.message);
  }
  if (logResult.error) throw new Error(logResult.error.message);
  if (queueResult.error) throw new Error(queueResult.error.message);
  if (openJobResult.error) throw new Error(openJobResult.error.message);
  if (todayJobResult.error) throw new Error(todayJobResult.error.message);

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
    { enabled: boolean; topic: string; postsPerDay: number; repliesPerPost: number; autoContinue: boolean }
  >(
    ((configResult.data ?? []) as Array<{
      group_id: string;
      enabled: boolean | null;
      topic: string | null;
      posts_per_day: number | null;
      replies_per_post: number | null;
      auto_continue: boolean | null;
    }>).map((row) => [
      String(row.group_id),
      {
        enabled: Boolean(row.enabled),
        topic: String(row.topic ?? ""),
        postsPerDay: Number(row.posts_per_day ?? 2),
        repliesPerPost: Number(row.replies_per_post ?? 2),
        autoContinue: row.auto_continue !== false,
      },
    ]),
  );

  const personaByUser = new Map<string, string>(
    ((personaResult.data ?? []) as Array<{ user_id: string; personality: string | null }>).map((row) => [
      String(row.user_id),
      String(row.personality ?? ""),
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
      hubTitle: hubs.get(String(row.discussion_id ?? "")) ?? null,
      propMemberCount: membersByGroup.get(id) ?? 0,
      enabled,
      autoContinue: config?.autoContinue ?? true,
      topic: config?.topic ?? "",
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
    .map((profile) => ({
      userId: profile.id,
      name: profileName(profile),
      username: profile.username,
      personality: personaByUser.get(profile.id) ?? "",
      folderId: folderByUser.get(profile.id) ?? null,
      avatarUrl: profile.avatar_url?.trim() ? profile.avatar_url : null,
      bio: profile.bio ?? "",
    }))
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

  const activeRuns = buildActiveRuns(openJobResult.data ?? [], todayJobResult.data ?? [], groups, nameByUser);

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
  todayJobs: RunJobRow[],
  groups: ConversationGroup[],
  nameByUser: Map<string, string>,
): ConversationActiveRun[] {
  const openIds = new Set(openJobs.map((job) => String(job.group_id)));
  if (openIds.size === 0) return [];
  const merged = new Map<string, RunJobRow>();
  for (const job of [...todayJobs, ...openJobs]) merged.set(String(job.id), job);
  const byGroup = new Map<string, RunJobRow[]>();
  for (const job of merged.values()) {
    const groupId = String(job.group_id);
    if (!openIds.has(groupId)) continue;
    const list = byGroup.get(groupId) ?? [];
    list.push(job);
    byGroup.set(groupId, list);
  }
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const runs: ConversationActiveRun[] = [];
  for (const [groupId, jobs] of byGroup) {
    const group = groupById.get(groupId);
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
        kind: job.kind === "reply" ? "reply" : "start_post",
        status: runStatus(String(job.status)),
        runAt: String(job.run_at),
        body: String(job.body ?? ""),
        error: job.error ? String(job.error) : null,
      }));
    const waiting = lines.filter((line) => line.status === "pending");
    runs.push({
      groupId,
      groupTitle: group?.title ?? "Group",
      topic: group?.topic?.trim() || "Whatever the group is about",
      accountIds,
      accountNames,
      posts: lines.filter((line) => line.kind === "start_post").length,
      repliesPerPost: group?.repliesPerPost ?? 0,
      repliesQueued: lines.filter((line) => line.kind === "reply").length,
      pace: paceLabel(paceSource?.spread_minutes ?? null),
      autoContinue: Boolean(group?.enabled && group.autoContinue),
      postsPerDay: group?.postsPerDay ?? 0,
      sent: lines.filter((line) => line.status === "done").length,
      waiting: waiting.length,
      running: lines.filter((line) => line.status === "running").length,
      failed: lines.filter((line) => line.status === "failed").length,
      total: lines.length,
      nextAt: waiting.map((line) => line.runAt).sort()[0] ?? null,
      lines,
    });
  }
  return runs.sort((a, b) => a.groupTitle.localeCompare(b.groupTitle));
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
}

export async function savePersona(userId: string, personality: string): Promise<void> {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile || !isPropAccountEmail(profile.email) || profile.email?.toLowerCase() === SYSTEM_GROUP_OWNER_EMAIL) {
    throw new Error("Personalities are only for prop accounts.");
  }

  const { error } = await supabaseAdmin.from("prop_account_personas").upsert(
    {
      user_id: userId,
      personality: personality.trim().slice(0, 500),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function pauseAllConversationGroups(): Promise<void> {
  const { error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("enabled", true);
  if (error) throw new Error(error.message);
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
  const { data: persona, error: personaError } = await supabaseAdmin
    .from("prop_account_personas")
    .select("personality")
    .eq("user_id", userId)
    .maybeSingle();
  if (personaError) throw new Error(personaError.message);
  const personality = String(persona?.personality ?? "").trim();
  if (!personality) throw new Error("Write a personality before copying it.");

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

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("prop_account_personas").upsert(
    [...targets].map((id) => ({ user_id: id, personality, updated_at: now })),
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
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

  const [{ data: config, error: configError }, { data: persona, error: personaError }] = await Promise.all([
    supabaseAdmin.from("prop_conversation_groups").select("topic").eq("group_id", groupId).maybeSingle(),
    supabaseAdmin.from("prop_account_personas").select("personality").eq("user_id", userId).maybeSingle(),
  ]);
  if (configError) throw new Error(configError.message);
  if (personaError) throw new Error(personaError.message);

  try {
    const line = await writeConversationLine({
      topic: topicOrDefault(config?.topic),
      personality: personalityOrDefault(persona?.personality),
      kind: "start_post",
      parentBody: null,
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
