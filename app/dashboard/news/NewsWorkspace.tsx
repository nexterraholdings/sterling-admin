"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchResolvedNews,
  fetchCandidates,
  fetchFullArticlePreview,
  saveOverride,
  clearOverride,
  type Market,
  type NewsOverride,
  type NewsCandidate,
  type NewsSelectionSource,
} from "./actions";
import { marketLabel } from "./state-labels";
import { AppNewsPreview } from "./AppNewsPreview";
import { AppNewsPagePreview } from "./AppNewsPagePreview";
import { FormattedArticleBody } from "./FormattedArticleBody";
import { isNewsApiTruncatedContent, sanitizeStoredArticleContent } from "@/lib/news/articleTextCleanup";
import { parseStoredArticleContent } from "@/lib/news/articleContentStorage";

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toPreviewStory(row: {
  title: string;
  description: string | null;
  source?: string | null;
  image_url?: string | null;
  article_url?: string | null;
  published_at?: string | null;
}) {
  return {
    title: row.title,
    description: row.description,
    source: row.source,
    image_url: row.image_url,
    article_url: row.article_url ?? null,
    published_at: row.published_at,
  };
}

function toEditableCandidate(story: {
  article_id?: string | null;
  article_url?: string | null;
  title?: string | null;
  description?: string | null;
  content?: string | null;
  source?: string | null;
  image_url?: string | null;
  published_at?: string | null;
} | null): NewsCandidate | null {
  if (!story?.title?.trim()) return null;
  const articleUrl = (story.article_url ?? story.article_id ?? "").trim();
  if (!articleUrl) return null;
  return {
    article_id: story.article_id ?? articleUrl,
    article_url: articleUrl,
    title: story.title.trim(),
    description: story.description ?? null,
    content: sanitizeStoredArticleContent(story.content, story.title.trim()),
    source: story.source ?? null,
    image_url: story.image_url ?? null,
    published_at: story.published_at ?? null,
  };
}

function StatusBadge({ hasOverride }: { hasOverride: boolean }) {
  return hasOverride ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
      Manual override
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-400 ring-1 ring-zinc-700">
      <span className="h-2 w-2 rounded-full bg-zinc-500" />
      Auto-selected
    </span>
  );
}

