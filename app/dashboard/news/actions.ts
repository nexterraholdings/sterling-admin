"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { sanitizeStoredArticleContent } from "@/lib/news/articleTextCleanup";
import { buildStoredArticleContent } from "@/lib/news/articleContentStorage";
import { normalizeStateAbbreviation, marketLabel } from "./state-labels";

export type NewsOverride = {
  id: string;
  date_utc: string;
  city: string | null;
  state: string | null;
  article_id: string | null;
  article_url: string | null;
  title: string;
  description: string | null;
  content: string | null;
  source: string | null;
  image_url: string | null;
  published_at: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewsCandidate = {
  article_id: string | null;
  article_url: string;
  title: string;
  description: string | null;
  content: string | null;
  source: string | null;
  image_url: string | null;
  published_at: string | null;
};

function normalizeCandidate(raw: any): NewsCandidate {
  const title = String(raw.title ?? "");
  return {
    article_id: raw.article_id ?? raw.id ?? null,
    article_url: raw.article_url ?? raw.url ?? "",
    title,
    description: raw.description ?? raw.summary ?? null,
    content: sanitizeStoredArticleContent(raw.content ? String(raw.content) : null, title),
    source: raw.source ?? raw.source_name ?? raw.publisher ?? null,
    image_url: raw.image_url ?? raw.image ?? raw.urlToImage ?? null,
    published_at: raw.published_at ?? raw.publishedAt ?? null,
  };
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export type Market = {
  state: string;
  requestCount: number;
  lastRequestedAt: string;
};

export async function fetchMarkets(): Promise<Market[]> {
  const { data, error } = await supabaseAdmin
    .from("market_news_requests")
    .select("state,request_count,last_requested_at")
    .order("last_requested_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    state: row.state,
    requestCount: row.request_count,
    lastRequestedAt: row.last_requested_at,
  }));
}

export async function addMarket(params: { state: string }): Promise<Market> {
  const state = normalizeStateAbbreviation(params.state);
  if (!state) throw new Error("State is required");

  const stateNorm = normalize(state);

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("market_news_requests")
    .select("state,request_count,last_requested_at")
    .eq("state_norm", stateNorm)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  if (existing) {
    return {
      state: existing.state,
      requestCount: existing.request_count,
      lastRequestedAt: existing.last_requested_at,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("market_news_requests")
    .insert({ city: null, state, request_count: 0 })
    .select("state,request_count,last_requested_at")
    .single();
  if (error) throw new Error(error.message);

  return {
    state: data.state,
    requestCount: data.request_count,
    lastRequestedAt: data.last_requested_at,
  };
}

export async function deleteMarket(params: { state: string }): Promise<void> {
  const admin = await getCurrentAdmin();
  const stateNorm = normalize(normalizeStateAbbreviation(params.state));

  const { error: overridesError } = await supabaseAdmin
    .from("market_news_overrides")
    .delete()
    .eq("state_norm", stateNorm);
  if (overridesError) throw new Error(overridesError.message);

  const { error } = await supabaseAdmin
    .from("market_news_requests")
    .delete()
    .eq("state_norm", stateNorm);
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: "delete_news_market",
    detail: `Removed state ${marketLabel(params.state)} from News`,
    actorId: admin.id,
    actorLabel: admin.email,
  });
}

export async function fetchOverride(params: {
  state: string;
  dateUtc: string;
}): Promise<NewsOverride | null> {
  const stateNorm = normalize(normalizeStateAbbreviation(params.state));

  const { data, error } = await supabaseAdmin
    .from("market_news_overrides")
    .select("*")
    .eq("date_utc", params.dateUtc)
    .eq("state_norm", stateNorm)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return data ?? null;
}

export async function fetchOverridesForDate(dateUtc: string): Promise<NewsOverride[]> {
  const { data, error } = await supabaseAdmin
    .from("market_news_overrides")
    .select("*")
    .eq("date_utc", dateUtc)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as NewsOverride[];
}

function getLocationHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function sortCandidates<T extends { publishedAt: string; url: string }>(articles: T[]): T[] {
  return [...articles].sort((a, b) => {
    const pubA = a.publishedAt || "";
    const pubB = b.publishedAt || "";
    if (pubA !== pubB) return pubB.localeCompare(pubA);
    return a.url.localeCompare(b.url);
  });
}

function getDailyArticleIndex(count: number, locationLabel: string, dateUtc: string): number {
  if (count <= 1) return 0;
  const utcDayNumber = Math.floor(new Date(`${dateUtc}T00:00:00.000Z`).getTime() / 86_400_000);
  const locationOffset = getLocationHash(locationLabel) % count;
  return (utcDayNumber + locationOffset) % count;
}

export type NewsSelectionSource = "override" | "auto" | "none";

export type ResolvedNewsResult = {
  selectedArticle: NewsCandidate | null;
  candidates: NewsCandidate[];
  selectionSource: NewsSelectionSource;
  selectedIndex: number | null;
};

