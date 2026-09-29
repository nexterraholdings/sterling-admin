import { supabaseAdmin } from "@/lib/supabase/server";
import { loadHubLocales } from "@/lib/conversations/hub-locale";
import { citationKey, pullFromX, XaiError, type PulledItem } from "@/lib/knowledge/xai";
import { judgeItems } from "@/lib/knowledge/judge";
import { KNOWLEDGE_SCHEMA_HINT, loadDueWatches, loadWatch, parseHandles } from "@/lib/knowledge/db";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import type { KnowledgePullOutcome, KnowledgeVerdict } from "@/lib/knowledge/types";

const DAY_MS = 24 * 60 * 60_000;
/** Posted longer ago than this is too old to bring up as news. */
const STALE_MS = 36 * 60 * 60_000;
/** Share of words two claims need in common to count as the same story. */
const DUPLICATE_OVERLAP = 0.6;

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
  const posted = item.postedAt ? new Date(item.postedAt).getTime() : fetched;
  return new Date(Math.max(posted + DAY_MS, fetched + 6 * 60 * 60_000)).toISOString();
}

async function recentClaims(hubId: string): Promise<Array<{ key: string | null; words: Set<string> }>> {
  const { data, error } = await supabaseAdmin
    .from("knowledge_items")
    .select("claim, source_url")
    .eq("hub_id", hubId)
    .gte("fetched_at", new Date(Date.now() - 3 * DAY_MS).toISOString())
    .limit(300);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ claim: string; source_url: string }>).map((row) => ({
    key: citationKey(row.source_url),
    words: words(row.claim),
  }));
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

export async function pullWatch(watch: Watch): Promise<KnowledgePullOutcome> {
  const hubId = String(watch.hub_id);
  const locale = (await loadHubLocales([hubId])).get(hubId);
  const hubTitle = locale?.place || "Hub";
  const outcome: KnowledgePullOutcome = { watchId: String(watch.id), hubTitle, ok: false, found: 0, kept: 0, approved: 0, rejected: 0, error: null };
  const startedAt = new Date().toISOString();
  await supabaseAdmin.from("knowledge_watches").update({ last_pulled_at: startedAt }).eq("id", watch.id);

  let result: Awaited<ReturnType<typeof pullFromX>>;
  try {
    result = await pullFromX({
      place: locale?.place ?? "",
      searchTerms: String(watch.search_terms ?? ""),
      handles: parseHandles(watch.x_handles ?? []),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "xAI pull failed";
    const usage = error instanceof XaiError ? error.usage : null;
    outcome.error = message;
    await supabaseAdmin.from("knowledge_watches").update({ last_error: message.slice(0, 300) }).eq("id", watch.id);
    await recordPull({
      watchId: String(watch.id),
      hubId,
      ok: false,
      model: usage?.model ?? "",
      found: 0,
      kept: 0,
      xPostsFetched: usage?.xPostsFetched ?? 0,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      judgeTokens: 0,
      error: message,
    });
    return outcome;
  }
  outcome.found = result.found;

  const fetched = Date.now();
  const existing = await recentClaims(hubId);
  const existingKeys = new Set(existing.map((row) => row.key).filter(Boolean));
  const fresh = result.items.filter((item) => !existingKeys.has(citationKey(item.url)));

  type Draft = PulledItem & { tempId: string; verdict: KnowledgeVerdict | null; reason: string };
  const drafts: Draft[] = [];
  const kept: Array<Set<string>> = [];
  for (const [index, item] of fresh.entries()) {
    const claimWords = words(item.claim);
    const draft: Draft = { ...item, tempId: `i${index}`, verdict: null, reason: "" };
    if (item.postedAt && fetched - new Date(item.postedAt).getTime() > STALE_MS) {
      draft.verdict = "reject";
      draft.reason = "Posted more than a day and a half ago";
    } else if ([...existing.map((row) => row.words), ...kept].some((other) => overlap(claimWords, other) >= DUPLICATE_OVERLAP)) {
      draft.verdict = "reject";
      draft.reason = "Same story as an item already in this hub";
    }
    kept.push(claimWords);
    drafts.push(draft);
  }

  let judgeTokens = 0;
  const toJudge = drafts.filter((draft) => !draft.verdict);
  if (toJudge.length > 0) {
    try {
      const judged = await judgeItems(
        locale?.place ?? "",
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
      expires_at: expiresAt(draft, fetched),
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
      await recordPull({
        watchId: String(watch.id),
        hubId,
        ok: false,
        model: result.model,
        found: result.found,
        kept: 0,
        xPostsFetched: result.xPostsFetched,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        judgeTokens,
        error: error.message,
      });
      return outcome;
    }
    outcome.kept = (data ?? []).length;
  }

  outcome.ok = true;
  await supabaseAdmin.from("knowledge_watches").update({ last_error: null }).eq("id", watch.id);
  await recordPull({
    watchId: String(watch.id),
    hubId,
    ok: true,
    model: result.model,
    found: result.found,
    kept: outcome.kept,
    xPostsFetched: result.xPostsFetched,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    judgeTokens,
    error: null,
  });
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
  if (!process.env.XAI_API_KEY?.trim()) return { outcomes: [], note: "XAI_API_KEY is not configured" };
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
