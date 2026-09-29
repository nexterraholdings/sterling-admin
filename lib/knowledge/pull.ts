import { supabaseAdmin } from "@/lib/supabase/server";
import { loadHubLocales } from "@/lib/conversations/hub-locale";
import { DEFAULT_ZONE } from "@/lib/conversations/time";
import { citationKey, pullFromX, XaiError, xaiConfigured } from "@/lib/knowledge/xai";
import { judgeItems } from "@/lib/knowledge/judge";
import { KNOWLEDGE_SCHEMA_HINT, feedsOf, loadDueWatches, loadWatch, parseHandles, parseTeams } from "@/lib/knowledge/db";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { cityOf, countryFor, type FeedContext, type FeedResult, type PulledItem } from "@/lib/knowledge/feeds/shared";
import { pullNews } from "@/lib/knowledge/feeds/news";
import { pullWeather } from "@/lib/knowledge/feeds/weather";
import { pullSports } from "@/lib/knowledge/feeds/sports";
import { pullEvents } from "@/lib/knowledge/feeds/events";
import type { KnowledgeFeed, KnowledgePullOutcome, KnowledgeVerdict } from "@/lib/knowledge/types";

const DAY_MS = 24 * 60 * 60_000;
/** Posted longer ago than this is too old to bring up as news. */
const STALE_MS = 36 * 60 * 60_000;
/** Share of words two claims need in common to count as the same story. */
const DUPLICATE_OVERLAP = 0.6;

const FEED_LABELS: Record<KnowledgeFeed, string> = {
  news: "News",
  weather: "Weather",
  sports: "Sports",
  events: "Events",
  x: "X",
};

type Watch = NonNullable<Awaited<ReturnType<typeof loadWatch>>>;

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function expiresAt(item: PulledItem, fetched: number): string {
  if (item.expiresAt) return item.expiresAt;
  const posted = item.postedAt ? new Date(item.postedAt).getTime() : fetched;
  return new Date(Math.max(posted + DAY_MS, fetched + 6 * 60 * 60_000)).toISOString();
}

async function recentClaims(hubId: string): Promise<{ urls: Set<string>; keys: Set<string>; stories: Array<Set<string>> }> {
  const { data, error } = await supabaseAdmin
    .from("knowledge_items")
    .select("claim, source, source_url")
    .eq("hub_id", hubId)
    .gte("fetched_at", new Date(Date.now() - 3 * DAY_MS).toISOString())
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ claim: string; source: string; source_url: string }>;
  const keys = new Set<string>();
  for (const row of rows) {
    const key = citationKey(row.source_url);
    if (key) keys.add(key);
  }
  return {
    urls: new Set(rows.map((row) => row.source_url)),
    keys,
    stories: rows.filter((row) => row.source !== "weather" && row.source !== "sports").map((row) => words(row.claim)),
  };
}

async function recordPull(row: {
  watchId: string;
  hubId: string;
  ok: boolean;
  model: string;
  found: number;
  kept: number;
  xPostsFetched: number;
  inputTokens: number;
  outputTokens: number;
  judgeTokens: number;
  error: string | null;
}) {
  const { error } = await supabaseAdmin.from("knowledge_pulls").insert({
    watch_id: row.watchId,
    hub_id: row.hubId,
    ok: row.ok,
    model: row.model,
    items_found: row.found,
    items_kept: row.kept,
    x_posts_fetched: row.xPostsFetched,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    judge_tokens: row.judgeTokens,
    error: row.error?.slice(0, 300) ?? null,
  });
  if (error) console.error("[knowledge] failed to record pull:", error.message);
}