function mapResolvedArticle(raw: unknown): NewsCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const articleUrl = String(row.url ?? row.article_url ?? "").trim();
  const title = String(row.title ?? "").trim();
  if (!articleUrl || !title) return null;
  return normalizeCandidate({
    ...row,
    article_url: articleUrl,
    article_id: row.id ?? row.article_id ?? articleUrl,
    image_url: row.imageUrl ?? row.image_url,
    published_at: row.publishedAt ?? row.published_at,
  });
}

async function fetchAutoArticleFromDb(params: {
  state: string;
  dateUtc: string;
}): Promise<NewsCandidate | null> {
  const stateNorm = normalize(normalizeStateAbbreviation(params.state));

  const { data: locked, error: lockedError } = await supabaseAdmin
    .from("market_news_daily_selections")
    .select("article_id,article_url,title,description,content,source,image_url,published_at,selection_source")
    .eq("date_utc", params.dateUtc)
    .eq("state_norm", stateNorm)
    .order("locked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lockedError) throw new Error(lockedError.message);
  if (locked?.article_url && locked?.title) {
    return {
      article_id: locked.article_id,
      article_url: locked.article_url,
      title: locked.title,
      description: locked.description,
      content: locked.content,
      source: locked.source,
      image_url: locked.image_url,
      published_at: locked.published_at,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("market_news_articles")
    .select("article_id,article_url,title,description,content,source,image_url,published_at")
    .eq("state_norm", stateNorm);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;

  type Row = (typeof data)[number] & { publishedAt: string; url: string };
  const candidates: Row[] = data.map((row: any) => ({
    ...row,
    publishedAt: row.published_at ?? "",
    url: row.article_url,
  }));

  const sorted = sortCandidates(candidates);
  const index = getDailyArticleIndex(sorted.length, marketLabel(params.state), params.dateUtc);
  const picked = sorted[index];

  return {
    article_id: picked.article_id,
    article_url: picked.article_url,
    title: picked.title,
    description: picked.description,
    content: picked.content,
    source: picked.source,
    image_url: picked.image_url,
    published_at: picked.published_at,
  };
}

/** Same resolver the mobile app uses — override, locked auto pick, or fresh auto pick. */
export async function fetchResolvedNews(params: {
  state: string;
  dateUtc: string;
}): Promise<ResolvedNewsResult> {
  const state = normalizeStateAbbreviation(params.state);
  if (!state) {
    return {
      selectedArticle: null,
      candidates: [],
      selectionSource: "none",
      selectedIndex: null,
    };
  }

  try {
    const { data, error } = await supabaseAdmin.functions.invoke("resolve-market-news", {
      body: { state, date_utc: params.dateUtc },
    });
    if (!error && data && typeof data === "object") {
      const body = data as {
        selectedArticle?: unknown;
        candidates?: unknown[];
        selectionSource?: NewsSelectionSource;
        selectedIndex?: number | null;
        error?: string;
      };
      if (!body.error) {
        const selectedArticle = mapResolvedArticle(body.selectedArticle);
        const candidates = (body.candidates ?? [])
          .map(mapResolvedArticle)
          .filter((c): c is NewsCandidate => !!c);
        const selectionSource = body.selectionSource
          ?? (selectedArticle ? "auto" : "none");
        return {
          selectedArticle,
          candidates,
          selectionSource,
          selectedIndex: body.selectedIndex ?? (selectedArticle ? 0 : null),
        };
      }
    }
  } catch {
    // Fall through to DB-only resolution below.
  }

  const selectedArticle = await fetchAutoArticleFromDb(params);
  return {
    selectedArticle,
    candidates: [],
    selectionSource: selectedArticle ? "auto" : "none",
    selectedIndex: selectedArticle ? 0 : null,
  };
}

export async function fetchAutoArticle(params: {
  state: string;
  dateUtc: string;
}): Promise<NewsCandidate | null> {
  const resolved = await fetchResolvedNews(params);
  return resolved.selectedArticle;
}

export async function fetchCandidates(params: {
  state: string;
  dateUtc?: string;
}): Promise<NewsCandidate[]> {
  const state = normalizeStateAbbreviation(params.state);
  if (!state) return [];

  if (params.dateUtc) {
    const resolved = await fetchResolvedNews({ state, dateUtc: params.dateUtc });
    if (resolved.candidates.length > 0) {
      return resolved.candidates;
    }
  }

  const { data, error } = await supabaseAdmin.functions.invoke("market-news", {
    body: { state },
  });
  if (error) throw new Error(error.message);

  const stories = Array.isArray(data) ? data : data?.stories ?? data?.articles ?? [];
  return stories.map(normalizeCandidate).filter((c: NewsCandidate) => c.article_url && c.title);
}

export type FullArticlePreviewResult = {
  text: string | null;
  source: string | null;
  error: string | null;
};

export async function fetchFullArticlePreview(params: {
  url: string;
  title: string;
}): Promise<FullArticlePreviewResult> {
  await getCurrentAdmin();

  const url = params.url?.trim();
  const title = params.title?.trim();
  if (!url) {
    return { text: null, source: null, error: "Missing article URL" };
  }

  const { data, error } = await supabaseAdmin.functions.invoke("article-reader", {
    body: { url, title: title || null },
  });
  if (error) {
    return { text: null, source: null, error: error.message };
  }

  const payload = data as {
    html?: string | null;
    text?: string | null;
    markdown?: string | null;
    source?: string | null;
    error?: string | null;
  };

  if (payload.error) {
    return { text: null, source: null, error: payload.error };
  }

  const text = buildStoredArticleContent(
    {
      html: payload.html,
      markdown: payload.markdown,
      text: payload.text,
    },
    { title: title || undefined },
  );

  if (!text?.trim()) {
    return {
      text: null,
      source: payload.source ?? null,
      error: "Could not extract article body. Deploy article-reader or open the original link.",
    };
  }

  return {
    text,
    source: payload.source ?? null,
    error: null,
  };
}

export async function saveOverride(params: {
  dateUtc: string;
  state: string;
  candidate: NewsCandidate;
  reason?: string;
}): Promise<NewsOverride> {
  const admin = await getCurrentAdmin();
  const state = normalizeStateAbbreviation(params.state);
  if (!state) throw new Error("State is required");
  const stateNorm = normalize(state);

  let articleContent = sanitizeStoredArticleContent(params.candidate.content, params.candidate.title);
  if (!articleContent && params.candidate.article_url) {
    const scraped = await fetchFullArticlePreview({
      url: params.candidate.article_url,
      title: params.candidate.title,
    });
    if (scraped.text) {
      articleContent = scraped.text;
    }
  }

  const payload = {
    date_utc: params.dateUtc,
    city: null,
    state,
    article_id: params.candidate.article_id,
    article_url: params.candidate.article_url,
    title: params.candidate.title,
    description: params.candidate.description,
    content: articleContent,
    source: params.candidate.source,
    image_url: params.candidate.image_url,
    published_at: params.candidate.published_at,
    reason: params.reason?.trim() || null,
    created_by: admin.id,
    updated_at: new Date().toISOString(),
  };

  await addMarket({ state });

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("market_news_overrides")
    .select("id")
    .eq("date_utc", params.dateUtc)
    .eq("state_norm", stateNorm)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const { data, error } = existing
    ? await supabaseAdmin
        .from("market_news_overrides")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await supabaseAdmin
        .from("market_news_overrides")
        .insert(payload)
        .select("*")
        .single();
  if (error) throw new Error(error.message);

  // Keep the locked daily selection in sync so fallback paths and older clients
  // serve the same edited story (lock RPC is insert-only / DO NOTHING).
  const selectionPayload = {
    date_utc: params.dateUtc,
    city: "",
    state,
    article_id: params.candidate.article_id,
    article_url: params.candidate.article_url,
    title: params.candidate.title,
    description: params.candidate.description,
    content: articleContent,
    source: params.candidate.source,
    image_url: params.candidate.image_url,
    published_at: params.candidate.published_at,
    selection_source: "override",
    locked_at: new Date().toISOString(),
  };
  const { data: existingSelection, error: selectionLookupError } = await supabaseAdmin
    .from("market_news_daily_selections")
    .select("id")
    .eq("date_utc", params.dateUtc)
    .eq("state_norm", stateNorm)
    .maybeSingle();
  if (selectionLookupError) throw new Error(selectionLookupError.message);

  const { error: selectionError } = existingSelection
    ? await supabaseAdmin
        .from("market_news_daily_selections")
        .update(selectionPayload)
        .eq("id", existingSelection.id)
    : await supabaseAdmin
        .from("market_news_daily_selections")
        .insert(selectionPayload);
  if (selectionError) throw new Error(selectionError.message);

  await logAdminAction({
    category: "admin",
    action: existing ? "update_news_override" : "create_news_override",
    detail: `${marketLabel(state)} — ${params.dateUtc}: "${params.candidate.title}"`,
    targetType: "market_news_override",
    targetId: data.id,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return data;
}

export async function clearOverride(params: {
  dateUtc: string;
  state: string;
}): Promise<void> {
  const admin = await getCurrentAdmin();
  const stateNorm = normalize(normalizeStateAbbreviation(params.state));

  const { error } = await supabaseAdmin
    .from("market_news_overrides")
    .delete()
    .eq("date_utc", params.dateUtc)
    .eq("state_norm", stateNorm);
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: "clear_news_override",
    detail: `${marketLabel(params.state)} — ${params.dateUtc}`,
    targetType: "market_news_override",
    actorId: admin.id,
    actorLabel: admin.email,
  });
}