function CandidateCard({
  candidate,
  selected,
  isCurrent,
  onSelect,
}: {
  candidate: NewsCandidate;
  selected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-3 text-left transition ${
        selected
          ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30"
          : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 hover:bg-zinc-900"
      }`}
    >
      <div className="flex gap-3">
        {candidate.image_url ? (
          <img
            src={candidate.image_url}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl border border-zinc-800 object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12h-9" />
            </svg>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-medium text-zinc-100">{candidate.title}</p>
            {isCurrent ? (
              <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                Live
              </span>
            ) : selected ? (
              <span className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-300">
                Editing
              </span>
            ) : null}
          </div>
          {candidate.source ? (
            <p className="mt-1 text-[11px] text-zinc-500">{candidate.source}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

type NewsWorkspaceProps = {
  market: Market;
  dateUtc: string;
  initialOverride: NewsOverride | null;
  onClose: () => void;
  onChanged: (override: NewsOverride | null, message: string) => void;
};

export function NewsWorkspace({
  market,
  dateUtc,
  initialOverride,
  onClose,
  onChanged,
}: NewsWorkspaceProps) {
  const stateLabel = marketLabel(market.state);
  const editorRef = useRef<HTMLDivElement>(null);

  const [override, setOverride] = useState<NewsOverride | null>(initialOverride);
  const [draft, setDraft] = useState<NewsCandidate | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<NewsCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);

  const [livePreview, setLivePreview] = useState<NewsCandidate | null>(null);
  const [livePreviewLoading, setLivePreviewLoading] = useState(true);
  const [selectionSource, setSelectionSource] = useState<NewsSelectionSource>("none");
  const [articleEditorOpen, setArticleEditorOpen] = useState(false);
  const articleTextareaRef = useRef<HTMLTextAreaElement>(null);

  const isEditing = !!draft;
  const previewStory = draft ?? (override ? {
    title: override.title,
    description: override.description,
    content: override.content,
    source: override.source,
    image_url: override.image_url,
    article_url: override.article_url,
    published_at: override.published_at,
    article_id: override.article_id,
  } : livePreview);

  const effectiveUrl = override?.article_url ?? livePreview?.article_url ?? null;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (!articleEditorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setArticleEditorOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [articleEditorOpen]);

  useEffect(() => {
    if (!articleEditorOpen) return;
    requestAnimationFrame(() => {
      articleTextareaRef.current?.focus();
    });
  }, [articleEditorOpen]);

  useEffect(() => {
    let cancelled = false;
    setLivePreviewLoading(true);
    setCandidatesLoading(true);
    setCandidatesError(null);

    fetchResolvedNews({ state: market.state, dateUtc })
      .then(async (resolved) => {
        if (cancelled) return;
        if (!override) {
          setLivePreview(resolved.selectedArticle);
          setSelectionSource(resolved.selectionSource);
        }
        if (resolved.candidates.length > 0) {
          setCandidates(resolved.candidates);
          return;
        }
        const fresh = await fetchCandidates({ state: market.state, dateUtc });
        if (!cancelled) setCandidates(fresh);
      })
      .catch((err) => {
        if (!cancelled) {
          setCandidatesError(err instanceof Error ? err.message : "Failed to load stories");
          setLivePreview(null);
          setSelectionSource("none");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLivePreviewLoading(false);
          setCandidatesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [override, market.state, dateUtc]);

  async function beginEditing(story: Parameters<typeof toEditableCandidate>[0]) {
    const editable = toEditableCandidate(story);
    if (!editable) {
      setError("This story is missing a title or URL and cannot be edited.");
      return;
    }
    setError(null);
    setContentError(null);
    setDraft(editable);
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const needsFullBody =
      !editable.content ||
      isNewsApiTruncatedContent(story?.content ?? editable.content);
    if (!needsFullBody || !editable.article_url) return;

    setContentLoading(true);
    try {
      const result = await fetchFullArticlePreview({
        url: editable.article_url,
        title: editable.title,
      });
      if (result.error || !result.text) {
        setContentError(
          result.error ??
            "Only a NewsAPI snippet was available. Use Load from source URL or paste the full article.",
        );
        return;
      }
      setDraft((current) => (current ? { ...current, content: result.text } : current));
    } catch (err) {
      setContentError(err instanceof Error ? err.message : "Failed to load full article");
    } finally {
      setContentLoading(false);
    }
  }

  function cancelEditing() {
    setDraft(null);
    setError(null);
    setContentError(null);
    setArticleEditorOpen(false);
  }

  function handleEditCurrent() {
    beginEditing(
      override
        ? {
            article_id: override.article_id,
            article_url: override.article_url,
            title: override.title,
            description: override.description,
            content: override.content,
            source: override.source,
            image_url: override.image_url,
            published_at: override.published_at,
          }
        : livePreview,
    );
  }

  async function handleLoadFullContent() {
    if (!draft?.article_url) return;
    setContentLoading(true);
    setContentError(null);
    try {
      const result = await fetchFullArticlePreview({
        url: draft.article_url,
        title: draft.title,
      });
      if (result.error || !result.text) {
        setContentError(result.error ?? "Could not load full article text");
        return;
      }
      setDraft({ ...draft, content: result.text });
    } catch (err) {
      setContentError(err instanceof Error ? err.message : "Failed to load full article");
    } finally {
      setContentLoading(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveOverride({
        dateUtc,
        state: market.state,
        candidate: draft,
        reason,
      });
      setOverride(result);
      setDraft(null);
      setReason("");
      setArticleEditorOpen(false);
      setSelectionSource("override");
      onChanged(result, `Saved override for ${stateLabel}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!confirm(`Clear the manual override for ${stateLabel}? The app will go back to auto-selection.`)) return;
    setClearing(true);
    setError(null);
    try {
      await clearOverride({ dateUtc, state: market.state });
      setOverride(null);
      setDraft(null);
      onChanged(null, `Cleared override for ${stateLabel}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear override");
    } finally {
      setClearing(false);
    }
  }

  async function handleRefreshCandidates() {
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const result = await fetchCandidates({ state: market.state, dateUtc });
      setCandidates(result);
    } catch (err) {
      setCandidatesError(err instanceof Error ? err.message : "Failed to refresh candidates");
    } finally {
      setCandidatesLoading(false);
    }
  }

  const previewBodyText =
    draft?.content ??
    sanitizeStoredArticleContent(
      override?.content ?? livePreview?.content ?? null,
      previewStory?.title,
    );

  const articlePreviewBlocks = useMemo(
    () => parseStoredArticleContent(draft?.content ?? null, draft?.title),
    [draft?.content, draft?.title],
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950">
      {/* Header */}
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            All markets
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-lg font-semibold text-zinc-50 sm:text-xl">{stateLabel}</h1>
              <StatusBadge hasOverride={!!override} />
            </div>
            <p className="mt-0.5 text-sm text-zinc-500">{formatDate(dateUtc)} · UTC</p>
          </div>

          <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="hidden rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-700 sm:inline-flex"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !draft?.title.trim() || !draft?.article_url}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-40"
                >
                  {saving ? "Saving…" : override ? "Save changes" : "Publish override"}
                </button>
              </>
            ) : (
              <>
                {override ? (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={clearing}
                    className="hidden rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40 sm:inline-flex"
                  >
                    {clearing ? "Clearing…" : "Clear override"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleEditCurrent}
                  disabled={livePreviewLoading || (!override && !livePreview)}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-40"
                >
                  Edit story
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto grid h-full min-h-0 w-full max-w-[1600px] grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
          {/* Left: editor / current story */}
          <main
            ref={editorRef}
            className="min-h-0 overflow-y-auto overscroll-contain border-b border-zinc-800 lg:border-b-0 lg:border-r lg:border-zinc-800"
          >
            {isEditing && draft ? (
              <div className="space-y-5 p-4 sm:p-6 lg:p-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Editor</p>
                  <h2 className="mt-1 text-2xl font-semibold text-zinc-50">
                    {override ? "Update this override" : "Override auto selection"}
                  </h2>
                  <p className="mt-2 text-sm text-zinc-400">
                    Changes publish immediately to the mobile app for {stateLabel} on this date.
                  </p>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-300">Headline</span>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base text-zinc-50 outline-none ring-emerald-500/30 focus:border-emerald-500/50 focus:ring-2"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-300">Map card preview</span>
                  <p className="text-xs text-zinc-500">Short text shown on the map overlay before users tap Read more.</p>
                  <textarea
                    value={draft.description ?? ""}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
                    rows={3}
                    className="w-full resize-y rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-6 text-zinc-50 outline-none ring-emerald-500/30 focus:border-emerald-500/50 focus:ring-2"
                  />
                </label>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="text-sm font-medium text-zinc-300">Full article</span>
                      <p className="text-xs text-zinc-500">
                        Body text on the in-app news page — preview updates on the right.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {draft.article_url ? (
                        <button
                          type="button"
                          onClick={handleLoadFullContent}
                          disabled={contentLoading}
                          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 disabled:opacity-40"
                        >
                          {contentLoading ? "Loading…" : "Load from URL"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setArticleEditorOpen(true)}
                        className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                      >
                        Edit full screen
                      </button>
                    </div>
                  </div>

                  {contentError ? <p className="mt-3 text-sm text-rose-400">{contentError}</p> : null}

                  {contentLoading ? (
                    <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                      Fetching full article from source URL…
                    </div>
                  ) : draft.content?.trim() ? (
                    <p className="mt-4 line-clamp-6 text-sm leading-7 text-zinc-400 whitespace-pre-wrap">
                      {draft.content}
                    </p>
                  ) : (
                    <p className="mt-4 text-sm italic text-zinc-600">
                      No article body yet — load from URL or open the full-screen editor to paste.
                    </p>
                  )}

                  <p className="mt-3 text-xs text-zinc-600">
                    {(draft.content ?? "").length.toLocaleString()} characters
                  </p>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-300">Internal note (optional)</span>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why are you overriding today's pick?"
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-50 outline-none focus:border-emerald-500/50"
                  />
                </label>

                {draft.article_url ? (
                  <p className="text-xs text-zinc-500 break-all">
                    Source:{" "}
                    <a href={draft.article_url} target="_blank" rel="noreferrer" className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
                      {draft.article_url}
                    </a>
                  </p>
                ) : null}

                {error ? (
                  <div className="rounded-2xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-6 p-4 sm:p-6 lg:p-8">
                {livePreviewLoading ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/50">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                    <p className="text-sm text-zinc-500">Loading today's story…</p>
                  </div>
                ) : previewStory ? (
                  <>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Live story</p>
                      <h2 className="mt-2 text-2xl font-semibold leading-snug text-zinc-50 sm:text-3xl">
                        {previewStory.title}
                      </h2>
                      <p className="mt-3 text-sm text-zinc-400">
                        {override
                          ? "This manual override is what users see in the app right now."
                          : selectionSource === "auto"
                            ? "Auto-selected by the same resolver the mobile app uses."
                            : "Resolved story for this state and date."}
                      </p>
                    </div>

                    {previewStory.image_url ? (
                      <img
                        src={previewStory.image_url}
                        alt=""
                        className="max-h-72 w-full rounded-3xl border border-zinc-800 object-cover"
                      />
                    ) : null}

                    {previewStory.description ? (
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Map preview</p>
                        <p className="mt-2 text-sm leading-7 text-zinc-300">{previewStory.description}</p>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={handleEditCurrent}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 py-4 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                      </svg>
                      Edit or replace this story
                    </button>
                  </>
                ) : (
                  <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/50 p-8 text-center">
                    <p className="text-base font-medium text-zinc-300">No story for this date yet</p>
                    <p className="max-w-sm text-sm text-zinc-500">
                      Pick an alternative from the list on the right, or refresh once the app has requested news for {stateLabel}.
                    </p>
                  </div>
                )}

                {error ? (
                  <div className="rounded-2xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>
                ) : null}
              </div>
            )}
          </main>

          {/* Right: scrollable previews + candidates */}
          <aside className="min-h-0 overflow-y-auto overscroll-contain bg-zinc-900/40">
            <div className="space-y-6 p-4 sm:p-6">
              {previewStory ? (
                <section>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Map card preview
                  </p>
                  <AppNewsPreview
                    story={toPreviewStory(previewStory)}
                    stateLabel={stateLabel}
                    compact
                    showFullStory={false}
                  />
                </section>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                  Preview will appear when a story is selected
                </div>
              )}

              {previewStory ? (
                <section>
                  <AppNewsPagePreview
                    story={toPreviewStory(previewStory)}
                    stateLabel={stateLabel}
                    bodyText={previewBodyText}
                    loading={contentLoading}
                  />
                </section>
              ) : null}

              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Alternatives</p>
                    <p className="text-[11px] text-zinc-600">Tap one to start editing it</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefreshCandidates}
                    disabled={candidatesLoading}
                    className="rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
                  >
                    Refresh
                  </button>
                </div>

                <div className="space-y-2 pb-4">
                  {candidatesLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-20 animate-pulse rounded-2xl bg-zinc-800/80" />
                    ))
                  ) : candidatesError ? (
                    <div className="rounded-xl bg-rose-500/15 px-3 py-2 text-xs text-rose-300">{candidatesError}</div>
                  ) : candidates.length === 0 ? (
                    <p className="py-8 text-center text-sm text-zinc-500">No alternatives loaded</p>
                  ) : (
                    candidates.map((c, i) => (
                      <CandidateCard
                        key={c.article_id ?? c.article_url ?? i}
                        candidate={c}
                        selected={draft?.article_url === c.article_url}
                        isCurrent={!!effectiveUrl && effectiveUrl === c.article_url}
                        onSelect={() => beginEditing(c)}
                      />
                    ))
                  )}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile action bar */}
      {isEditing ? (
        <footer className="shrink-0 border-t border-zinc-800 bg-zinc-900/95 p-4 backdrop-blur-md sm:hidden">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={cancelEditing}
              className="flex-1 rounded-xl border border-zinc-800 py-3 text-sm font-medium text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !draft?.title.trim()}
              className="flex-1 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-3 text-sm font-semibold text-emerald-300 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Publish"}
            </button>
          </div>
        </footer>
      ) : null}

      {/* Full-screen article editor */}
      {articleEditorOpen && draft ? (
        <div className="fixed inset-0 z-[110] flex flex-col bg-zinc-950">
          <header className="shrink-0 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-md">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setArticleEditorOpen(false)}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                </svg>
                Done
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-100">Full article</p>
                <p className="truncate text-xs text-zinc-500">{draft.title}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {draft.article_url ? (
                  <button
                    type="button"
                    onClick={handleLoadFullContent}
                    disabled={contentLoading}
                    className="hidden rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 disabled:opacity-40 sm:inline-flex"
                  >
                    {contentLoading ? "Loading…" : "Load from URL"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !draft.title.trim() || !draft.article_url}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </header>

          {contentError ? (
            <div className="shrink-0 border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-300 sm:px-6">
              {contentError}
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-2">
            <div className="flex min-h-0 flex-1 flex-col border-b border-zinc-800 lg:border-b-0 lg:border-r">
              <div className="shrink-0 border-b border-zinc-800 px-4 py-2 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Source text</p>
                <p className="text-[11px] text-zinc-600">
                  Paragraphs separated by blank lines. Use ## for headings, - for bullets.
                </p>
              </div>
              <textarea
                ref={articleTextareaRef}
                value={draft.content ?? ""}
                onChange={(e) => setDraft({ ...draft, content: e.target.value || null })}
                disabled={contentLoading}
                placeholder={
                  contentLoading
                    ? "Fetching the full article from the source URL…"
                    : "Article text with paragraph breaks…"
                }
                className="min-h-[40vh] w-full flex-1 resize-none border-0 bg-zinc-950 px-4 py-4 font-mono text-sm leading-7 text-zinc-50 outline-none placeholder:text-zinc-600 disabled:opacity-60 sm:px-6 lg:min-h-0"
                spellCheck
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0A0A0A]">
              <div className="shrink-0 border-b border-white/10 px-4 py-2 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">App preview</p>
                <p className="text-[11px] text-zinc-600">How this renders in the mobile news page.</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {contentLoading ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
                    Loading full article…
                  </div>
                ) : articlePreviewBlocks.length > 0 ? (
                  <FormattedArticleBody blocks={articlePreviewBlocks} />
                ) : (
                  <p className="py-8 text-sm italic text-slate-500">
                    Formatted preview will appear here as you add content.
                  </p>
                )}
              </div>
            </div>
          </div>

          <footer className="shrink-0 border-t border-zinc-800 bg-zinc-900/80 px-4 py-2 text-xs text-zinc-500 sm:px-6">
            {(draft.content ?? "").length.toLocaleString()} characters · {articlePreviewBlocks.length} blocks · Esc to close
          </footer>
        </div>
      ) : null}
    </div>
  );
}