async function runFeed(feed: KnowledgeFeed, context: FeedContext): Promise<FeedResult | null> {
  try {
    if (feed === "news") return await pullNews(context);
    if (feed === "weather") return await pullWeather(context);
    if (feed === "sports") return await pullSports(context);
    if (feed === "events") return await pullEvents(context);
    // X stays off until XAI_API_KEY is set, without flagging every pull as an error.
    if (!xaiConfigured()) return null;
    const result = await pullFromX({ place: context.place, searchTerms: context.searchTerms, handles: context.handles, now: context.now });
    return {
      feed: "x",
      found: result.found,
      items: result.items,
      error: null,
      xPostsFetched: result.xPostsFetched,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  } catch (error) {
    const usage = error instanceof XaiError ? error.usage : null;
    return {
      feed,
      found: 0,
      items: [],
      error: error instanceof Error ? error.message : "Pull failed",
      xPostsFetched: usage?.xPostsFetched,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    };
  }
}

export async function pullWatch(watch: Watch): Promise<KnowledgePullOutcome> {
  const hubId = String(watch.hub_id);
  const locale = (await loadHubLocales([hubId])).get(hubId);
  const hubTitle = locale?.place || "Hub";
  const outcome: KnowledgePullOutcome = { watchId: String(watch.id), hubTitle, ok: false, found: 0, kept: 0, approved: 0, rejected: 0, error: null };
  const now = new Date();
  await supabaseAdmin.from("knowledge_watches").update({ last_pulled_at: now.toISOString() }).eq("id", watch.id);

  const feeds = feedsOf(watch.feeds);
  const timeZone = locale?.timeZone ?? DEFAULT_ZONE;
  const place = locale?.place ?? "";
  const context: FeedContext = {
    place,
    city: cityOf(place),
    searchTerms: String(watch.search_terms ?? ""),
    language: locale?.language ?? "English",
    timeZone,
    country: countryFor(timeZone),
    lat: locale?.lat ?? null,
    lng: locale?.lng ?? null,
    teams: parseTeams(watch.teams ?? []),
    handles: parseHandles(watch.x_handles ?? []),
    now,
  };
  const results = (await Promise.all(feeds.map((feed) => runFeed(feed, context)))).filter((result): result is FeedResult => result !== null);
  const errors = results.filter((result) => result.error).map((result) => `${FEED_LABELS[result.feed]}: ${result.error}`);
  const usage = {
    model: results.map((result) => result.feed).join("+"),
    xPostsFetched: results.reduce((sum, result) => sum + (result.xPostsFetched ?? 0), 0),
    inputTokens: results.reduce((sum, result) => sum + (result.inputTokens ?? 0), 0),
    outputTokens: results.reduce((sum, result) => sum + (result.outputTokens ?? 0), 0),
  };
  outcome.found = results.reduce((sum, result) => sum + result.found, 0);
  outcome.error = errors.length > 0 ? errors.join(" | ") : null;

  if (results.length === 0 || results.every((result) => result.error)) {
    const message = outcome.error ?? "Nothing to pull. Turn on at least one source.";
    outcome.error = message;
    await supabaseAdmin.from("knowledge_watches").update({ last_error: message.slice(0, 300) }).eq("id", watch.id);
    await recordPull({ watchId: String(watch.id), hubId, ok: false, found: outcome.found, kept: 0, judgeTokens: 0, error: message, ...usage });
    return outcome;
  }

  const fetched = now.getTime();
  const existing = await recentClaims(hubId);
  const pulled = results.flatMap((result) => result.items);
  const fresh = pulled.filter((item) => {
    if (existing.urls.has(item.url)) return false;
    if (item.structured) return true;
    const key = citationKey(item.url);
    return !key || !existing.keys.has(key);
  });

  type Draft = PulledItem & { tempId: string; verdict: KnowledgeVerdict | null; reason: string; expires: string };
  const drafts: Draft[] = [];
  const kept: Array<Set<string>> = [];
  const seenUrls = new Set<string>();
  for (const [index, item] of fresh.entries()) {
    const expires = expiresAt(item, fetched);
    if (seenUrls.has(item.url) || new Date(expires).getTime() <= fetched) continue;
    seenUrls.add(item.url);
    const draft: Draft = { ...item, tempId: `i${index}`, verdict: null, reason: "", expires };
    if (item.postedAt && fetched - new Date(item.postedAt).getTime() > STALE_MS) {
      draft.verdict = "reject";
      draft.reason = "Posted more than a day and a half ago";
    } else if (item.structured) {
      draft.verdict = "approve";
      draft.reason = "Built from forecast or schedule data";
    } else {
      const claimWords = words(item.claim);
      if ([...existing.stories, ...kept].some((other) => overlap(claimWords, other) >= DUPLICATE_OVERLAP)) {
        draft.verdict = "reject";
        draft.reason = "Same story as an item already in this hub";
      }
      kept.push(claimWords);
    }
    drafts.push(draft);
  }

  let judgeTokens = 0;
  const toJudge = drafts.filter((draft) => !draft.verdict);
  if (toJudge.length > 0) {
    try {
      const judged = await judgeItems(
        place,
        toJudge.map((draft) => ({ id: draft.tempId, claim: draft.claim, author: draft.author, source: draft.source })),
      );
      judgeTokens = judged.tokens;
      for (const draft of toJudge) {
        const verdict = judged.verdicts.get(draft.tempId);
        if (verdict) {
          draft.verdict = verdict.verdict;
          draft.reason = verdict.reason;
        } else {
          draft.reason = "The checks skipped this item";
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checks failed";
      for (const draft of toJudge) draft.reason = `Checks could not run: ${message}`.slice(0, 160);
    }
  }

  const auto = watch.approval === "auto";
  const decidedAt = new Date().toISOString();
  const rows = drafts.map((draft) => {
    const status = auto && draft.verdict ? (draft.verdict === "approve" ? "approved" : "rejected") : "new";
    if (status === "approved") outcome.approved += 1;
    if (status === "rejected") outcome.rejected += 1;
    return {
      watch_id: watch.id,
      hub_id: hubId,
      source: draft.source,
      claim: draft.claim,
      source_url: draft.url,
      author: draft.author,
      image_url: draft.imageUrl,
      posted_at: draft.postedAt,
      fetched_at: new Date(fetched).toISOString(),
      expires_at: draft.expires,
      status,
      verdict: draft.verdict,
      reason: draft.reason,
      decided_by: status === "new" ? "" : "auto",
      decided_at: status === "new" ? null : decidedAt,
    };
  });

  if (rows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("knowledge_items")
      .upsert(rows, { onConflict: "hub_id,source_url", ignoreDuplicates: true })
      .select("id");
    if (error) {
      outcome.error = error.message;
      await recordPull({ watchId: String(watch.id), hubId, ok: false, found: outcome.found, kept: 0, judgeTokens, error: error.message, ...usage });
      return outcome;
    }
    outcome.kept = (data ?? []).length;
  }

  outcome.ok = true;
  await supabaseAdmin
    .from("knowledge_watches")
    .update({ last_error: outcome.error?.slice(0, 300) ?? null })
    .eq("id", watch.id);
  await recordPull({ watchId: String(watch.id), hubId, ok: true, found: outcome.found, kept: outcome.kept, judgeTokens, error: outcome.error, ...usage });
  return outcome;
}

export async function pullWatchById(id: string): Promise<KnowledgePullOutcome> {
  const watch = await loadWatch(id);
  if (!watch) throw new Error("That watch no longer exists.");
  return pullWatch(watch);
}

/** Pull the most overdue watches. Runs in parallel so a 60-second cron fits more than one. */
export async function runKnowledgePull(limit = 2): Promise<{ outcomes: KnowledgePullOutcome[]; note: string | null }> {
  const { error: schemaError } = await supabaseAdmin.from("knowledge_watches").select("id").limit(1);
  if (schemaError && isMissingSchemaError(schemaError)) return { outcomes: [], note: KNOWLEDGE_SCHEMA_HINT };
  const due = await loadDueWatches(limit);
  const settled = await Promise.allSettled(due.map((watch) => pullWatch(watch)));
  const outcomes = settled.map((entry, index) =>
    entry.status === "fulfilled"
      ? entry.value
      : {
          watchId: String(due[index]?.id ?? ""),
          hubTitle: "Hub",
          ok: false,
          found: 0,
          kept: 0,
          approved: 0,
          rejected: 0,
          error: entry.reason instanceof Error ? entry.reason.message : "Pull failed",
        },
  );
  return { outcomes, note: due.length === 0 ? "Nothing due" : null };
}
