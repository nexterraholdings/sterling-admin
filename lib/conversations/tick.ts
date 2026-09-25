import { publishGroupContent } from "@/lib/groups/db";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadConversationSettings, loadConversationUsage, loadPropMemberIdsByGroup } from "@/lib/conversations/db";
import { GROQ_MODEL, GroqCallError, personalityOrDefault, topicOrDefault, writeConversationLine } from "@/lib/conversations/groq";
import { minutesFromNow, startOfNyDay, withinActiveHours } from "@/lib/conversations/time";
import { TOPIC_DIRECTIONS, type ConversationTickResult, type ManualRunRequest } from "@/lib/conversations/types";

const MAX_CALLS_PER_TICK = 4;
const STALE_MS = 2 * 60 * 60 * 1000;

type MemberMap = Map<string, string[]>;

type EnabledGroup = {
  group_id: string;
  topic: string;
  posts_per_day: number;
  replies_per_post: number;
};

type JobRow = {
  id: string;
  group_id: string;
  author_id: string;
  kind: "start_post" | "reply";
  parent_comment_id: string | null;
  run_at: string;
  cast_ids: string[] | null;
  spread_minutes: number | null;
};

function pickId(ids: string[], avoid: string[]): string | null {
  const fresh = ids.filter((id) => !avoid.includes(id));
  const pool = fresh.length > 0 ? fresh : ids.filter((id) => !avoid.includes(id));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

async function loadPersonalities(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await supabaseAdmin.from("prop_account_personas").select("user_id, personality").limit(2000);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) map.set(String(row.user_id), String(row.personality ?? ""));
  return map;
}

async function scheduleReplies(input: {
  groupId: string;
  parentCommentId: string;
  postAuthorId: string;
  repliesPerPost: number;
  memberIds: string[];
  immediateFirst: boolean;
  spreadMinutes?: number;
  naturalReplies?: boolean;
}): Promise<number> {
  const wanted = Math.max(0, Math.min(6, input.repliesPerPost));
  if (wanted === 0) return 0;

  const { data: existing, error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("author_id, status")
    .eq("parent_comment_id", input.parentCommentId)
    .in("status", ["pending", "running", "done"]);
  if (error) throw new Error(error.message);
  const used = new Set(
    ((existing ?? []) as Array<{ author_id: string }>).map((row) => String(row.author_id)),
  );
  used.add(input.postAuthorId);
  let need = wanted - (existing?.length ?? 0);
  if (need <= 0) return 0;

  let cursor = Date.now();
  let created = 0;
  let index = 0;
  while (need > 0) {
    const authorId = pickId(
      input.memberIds.filter((id) => !used.has(id)),
      [],
    );
    if (!authorId) break;
    let runAt = new Date(cursor).toISOString();
    if (input.naturalReplies) {
      const wait = index === 0 ? 2 + Math.random() * 6 : 3 + Math.random() * 11;
      cursor += wait * 60_000;
      runAt = new Date(cursor).toISOString();
    } else if (input.spreadMinutes != null) {
      const span = Math.max(0, input.spreadMinutes);
      const step = wanted <= 1 ? 0 : span / wanted;
      const offset = input.immediateFirst && index === 0 ? 0 : Math.round((index + 1) * step);
      runAt = new Date(Date.now() + offset * 60_000).toISOString();
    } else if (!(input.immediateFirst && index === 0)) {
      cursor += (8 + Math.random() * 32) * 60_000;
      runAt = new Date(cursor).toISOString();
    }
    const { error: insertError } = await supabaseAdmin.from("prop_engagement_jobs").insert({
      group_id: input.groupId,
      author_id: authorId,
      kind: "reply",
      parent_comment_id: input.parentCommentId,
      run_at: runAt,
      status: "pending",
    });
    if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
    if (!insertError) created += 1;
    used.add(authorId);
    need -= 1;
    index += 1;
  }
  return created;
}

async function joinExistingThreads(input: {
  groupId: string;
  memberIds: string[];
  maxNew: number;
  sinceIso: string;
  immediateFirst: boolean;
}): Promise<number> {
  if (input.maxNew <= 0 || input.memberIds.length === 0) return 0;

  const { data: starts, error: startError } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("comment_id")
    .eq("group_id", input.groupId)
    .eq("kind", "start_post")
    .gte("created_at", input.sinceIso);
  if (startError) throw new Error(startError.message);
  const startedHere = new Set(
    ((starts ?? []) as Array<{ comment_id: string | null }>).map((row) => String(row.comment_id ?? "")).filter(Boolean),
  );

  const { data: replies, error: replyError } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("parent_comment_id")
    .eq("group_id", input.groupId)
    .eq("kind", "reply")
    .in("status", ["pending", "running", "done"])
    .gte("created_at", input.sinceIso);
  if (replyError) throw new Error(replyError.message);
  const alreadyJoined = ((replies ?? []) as Array<{ parent_comment_id: string | null }>).filter((row) => {
    const parent = String(row.parent_comment_id ?? "");
    return parent && !startedHere.has(parent);
  }).length;
  const room = Math.max(0, 4 - alreadyJoined);
  const budget = Math.min(input.maxNew, room);
  if (budget <= 0) return 0;

  const lookback = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: comments, error } = await supabaseAdmin
    .from("area_discussion_comments")
    .select("id, author_id, body")
    .eq("group_id", input.groupId)
    .gte("created_at", lookback)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);

  let created = 0;
  for (const row of comments ?? []) {
    if (created >= budget) break;
    if (!String(row.body ?? "").trim()) continue;
    created += await scheduleReplies({
      groupId: input.groupId,
      parentCommentId: String(row.id),
      postAuthorId: String(row.author_id ?? ""),
      repliesPerPost: 1,
      memberIds: input.memberIds,
      immediateFirst: input.immediateFirst && created === 0,
    });
  }
  return created;
}

