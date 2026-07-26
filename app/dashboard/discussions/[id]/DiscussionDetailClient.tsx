"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DISCUSSION_HUB_TABS, type DiscussionHubTab } from "@/lib/discussions/types";
import {
  Avatar,
  LifecyclePill,
  LiveBadge,
  MetricPill,
  personLabel,
  ReportsBadge,
  formatRelativeTime,
} from "../discussionUi";
import { DiscussionOverviewPanel } from "./DiscussionOverviewPanel";
import { DiscussionHubPanel } from "./DiscussionHubPanel";
import { DiscussionAnalyticsPanel } from "./DiscussionAnalyticsPanel";
import type { DetailResponse } from "./discussionDetailTypes";

const MAIN_SECTIONS = [
  { id: "overview" as const, label: "Overview", hint: "Lifecycle, map, settings" },
  { id: "hub" as const, label: "Hub content", hint: "Feed, events, people" },
  { id: "analytics" as const, label: "Analytics", hint: "Views and trends" },
];

export function DiscussionDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<(typeof MAIN_SECTIONS)[number]["id"]>("overview");
  const [hubTab, setHubTab] = useState<DiscussionHubTab>("feed");
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/discussions/${id}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load hub");
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load hub"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      setActionError("Could not copy ID");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-zinc-800" />
        <div className="animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
          <div className="h-6 w-48 rounded bg-zinc-800" />
          <div className="mt-4 h-10 w-full max-w-lg rounded bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error ?? "Hub not found"}</div>
        <Link href="/dashboard/discussions" className="mt-4 inline-block text-sm text-zinc-400 hover:text-zinc-200">
          ← Back to discussions
        </Link>
      </div>
    );
  }

  const { discussion } = data;
  const pendingReports = data.reports.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6 pb-12">
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/dashboard/discussions" className="text-zinc-500 transition hover:text-zinc-300">
          Discussions
        </Link>
        <span className="text-zinc-700">/</span>
        <span className="truncate text-zinc-300">{discussion.title}</span>
      </nav>

      <header className="-mx-1 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <LifecyclePill status={discussion.lifecycle_status} />
              <LiveBadge active={discussion.is_live} />
              {pendingReports > 0 && <ReportsBadge count={pendingReports} />}
            </div>
            <h1 className="mt-3 text-2xl font-semibold leading-tight text-zinc-50 sm:text-3xl">{discussion.title}</h1>
            {discussion.description && (
              <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{discussion.description}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-2">
                <Avatar id={discussion.creator_id} person={discussion.creator} size="sm" />
                {personLabel(discussion.creator)}
              </span>
              {discussion.community?.name && <span>{discussion.community.name}</span>}
              {discussion.location_hint && <span>{discussion.location_hint}</span>}
              <span>Updated {formatRelativeTime(discussion.updated_at)}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={copyId}
              className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
            >
              {copiedId ? "Copied!" : "Copy ID"}
            </button>
            <Link
              href={`/dashboard/users?search=${discussion.creator?.username ?? hub.creator_id}`}
              className="rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              View creator
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricPill label="Participants" value={String(discussion.unique_participant_count ?? 0)} />
          <MetricPill label="Comments" value={String(discussion.comment_count)} />
          <MetricPill
            label="Rating"
            value={
              discussion.rate_count > 0 && discussion.avg_rate != null
                ? `★ ${discussion.avg_rate.toFixed(1)}`
                : "—"
            }
          />
          <MetricPill label="Engagement" value={String(discussion.engagement_score ?? 0)} />
        </div>

        <div className="mt-5 flex gap-1 overflow-x-auto rounded-2xl bg-zinc-950 p-1 ring-1 ring-zinc-800">
          {MAIN_SECTIONS.map((section) => {
            const active = mainTab === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setMainTab(section.id)}
                className={`min-w-[120px] flex-1 rounded-xl px-4 py-3 text-left transition ${
                  active ? "bg-zinc-800 shadow-sm" : "hover:bg-zinc-900"
                }`}
              >
                <p className={`text-sm font-semibold ${active ? "text-zinc-50" : "text-zinc-400"}`}>{section.label}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{section.hint}</p>
              </button>
            );
          })}
        </div>
      </header>

      {actionError && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-xs font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {mainTab === "overview" && (
        <DiscussionOverviewPanel
          id={id}
          data={data}
          onReload={load}
          onActionError={setActionError}
          onDeleted={() => router.push("/dashboard/discussions")}
        />
      )}

      {mainTab === "hub" && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {DISCUSSION_HUB_TABS.map((t) => {
              const active = hubTab === t.id;
              const blurb =
                t.id === "feed"
                  ? "Opinions"
                  : t.id === "live_chat"
                    ? "Live chat"
                    : t.label;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setHubTab(t.id)}
                  title={blurb}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
                    active
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                      : "bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <DiscussionHubPanel discussionId={id} tab={hubTab} onActionError={setActionError} />
        </div>
      )}

      {mainTab === "analytics" && (
        <DiscussionAnalyticsPanel discussionId={id} discussion={data.discussion} />
      )}
    </div>
  );
}