async function planJobs(manual: boolean, since: string, members: MemberMap): Promise<number> {
  const { data: groups, error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .select("group_id, topic, posts_per_day, replies_per_post")
    .eq("enabled", true)
    .neq("auto_continue", false);
  if (error) throw new Error(error.message);

  let planned = 0;
  let slot = 0;
  for (const group of (groups ?? []) as EnabledGroup[]) {
    const groupId = String(group.group_id);
    const memberIds = members.get(groupId) ?? [];
    if (memberIds.length < 2) continue;

    const { count: postsToday, error: countError } = await supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("kind", "start_post")
      .in("status", ["pending", "running", "done"])
      .gte("created_at", since);
    if (countError) throw new Error(countError.message);

    const { data: openStart, error: openError } = await supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id")
      .eq("group_id", groupId)
      .eq("kind", "start_post")
      .in("status", ["pending", "running"])
      .limit(1)
      .maybeSingle();
    if (openError) throw new Error(openError.message);

    if ((postsToday ?? 0) < Number(group.posts_per_day ?? 0) && !openStart) {
      const { data: previous } = await supabaseAdmin
        .from("prop_engagement_jobs")
        .select("author_id")
        .eq("group_id", groupId)
        .eq("kind", "start_post")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const authorId = pickId(memberIds, previous?.author_id ? [String(previous.author_id)] : []);
      if (authorId) {
        const runAt =
          manual && slot === 0 ? new Date().toISOString() : minutesFromNow(2 + slot * 12, 18 + slot * 12);
        const { error: insertError } = await supabaseAdmin.from("prop_engagement_jobs").insert({
          group_id: groupId,
          author_id: authorId,
          kind: "start_post",
          run_at: runAt,
          status: "pending",
        });
        if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
        if (!insertError) {
          planned += 1;
          slot += 1;
        }
      }
    }

    const { data: donePosts, error: doneError } = await supabaseAdmin
      .from("prop_engagement_jobs")
      .select("comment_id, author_id")
      .eq("group_id", groupId)
      .eq("kind", "start_post")
      .eq("status", "done")
      .gte("created_at", since)
      .not("comment_id", "is", null);
    if (doneError) throw new Error(doneError.message);
    for (const post of donePosts ?? []) {
      if (!post.comment_id) continue;
      planned += await scheduleReplies({
        groupId,
        parentCommentId: String(post.comment_id),
        postAuthorId: String(post.author_id),
        repliesPerPost: Number(group.replies_per_post ?? 0),
        memberIds,
        immediateFirst: false,
      });
    }

    planned += await joinExistingThreads({
      groupId,
      memberIds,
      maxNew: 1,
      sinceIso: since,
      immediateFirst: false,
    });
  }

  if (manual) {
    const { data: soonest } = await supabaseAdmin
      .from("prop_engagement_jobs")
      .select("id")
      .eq("status", "pending")
      .order("run_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (soonest) {
      await supabaseAdmin
        .from("prop_engagement_jobs")
        .update({ run_at: new Date().toISOString() })
        .eq("id", soonest.id);
    }
  }

  return planned;
}

function randomBetween(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.random() * (hi - lo);
}

function naturalGap(spread: number | null): { min: number; max: number } | null {
  if (spread == null || spread < 1000) return null;
  const min = Math.floor(spread / 1000);
  const max = spread % 1000;
  if (min < 1 || max < min) return null;
  return { min, max };
}

function postDelay(index: number, posts: number, duration: number, startNow: boolean): number {
  if (duration <= 0) return 0;
  if (startNow && index === 0) return 0;
  const slots = startNow ? Math.max(1, posts - 1) : posts;
  const position = startNow ? index : index + 1;
  return Math.max(1, Math.round((position / slots) * duration));
}

function runTopic(run: ManualRunRequest, subject: string): string {
  const tone = TOPIC_DIRECTIONS.find((item) => item.id === run.direction)?.line;
  if (!tone) throw new Error("Pick a topic direction.");
  return [subject, tone, run.note.trim()].filter(Boolean).join(". ").slice(0, 480);
}

async function groupSubject(groupId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("discussion_groups")
    .select("title, description, category")
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Group not found.");
  const title = String(data.title ?? "").trim() || "this group";
  const category = String(data.category ?? "").trim();
  const description = String(data.description ?? "").trim().replace(/\s+/g, " ").slice(0, 180);
  const parts = [`Stay on what this group is already about: ${title}`];
  if (category) parts.push(`Category: ${category}`);
  if (description) parts.push(description);
  parts.push("Talk like a member of that group. Do not announce that you were given a topic.");
  return parts.join(". ");
}

function clampRun(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

async function planManualRun(run: ManualRunRequest, members: MemberMap): Promise<number> {
  const groupId = run.groupId.trim();
  const topic = run.topic.trim();
  const note = run.note.trim();
  const accountIds = [...new Set(run.accountIds.map((id) => id.trim()).filter(Boolean))];
  const posts = clampRun(run.posts, 1, 4);
  const replies = clampRun(run.repliesPerPost, 0, 4);
  const durationMinutes = clampRun(run.durationMinutes, 0, 360);
  if (!run.useGroupSubject && topic.length < 8) throw new Error("Write a topic for this run.");
  if (topic.length > 240) throw new Error("Keep the topic under 240 characters.");
  if (note.length > 160) throw new Error("Keep the extra direction under 160 characters.");
  if (accountIds.length < (replies > 0 ? 2 : 1)) {
    throw new Error(replies > 0 ? "Pick at least two prop accounts when replies are on." : "Pick a prop account.");
  }
  const memberIds = members.get(groupId) ?? [];
  if (accountIds.some((id) => !memberIds.includes(id))) {
    throw new Error("Choose prop accounts that belong to this group.");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("prop_conversation_groups")
    .select("posts_per_day")
    .eq("group_id", groupId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const subject = run.useGroupSubject ? await groupSubject(groupId) : topic;
  const combined = runTopic(run, subject);
  const { error: saveError } = await supabaseAdmin.from("prop_conversation_groups").upsert(
    {
      group_id: groupId,
      enabled: true,
      topic: combined,
      posts_per_day: run.keepGoing ? clampRun(run.postsPerDay, 1, 20) : Number(existing?.posts_per_day ?? posts),
      replies_per_post: replies,
      auto_continue: Boolean(run.keepGoing),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "group_id" },
  );
  if (saveError) throw new Error(saveError.message);

  const gapMin = clampRun(run.postEveryMin, 1, 180);
  const gapMax = clampRun(run.postEveryMax, gapMin, 180);
  const natural = Boolean(run.natural);
  let created = 0;
  let naturalCursor = 0;
  for (let index = 0; index < posts; index += 1) {
    const authorId = accountIds[index % accountIds.length];
    let delay = postDelay(index, posts, durationMinutes, run.startNow || durationMinutes === 0);
    if (natural) {
      if (!(run.startNow && index === 0)) naturalCursor += randomBetween(gapMin, gapMax);
      delay = Math.round(naturalCursor);
    }
    const { error: insertError } = await supabaseAdmin.from("prop_engagement_jobs").insert({
      group_id: groupId,
      author_id: authorId,
      kind: "start_post",
      run_at: new Date(Date.now() + delay * 60_000).toISOString(),
      status: "pending",
      cast_ids: accountIds,
      spread_minutes: natural ? gapMin * 1000 + gapMax : durationMinutes,
    });
    if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
    if (!insertError) created += 1;
  }
  if (run.joinExisting !== false) {
    created += await joinExistingThreads({
      groupId,
      memberIds: accountIds,
      maxNew: Math.max(1, Math.min(4, replies || 1)),
      sinceIso: startOfNyDay(),
      immediateFirst: run.startNow || (!natural && durationMinutes === 0),
    });
  }
  return created;
}

async function recordCall(input: {
  jobId: string;
  model: string;
  ok: boolean;
  promptTokens: number;
  completionTokens: number;
  error: string | null;
}) {
  const { error } = await supabaseAdmin.from("prop_groq_calls").insert({
    job_id: input.jobId,
    model: input.model,
    ok: input.ok,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    error: input.error,
  });
  if (error) console.error("[conversations] failed to record Groq call:", error.message);
}

async function finishJob(id: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("prop_engagement_jobs").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

async function nextDueJob(groupId?: string, jobId?: string): Promise<JobRow | null> {
  let query = supabaseAdmin
    .from("prop_engagement_jobs")
    .select("id, group_id, author_id, kind, parent_comment_id, run_at, cast_ids, spread_minutes")
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(1);
  if (groupId) query = query.eq("group_id", groupId);
  if (jobId) query = query.eq("id", jobId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as JobRow | null) ?? null;
}

export async function runConversationTick(options: {
  manual: boolean;
  run?: ManualRunRequest;
  jobId?: string;
}): Promise<ConversationTickResult> {
  const result: ConversationTickResult = { skipped: null, planned: 0, published: 0, calls: 0, notes: [] };
  const run = options.manual ? options.run : undefined;
  const onlyJob = options.manual ? options.jobId : undefined;
  if ((options.run || options.jobId) && !options.manual) throw new Error("A custom run has to be started from the dashboard.");
  const settings = await loadConversationSettings();
  if (!settings.enabled && !run && !onlyJob) {
    result.skipped = "off";
    return result;
  }
  if (run && (run.natural || run.durationMinutes > 0) && !settings.enabled) {
    throw new Error("Turn automatic conversations on to spread a run, or set the window to now.");
  }
  if (run?.keepGoing && !settings.enabled) {
    throw new Error("Turn automatic conversations on to keep this conversation going on its own.");
  }
  if (!options.manual && !withinActiveHours(settings.activeStartHour, settings.activeEndHour)) {
    result.skipped = "quiet_hours";
    return result;
  }

  const since = startOfNyDay();
  await supabaseAdmin
    .from("prop_engagement_jobs")
    .update({ status: "pending", error: "Retrying after an interrupted run" })
    .eq("status", "running")
    .lt("run_at", new Date(Date.now() - 15 * 60_000).toISOString());

  const members = await loadPropMemberIdsByGroup();
  if (run) {
    result.planned = await planManualRun(run, members);
    const windowLabel = run.natural
      ? `about every ${clampRun(run.postEveryMin, 1, 180)}–${clampRun(run.postEveryMax, 1, 180)} minutes`
      : run.durationMinutes > 0
        ? `${clampRun(run.durationMinutes, 0, 360)} minutes`
        : "now";
    result.notes.push(`Queued ${result.planned} ${result.planned === 1 ? "post" : "posts"} for ${windowLabel}.`);
  } else if (!onlyJob) {
    result.planned = await planJobs(options.manual, since, members);
  }
  const callCap = onlyJob ? 1 : run ? clampRun(run.maxCalls, 1, 6) : MAX_CALLS_PER_TICK;

  let callsMade = (await loadConversationUsage(since)).calls;
  if (callsMade >= settings.dailyCallBudget) {
    result.skipped = "budget";
    result.notes.push("Daily call cap reached.");
    return result;
  }

  const { data: groupRows } = await supabaseAdmin
    .from("prop_conversation_groups")
    .select("group_id, topic, replies_per_post")
    .eq("enabled", true);
  const topics = new Map<string, { topic: string; repliesPerPost: number }>();
  for (const row of groupRows ?? []) {
    topics.set(String(row.group_id), {
      topic: String(row.topic ?? ""),
      repliesPerPost: Number(row.replies_per_post ?? 0),
    });
  }
  if (run) {
    const subject = run.useGroupSubject ? await groupSubject(run.groupId) : run.topic.trim();
    topics.set(run.groupId, {
      topic: runTopic(run, subject),
      repliesPerPost: clampRun(run.repliesPerPost, 0, 4),
    });
  }
  const personas = await loadPersonalities();

  let executed = 0;
  while (executed < callCap) {
    if (callsMade >= settings.dailyCallBudget) {
      result.skipped = result.calls > 0 ? null : "budget";
      break;
    }
    const job = await nextDueJob(run?.groupId, onlyJob);
    if (!job) break;

    if (Date.now() - new Date(job.run_at).getTime() > STALE_MS) {
      await finishJob(job.id, {
        status: "skipped",
        error: "The scheduled time passed",
        finished_at: new Date().toISOString(),
      });
      continue;
    }

    const group = topics.get(job.group_id);
    const memberIds = members.get(job.group_id) ?? [];
    if (!group || !memberIds.includes(job.author_id)) {
      await finishJob(job.id, {
        status: "skipped",
        error: "The group is off or the account is no longer a prop member",
        finished_at: new Date().toISOString(),
      });
      continue;
    }

    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("prop_engagement_jobs")
      .update({ status: "running" })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) continue;

    let parentBody: string | null = null;
    if (job.kind === "reply") {
      if (!job.parent_comment_id) {
        await finishJob(job.id, { status: "skipped", error: "Reply is missing its parent", finished_at: new Date().toISOString() });
        continue;
      }
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("area_discussion_comments")
        .select("id, body, group_id")
        .eq("id", job.parent_comment_id)
        .maybeSingle();
      if (parentError) throw new Error(parentError.message);
      if (!parent || String(parent.group_id ?? "") !== job.group_id) {
        await finishJob(job.id, {
          status: "skipped",
          error: "The message being answered is gone",
          finished_at: new Date().toISOString(),
        });
        continue;
      }
      parentBody = String(parent.body ?? "");
    }

    let line: Awaited<ReturnType<typeof writeConversationLine>>;
    try {
      line = await writeConversationLine({
        topic: topicOrDefault(group.topic),
        personality: personalityOrDefault(personas.get(job.author_id)),
        kind: job.kind,
        parentBody,
      });
    } catch (error) {
      const groqError = error instanceof GroqCallError ? error : null;
      const message = error instanceof Error ? error.message : "Groq failed";
      const counted = !message.includes("GROQ_API_KEY");
      if (counted) {
        await recordCall({
          jobId: job.id,
          model: groqError?.model ?? GROQ_MODEL,
          ok: false,
          promptTokens: groqError?.promptTokens ?? 0,
          completionTokens: groqError?.completionTokens ?? 0,
          error: message.slice(0, 300),
        });
        callsMade += 1;
        result.calls += 1;
        executed += 1;
      }
      await finishJob(job.id, {
        status: "pending",
        error: message.slice(0, 300),
        run_at: minutesFromNow(15, 20),
      });
      result.notes.push(message);
      if (!counted) break;
      continue;
    }

    await recordCall({
      jobId: job.id,
      model: line.model,
      ok: true,
      promptTokens: line.promptTokens,
      completionTokens: line.completionTokens,
      error: null,
    });
    callsMade += 1;
    result.calls += 1;
    executed += 1;

    try {
      const item = await publishGroupContent({
        groupId: job.group_id,
        accountId: job.author_id,
        body: line.text,
        parentId: job.kind === "reply" ? job.parent_comment_id : null,
      });
      await finishJob(job.id, {
        status: "done",
        body: line.text,
        comment_id: item.id,
        error: null,
        finished_at: new Date().toISOString(),
      });
      result.published += 1;
      result.notes.push(line.text);
      if (job.kind === "start_post") {
        const cast = Array.isArray(job.cast_ids) ? job.cast_ids.map((id) => String(id)).filter(Boolean) : [];
        const natural = naturalGap(job.spread_minutes);
        await scheduleReplies({
          groupId: job.group_id,
          parentCommentId: item.id,
          postAuthorId: job.author_id,
          repliesPerPost: group.repliesPerPost,
          memberIds: cast.length > 0 ? cast : memberIds,
          immediateFirst: !natural && options.manual && (job.spread_minutes ?? 0) === 0,
          spreadMinutes: natural ? undefined : job.spread_minutes ?? undefined,
          naturalReplies: Boolean(natural),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish failed";
      await finishJob(job.id, {
        status: "pending",
        body: line.text,
        error: message.slice(0, 300),
        run_at: minutesFromNow(15, 20),
      });
      result.notes.push(message);
    }
  }

  return result;
}
