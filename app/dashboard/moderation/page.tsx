"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { ReportStatus, Report } from "@/lib/types";
import { Tabs } from "@/components/dashboard/Tabs";
import { Pagination } from "@/components/ui/Pagination";
import { StatsCard } from "@/components/dashboard/StatsCard";
import {
  fetchQueueStats,
  fetchReports,
  updateReportStatus,
  strikeUser,
  banUser,
  strikePostAuthor,
  banPostAuthor,
  restorePost,
  removePost,
  type EnrichedReport,
  type QueueStats,
} from "./actions";
import {
  fetchFlaggedAccounts,
  fetchUserReports,
  updateStrikes,
  dismissSuspicion,
  type FlaggedAccount,
  type Severity,
} from "@/app/dashboard/flagged-accounts/actions";
import {
  fetchActiveBans,
  fetchActiveDeviceBans,
  unbanUser,
  type ActiveBan,
  type ActiveDeviceBan,
  type BanType,
} from "@/app/dashboard/banned-users/actions";
import {
  fetchModerationAlerts,
  resolveModerationAlert,
  unbanUserFromAlert,
  fetchRecentUserActivity,
  type ModerationAlert,
  type AlertActionType,
  type AlertSeverity,
  type ActionEvent,
} from "./alerts-actions";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function joinedLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function getInitials(name?: string | null, username?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return (username ?? "??").slice(0, 2).toUpperCase();
}

const AVATAR_PALETTES = [
  "bg-violet-500/15 text-violet-300",
  "bg-blue-500/15 text-blue-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
];

function avatarColor(id: string | null | undefined): string {
  const safeId = id || "?";
  const n = safeId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTES[n % AVATAR_PALETTES.length];
}

const SEVERITY_BADGE: Record<Severity, string> = {
  Critical: "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40",
  High:     "bg-rose-500/15 text-rose-300",
  Medium:   "bg-amber-500/15 text-amber-300",
  Low:      "bg-zinc-800 text-zinc-400",
};

const SEVERITY_DOT: Record<Severity, string> = {
  Critical: "bg-rose-500",
  High:     "bg-rose-400",
  Medium:   "bg-amber-400",
  Low:      "bg-zinc-600",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-rose-500/20 text-rose-300",
  high:     "bg-rose-500/15 text-rose-300",
  medium:   "bg-amber-500/15 text-amber-300",
  low:      "bg-zinc-800 text-zinc-400",
};

// ---------------------------------------------------------------------------
// Reports helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  hate_speech:   "Hate Speech",
  harassment:    "Harassment",
  spam:          "Spam",
  misinformation:"Misinformation",
  nudity:        "Nudity",
  violence:      "Violence",
  impersonation: "Impersonation",
  crash:         "App Crash",
  ui_issue:      "UI Issue",
  performance:   "Performance",
  data_loss:     "Data Loss",
  other:         "Other",
};

const CATEGORY_BADGE: Record<string, string> = {
  hate_speech:    "bg-rose-500/15 text-rose-300",
  harassment:     "bg-rose-500/15 text-rose-300",
  violence:       "bg-rose-500/15 text-rose-300",
  nudity:         "bg-rose-500/15 text-rose-300",
  crash:          "bg-rose-500/15 text-rose-300",
  data_loss:      "bg-rose-500/15 text-rose-300",
  spam:           "bg-amber-500/15 text-amber-300",
  impersonation:  "bg-amber-500/15 text-amber-300",
  misinformation: "bg-amber-500/15 text-amber-300",
  ui_issue:       "bg-amber-500/15 text-amber-300",
  performance:    "bg-zinc-800 text-zinc-400",
  other:          "bg-zinc-800 text-zinc-400",
};

const STATUS_BADGE: Record<string, { cls: string; dot: string }> = {
  pending:   { cls: "bg-amber-500/15 text-amber-300",  dot: "bg-amber-400"   },
  reviewed:  { cls: "bg-blue-500/15 text-blue-300",     dot: "bg-blue-400"    },
  dismissed: { cls: "bg-zinc-800 text-zinc-400",        dot: "bg-zinc-600"    },
};

function StatusChip({ status }: { status: ReportStatus }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function ReportCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-800/60 p-4">
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <div className="h-5 w-24 rounded-full bg-zinc-700" />
            <div className="h-5 w-16 rounded-full bg-zinc-700" />
          </div>
          <div className="h-4 w-3/4 rounded bg-zinc-700" />
          <div className="h-3 w-1/2 rounded bg-zinc-700" />
        </div>
        <div className="h-4 w-20 shrink-0 rounded bg-zinc-700" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="h-5 w-20 rounded-full bg-zinc-700" />
        <div className="flex gap-2">
          <div className="h-7 w-28 rounded-full bg-zinc-700" />
          <div className="h-7 w-20 rounded-full bg-zinc-700" />
        </div>
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="h-4 w-32 rounded bg-zinc-700" />
      <div className="mt-4 h-9 w-16 rounded bg-zinc-700" />
      <div className="mt-2 h-3 w-24 rounded bg-zinc-700" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-4">
        <div className="h-11 w-11 shrink-0 rounded-full bg-zinc-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 rounded bg-zinc-700" />
          <div className="h-3 w-56 rounded bg-zinc-700" />
          <div className="h-3 w-32 rounded bg-zinc-700" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="h-6 w-16 rounded-full bg-zinc-700" />
          <div className="h-6 w-16 rounded-full bg-zinc-700" />
          <div className="h-8 w-20 rounded-full bg-zinc-700" />
        </div>
      </div>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-zinc-700" />
        <div className="h-5 w-14 rounded-full bg-zinc-700" />
      </div>
      <div className="mt-4 h-8 w-12 rounded bg-zinc-700" />
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="animate-pulse space-y-2 rounded-xl border border-zinc-800 bg-zinc-800/60 p-4">
      <div className="flex justify-between">
        <div className="h-3 w-20 rounded bg-zinc-700" />
        <div className="h-5 w-14 rounded-full bg-zinc-700" />
      </div>
      <div className="h-4 w-3/4 rounded bg-zinc-700" />
      <div className="h-3 w-24 rounded bg-zinc-700" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report card
// ---------------------------------------------------------------------------

function ReportCard({
  report,
  onAction,
}: {
  report: EnrichedReport;
  onAction?: (id: string, status: ReportStatus) => Promise<void>;
}) {
  const [busy, setBusy] = useState<ReportStatus | "strike" | "ban" | "restore" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [removed, setRemoved] = useState(false);

  async function handle(action: ReportStatus | "strike" | "ban" | "restore" | "remove") {
    if (!onAction && action !== "strike" && action !== "ban" && action !== "restore" && action !== "remove") return;
    setBusy(action);
    setError(null);

    try {
      if (action === "restore" && report.post_id) {
        await restorePost(report.post_id, report.id);
        setRestored(true);
      } else if (action === "remove" && report.post_id) {
        await removePost(report.id, report.post_id);
        setRemoved(true);
      } else if (action === "strike" && report.report_type === "post" && report.post_id) {
        await strikePostAuthor(report.post_id, report.id);
      } else if (action === "ban" && report.report_type === "post" && report.post_id) {
        await banPostAuthor(report.post_id, report.id);
      } else if (action === "strike" && report.reported_user_id) {
        await strikeUser(report.reported_user_id);
        await updateReportStatus(report.id, "reviewed");
      } else if (action === "ban" && report.reported_user_id) {
        await banUser(report.reported_user_id);
        await updateReportStatus(report.id, "reviewed");
      } else if (typeof action === "string" && ["reviewed", "dismissed"].includes(action)) {
        await onAction?.(report.id, action as ReportStatus);
      }
    } catch (error: any) {
      console.error(error);
      setError(error.message || "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const isAutoHidden = report.post?.status === "auto_hidden" && !restored;
  const priority = (report.review_priority ?? "").toLowerCase();

  const catLabel = CATEGORY_LABELS[report.category] || report.category;
  const catBadge = CATEGORY_BADGE[report.category]  || "bg-zinc-800 text-zinc-400";
  const isPending = report.status === "pending";

  const screenshotCount = report.screenshot_urls?.length ?? 0;
  const postImages = report.post?.image_urls ?? [];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-800/60 p-4 transition hover:border-zinc-700 hover:shadow-sm">
      {/* Top row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${catBadge}`}>
              {catLabel}
            </span>
            <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-300 capitalize">
              {report.report_type} report
            </span>
            {report.offense_label && (
              <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300">
                {report.offense_label}
              </span>
            )}
            {report.review_priority && (
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_BADGE[priority] ?? "bg-zinc-800 text-zinc-400"}`}>
                {report.review_priority}
              </span>
            )}
            {isAutoHidden && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                Auto-hidden — needs review
              </span>
            )}
          </div>

          {report.description ? (
            <p className="line-clamp-2 text-sm text-zinc-300">{report.description}</p>
          ) : (
            <p className="text-sm italic text-zinc-500">No description provided</p>
          )}

          {report.report_type === "post" && report.post ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs">
              <div className="flex items-center gap-2 text-zinc-500">
                {report.post.author_username && (
                  <span className="font-semibold text-zinc-400">@{report.post.author_username}</span>
                )}
                {report.post.community_name && (
                  <>
                    <span>·</span>
                    <span className="rounded-md bg-blue-500/15 px-2 py-0.5 font-medium text-blue-300">{report.post.community_name}</span>
                  </>
                )}
                {screenshotCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-zinc-500">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                        <path fillRule="evenodd" d="M2 4a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V4zm10 5.414-1.293-1.293a1 1 0 00-1.414 0L7 10.414 5.707 9.121a1 1 0 00-1.414 0L3 10.414V12h9v-2.586zM9 7a1 1 0 112 0 1 1 0 01-2 0z" clipRule="evenodd" />
                      </svg>
                      {screenshotCount}
                    </span>
                  </>
                )}
              </div>
              {report.post.body && (
                <p className="mt-1 line-clamp-2 text-zinc-400">{report.post.body}</p>
              )}
              {postImages.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {postImages.map((img, idx) => (
                    <a
                      key={idx}
                      href={img}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block"
                    >
                      <img
                        src={img}
                        alt={`Post image ${idx + 1}`}
                        className="h-20 w-20 rounded-lg border border-zinc-700 object-cover hover:opacity-80 transition"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs">
              <div className="flex items-center gap-2 text-zinc-500">
                {report.reported_user?.username && (
                  <span className="font-semibold text-zinc-400">@{report.reported_user.username}</span>
                )}
                {report.reported_user?.full_name && (
                  <>
                    <span>·</span>
                    <span className="text-zinc-400">{report.reported_user.full_name}</span>
                  </>
                )}
                {screenshotCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-zinc-500">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                        <path fillRule="evenodd" d="M2 4a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V4zm10 5.414-1.293-1.293a1 1 0 00-1.414 0L7 10.414 5.707 9.121a1 1 0 00-1.414 0L3 10.414V12h9v-2.586zM9 7a1 1 0 112 0 1 1 0 01-2 0z" clipRule="evenodd" />
                      </svg>
                      {screenshotCount}
                    </span>
                  </>
                )}
              </div>
              {screenshotCount > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {report.screenshot_urls?.map((img, idx) => (
                    <a
                      key={idx}
                      href={img}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block"
                    >
                      <img
                        src={img}
                        alt={`Screenshot ${idx + 1}`}
                        className="h-20 w-20 rounded-lg border border-zinc-700 object-cover hover:opacity-80 transition"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <span className="shrink-0 whitespace-nowrap text-xs text-zinc-500">{timeAgo(report.created_at)}</span>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <StatusChip status={report.status} />

        {isPending && onAction && (
          <div className="flex items-center gap-2">
            {isAutoHidden && report.post_id && (
              <button
                onClick={() => handle("restore")}
                disabled={busy !== null}
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:opacity-40"
              >
                {busy === "restore" ? "Restoring…" : "Restore post"}
              </button>
            )}
            <button
              onClick={() => handle("reviewed")}
              disabled={busy !== null}
              className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition hover:border-blue-500/50 hover:bg-blue-500/20 disabled:opacity-40"
            >
              {busy === "reviewed" ? "Updating…" : "Mark reviewed"}
            </button>
            {(report.report_type === "post" || report.report_type === "profile") && report.reported_user_id && (
              <>
                <button
                  onClick={() => handle("strike")}
                  disabled={busy !== null}
                  className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:border-amber-500/50 hover:bg-amber-500/20 disabled:opacity-40"
                >
                  {busy === "strike" ? "Striking…" : "Strike"}
                </button>
                <button
                  onClick={() => handle("ban")}
                  disabled={busy !== null}
                  className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20 disabled:opacity-40"
                >
                  {busy === "ban" ? "Banning…" : "Ban"}
                </button>
              </>
            )}
            {!removed && report.report_type === "post" && report.post_id && (
              <button
                onClick={() => handle("remove")}
                disabled={busy !== null}
                className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20 disabled:opacity-40"
              >
                {busy === "remove" ? "Removing…" : "Remove post"}
              </button>
            )}
            <button
              onClick={() => handle("dismissed")}
              disabled={busy !== null}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-40"
            >
              {busy === "dismissed" ? "Dismissing…" : "Dismiss"}
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-3 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports list (fetches its own data)
// ---------------------------------------------------------------------------

const MODERATION_PAGE_SIZE = 5;

function ReportsList({
  types,
  statuses,
  actionable = false,
  emptyLabel,
}: {
  types: ("post" | "profile" | "bug")[];
  statuses?: ReportStatus[];
  actionable?: boolean;
  emptyLabel?: string;
}) {
  const [reports, setReports] = useState<EnrichedReport[]>([]);
  const [loading, setLoading]  = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setReports([]);
    setCurrentPage(1);
    fetchReports(types, statuses)
      .then(setReports)
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAction(id: string, status: ReportStatus) {
    await updateReportStatus(id, status);
    if (status === "reviewed" || status === "dismissed") {
      setReports((prev) => prev.filter((r) => r.id !== id));
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <ReportCardSkeleton key={i} />)}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-zinc-700">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <p className="text-sm text-zinc-500">{emptyLabel ?? "Nothing here"}</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(reports.length / MODERATION_PAGE_SIZE));
  const paginatedReports = reports.slice(
    (currentPage - 1) * MODERATION_PAGE_SIZE,
    currentPage * MODERATION_PAGE_SIZE
  );

  return (
    <>
      <div className="space-y-3">
        {paginatedReports.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            onAction={actionable ? handleAction : undefined}
          />
        ))}
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={reports.length}
        pageSize={MODERATION_PAGE_SIZE}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Reports view
// ---------------------------------------------------------------------------

function ReportsView() {
  const [activeTab, setActiveTab] = useState("pending");
  const [stats, setStats] = useState<QueueStats | null>(null);

  useEffect(() => {
    fetchQueueStats().then(setStats).catch(console.error);
  }, []);

  const totalPending = stats ? stats.postPending + stats.profilePending : 0;

  const queues = [
    {
      title: "Post reports",
      value: stats ? String(stats.postPending) : "—",
      change: "",
      subtitle: stats && stats.postPending > 0 ? "Awaiting review" : "Queue clear",
      tone: stats && stats.postPending > 0 ? ("amber" as const) : ("emerald" as const),
    },
    {
      title: "Profile reports",
      value: stats ? String(stats.profilePending) : "—",
      change: "",
      subtitle: stats && stats.profilePending > 0 ? "Review flagged accounts" : "Queue clear",
      tone: stats && stats.profilePending > 0 ? ("amber" as const) : ("emerald" as const),
    },
    {
      title: "Bug reports",
      value: stats ? String(stats.bugPending) : "—",
      change: "",
      subtitle: stats && stats.bugPending > 0 ? "User-submitted bugs" : "No open bugs",
      tone: stats && stats.bugPending > 0 ? ("rose" as const) : ("emerald" as const),
    },
  ];

  return (
    <>
      {/* Queue stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {!stats
          ? Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
          : queues.map((q) => <StatsCard key={q.title} {...q} />)}
      </div>

      {/* Main content */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <Tabs
          tabs={[
            {
              id: "pending",
              label: "Pending review",
              count: stats ? totalPending : undefined,
              color: "amber",
            },
            { id: "reviewed",  label: "Reviewed",     color: "blue"    },
            { id: "dismissed", label: "Dismissed" },
            { id: "bugs",      label: "Bug reports",  count: stats?.bugPending, color: "rose" },
          ]}
          defaultTab="pending"
          variant="underline"
          onChange={setActiveTab}
        />

        <div className="mt-6">
          {activeTab === "pending" && (
            <ReportsList
              types={["post", "profile"]}
              statuses={["pending"]}
              actionable
              emptyLabel="No pending reports — queue is clear"
            />
          )}
          {activeTab === "reviewed" && (
            <ReportsList
              types={["post", "profile"]}
              statuses={["reviewed"]}
              emptyLabel="No reviewed reports yet"
            />
          )}
          {activeTab === "dismissed" && (
            <ReportsList
              types={["post", "profile"]}
              statuses={["dismissed"]}
              emptyLabel="No dismissed reports"
            />
          )}
          {activeTab === "bugs" && (
            <ReportsList
              types={["bug"]}
              actionable
              emptyLabel="No bug reports submitted"
            />
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Review panel (flagged accounts)
// ---------------------------------------------------------------------------

function ReviewPanel({
  account,
  onClose,
  onStrikesChanged,
  onSuspicionDismissed,
}: {
  account: FlaggedAccount;
  onClose: () => void;
  onStrikesChanged: (userId: string, newCount: number) => void;
  onSuspicionDismissed: (userId: string) => void;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [actionState, setActionState] = useState<"idle" | "working" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [localStrikes, setLocalStrikes] = useState(account.moderationStrikeCount);
  const [suspicionDismissed, setSuspicionDismissed] = useState(false);

  const severity = account.severity;

  useEffect(() => {
    fetchUserReports(account.id)
      .then(setReports)
      .catch(console.error)
      .finally(() => setReportsLoading(false));
  }, [account.id]);

  async function handleStrikeAction(newCount: number) {
    setActionState("working");
    setActionError(null);
    try {
      await updateStrikes(account.id, newCount);
      setLocalStrikes(newCount);
      onStrikesChanged(account.id, newCount);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
      setActionState("error");
      return;
    }
    setActionState("idle");
  }

  async function handleDismissSuspicion() {
    setActionState("working");
    setActionError(null);
    try {
      await dismissSuspicion(account.id);
      setSuspicionDismissed(true);
      onSuspicionDismissed(account.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
      setActionState("error");
      return;
    }
    setActionState("idle");
  }

  async function handleBanUser() {
    setActionState("working");
    setActionError(null);
    try {
      await banUser(account.id, `Banned from flagged accounts review (strikes: ${account.moderationStrikeCount})`);
      onStrikesChanged(account.id, 0);
      onClose();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
      setActionState("error");
    }
  }

  const initials = getInitials(account.full_name, account.username);
  const color = avatarColor(account.id);
  const showSuspicion = account.suspicionScore > 0 && !suspicionDismissed;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden bg-zinc-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-zinc-800 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${color}`}>
              {initials}
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-50">
                {account.full_name ?? account.username ?? "Unknown user"}
              </h2>
              <p className="mt-0.5 text-sm text-zinc-500">{account.email ?? "No email"}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEVERITY_BADGE[severity]}`}>
                  {severity}
                </span>
                <span className="text-xs text-zinc-500">
                  {localStrikes} strike{localStrikes !== 1 ? "s" : ""} · {account.account_role}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-800/60 px-6 py-4">
          <div className="flex items-center gap-3">
            {Array.from({ length: Math.max(localStrikes, 5) }).map((_, i) => (
              <div key={i} className={`h-2.5 w-2.5 rounded-full ${i < localStrikes ? SEVERITY_DOT[severity] : "bg-zinc-700"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => localStrikes > 0 && handleStrikeAction(localStrikes - 1)} disabled={localStrikes === 0 || actionState === "working"} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-40">
              − Strike
            </button>
            <button onClick={() => handleStrikeAction(localStrikes + 1)} disabled={actionState === "working"} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:border-amber-500/50 hover:bg-amber-500/20 disabled:opacity-40">
              + Strike
            </button>
            <button onClick={() => handleStrikeAction(0)} disabled={localStrikes === 0 || actionState === "working"} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:opacity-40">
              Clear all
            </button>
            <button onClick={handleBanUser} disabled={actionState === "working"} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20 disabled:opacity-40">
              {actionState === "working" ? "Banning…" : "Ban user"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {showSuspicion && (
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Suspicion signals · score {account.suspicionScore}
                </h3>
                <button
                  onClick={handleDismissSuspicion}
                  disabled={actionState === "working"}
                  className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-40"
                >
                  Dismiss suspicion flag
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {account.suspicionSignals.map((s, i) => (
                  <span key={i} className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Reports against this user
          </h3>
          {reportsLoading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <ReportSkeleton key={i} />)}</div>
          ) : reports.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
              No reports found for this user
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                  <div key={report.id} className="rounded-xl border border-zinc-800 bg-zinc-800/60 p-4 transition hover:border-zinc-700">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {report.category && <span className="text-xs font-semibold text-zinc-300 capitalize">{report.category.replace(/_/g, " ")}</span>}
                          <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-300 capitalize">{report.report_type} report</span>
                        </div>
                        {report.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{report.description}</p>}
                        <p className="mt-1.5 text-[11px] text-zinc-500">{report.created_at ? timeAgo(report.created_at) : "—"}</p>
                      </div>
                      {report.status && (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400 shrink-0">
                          {report.status}
                        </span>
                      )}
                    </div>
                  </div>
              ))}
            </div>
          )}
          {actionError && (
            <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{actionError}</p>
          )}
        </div>

        <div className="border-t border-zinc-800 px-6 py-4">
          <button onClick={onClose} className="w-full rounded-full border border-zinc-800 bg-zinc-900 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800">
            Close
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Flagged account card
// ---------------------------------------------------------------------------

function FlaggedCard({ account, onReview }: { account: FlaggedAccount; onReview: (a: FlaggedAccount) => void }) {
  const initials = getInitials(account.full_name, account.username);
  const color = avatarColor(account.id);

  return (
    <div className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm transition hover:border-zinc-700 hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${color}`}>
            {initials}
            <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-zinc-900 ${SEVERITY_DOT[account.severity]}`} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-zinc-50">{account.full_name ?? account.username ?? "Unknown user"}</p>
            <p className="mt-0.5 truncate text-sm text-zinc-500">{account.email ?? "No email on record"}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
              <span>Joined {joinedLabel(account.created_at)}</span>
              <span className="inline-block h-1 w-1 rounded-full bg-zinc-600" />
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {account.account_role}
              </span>
            </div>
            {(account.moderationStrikeCount > 0 || account.suspicionScore > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {account.moderationStrikeCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-900">
                    {account.moderationStrikeCount} strike{account.moderationStrikeCount !== 1 ? "s" : ""}
                  </span>
                )}
                {account.suspicionScore > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                    Suspicion score {account.suspicionScore}
                  </span>
                )}
                {account.suspicionSignals.map((s, i) => (
                  <span key={i} className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${SEVERITY_BADGE[account.severity]}`}>{account.severity}</span>
          <button onClick={() => onReview(account)} className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-1.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800">
            Review
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flagged accounts view
// ---------------------------------------------------------------------------

const FLAGGED_PAGE_SIZE = 10;

function FlaggedAccountsView() {
  const [accounts, setAccounts] = useState<FlaggedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityTab, setSeverityTab] = useState("critical");
  const [reviewing, setReviewing] = useState<FlaggedAccount | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchFlaggedAccounts()
      .then(setAccounts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleStrikesChanged(userId: string, newCount: number) {
    setAccounts((prev) =>
      prev
        .map((a) => (a.id === userId ? { ...a, moderationStrikeCount: newCount } : a))
        .filter((a) => a.moderationStrikeCount > 0 || a.suspicionScore > 0)
    );
    if (reviewing?.id === userId) {
      if (newCount === 0 && reviewing.suspicionScore === 0) setReviewing(null);
      else setReviewing((prev) => prev && { ...prev, moderationStrikeCount: newCount });
    }
  }

  function handleSuspicionDismissed(userId: string) {
    setAccounts((prev) =>
      prev
        .map((a) => (a.id === userId ? { ...a, suspicionScore: 0, suspicionSignals: [] } : a))
        .filter((a) => a.moderationStrikeCount > 0 || a.suspicionScore > 0)
    );
    if (reviewing?.id === userId && reviewing.moderationStrikeCount === 0) setReviewing(null);
  }

  const critical = accounts.filter((a) => a.severity === "Critical");
  const high     = accounts.filter((a) => a.severity === "High");
  const medium   = accounts.filter((a) => a.severity === "Medium");
  const low      = accounts.filter((a) => a.severity === "Low");

  const accountList = accounts.filter((a) => {
    if (severityTab === "critical") return a.severity === "Critical";
    if (severityTab === "high")     return a.severity === "High";
    if (severityTab === "medium")   return a.severity === "Medium";
    if (severityTab === "low")      return a.severity === "Low";
    return true;
  });

  const accountStats = [
    { title: "Total flagged", value: loading ? "—" : String(accounts.length), change: accounts.length === 0 ? "none" : "active", tone: "slate"   as const },
    { title: "Critical",      value: loading ? "—" : String(critical.length), change: "immediate",                              tone: "rose"    as const },
    { title: "High",          value: loading ? "—" : String(high.length),     change: "review today",                           tone: "amber"   as const },
    { title: "Medium / Low",  value: loading ? "—" : String(medium.length + low.length), change: "monitor",                    tone: "slate"   as const },
  ];

  return (
    <>
      {reviewing && (
        <ReviewPanel
          account={reviewing}
          onClose={() => setReviewing(null)}
          onStrikesChanged={handleStrikesChanged}
          onSuspicionDismissed={handleSuspicionDismissed}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : accountStats.map((s) => <StatsCard key={s.title} {...s} />)}
      </div>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <Tabs
          tabs={[
            { id: "critical", label: "Critical",   count: loading ? undefined : critical.length, color: "rose"  },
            { id: "high",     label: "High",       count: loading ? undefined : high.length,     color: "rose"  },
            { id: "medium",   label: "Medium",     count: loading ? undefined : medium.length,   color: "amber" },
            { id: "low",      label: "Low",        count: loading ? undefined : low.length,      color: "blue"  },
            { id: "all",      label: "All flagged",count: loading ? undefined : accounts.length, color: "amber" },
          ]}
          defaultTab="critical"
          variant="segmented"
          size="sm"
          onChange={(id) => { setSeverityTab(id); setCurrentPage(1); }}
        />

        <div className="mt-6 space-y-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
          ) : accountList.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
              No flagged accounts in this category
            </div>
          ) : (
            (() => {
              const paginatedAccounts = accountList.slice(
                (currentPage - 1) * FLAGGED_PAGE_SIZE,
                currentPage * FLAGGED_PAGE_SIZE
              );
              return (
                <>
                  {paginatedAccounts.map((account) => (
                    <FlaggedCard key={account.id} account={account} onReview={setReviewing} />
                  ))}
                </>
              );
            })()
          )}
        </div>
        <div className="mt-4">
          <Pagination
            currentPage={currentPage}
            totalPages={Math.max(1, Math.ceil(accountList.length / FLAGGED_PAGE_SIZE))}
            onPageChange={setCurrentPage}
            totalItems={accountList.length}
            pageSize={FLAGGED_PAGE_SIZE}
          />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Banned users view
// ---------------------------------------------------------------------------

function RowSkeleton({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-700" />
        </td>
      ))}
    </tr>
  );
}

function TableSkeleton({ headers }: { headers: string[] }) {
  return (
    <div className="-mx-6 -mb-6 overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-800 text-sm">
        <thead className="bg-zinc-800/60 text-left text-zinc-400">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-6 py-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {Array.from({ length: 5 }).map((_, i) => (
            <RowSkeleton key={i} cols={headers.length} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BAN_TYPE_LABELS: Record<BanType, string> = {
  general: "General",
  harassment: "Harassment",
  spam: "Spam",
  content_violation: "Content Violation",
};

const BAN_TYPE_BADGE: Record<BanType, string> = {
  general: "bg-zinc-800 text-zinc-400",
  harassment: "bg-rose-500/15 text-rose-300",
  spam: "bg-amber-500/15 text-amber-300",
  content_violation: "bg-rose-500/15 text-rose-300",
};

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ExpiresBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) {
    return (
      <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        Permanent
      </span>
    );
  }
  return <span className="text-zinc-400">{formatDate(expiresAt)}</span>;
}

const USER_BAN_HEADERS = ["User", "Ban Type", "Reason", "Banned On", "Expires", "Actions"];

function UserBansTable({
  bans,
  unbanningId,
  onUnban,
}: {
  bans: ActiveBan[];
  unbanningId: string | null;
  onUnban: (userId: string) => void;
}) {
  return (
    <div className="-mx-6 -mb-6 overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-800 text-sm">
        <thead className="bg-zinc-800/60 text-left text-zinc-400">
          <tr>
            {USER_BAN_HEADERS.map((h) => (
              <th key={h} className="px-6 py-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {bans.map((ban) => {
            const initials = getInitials(ban.full_name);
            const color = avatarColor(ban.user_id);
            return (
              <tr key={ban.ban_id} className="hover:bg-zinc-800/60 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${color}`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-50">{ban.full_name ?? "Unknown user"}</p>
                      <p className="truncate text-xs text-zinc-500">{ban.email ?? "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${BAN_TYPE_BADGE[ban.ban_type]}`}>
                    {BAN_TYPE_LABELS[ban.ban_type] ?? ban.ban_type}
                  </span>
                </td>
                <td className="max-w-xs px-6 py-4 text-zinc-400">
                  <p className="line-clamp-2">{ban.reason}</p>
                </td>
                <td className="px-6 py-4 text-zinc-400">{formatDate(ban.created_at)}</td>
                <td className="px-6 py-4">
                  <ExpiresBadge expiresAt={ban.expires_at} />
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => onUnban(ban.user_id)}
                    disabled={unbanningId === ban.user_id}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {unbanningId === ban.user_id ? "Unbanning…" : "Unban"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const DEVICE_BAN_HEADERS = ["Device", "Linked User", "Reason", "Banned On", "Expires", "Actions"];

function DeviceBansTable({
  bans,
  unbanningId,
  onUnban,
}: {
  bans: ActiveDeviceBan[];
  unbanningId: string | null;
  onUnban: (userId: string) => void;
}) {
  return (
    <div className="-mx-6 -mb-6 overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-800 text-sm">
        <thead className="bg-zinc-800/60 text-left text-zinc-400">
          <tr>
            {DEVICE_BAN_HEADERS.map((h) => (
              <th key={h} className="px-6 py-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {bans.map((ban) => (
            <tr key={ban.ban_id} className="hover:bg-zinc-800/60 transition-colors">
              <td className="px-6 py-4">
                <span className="font-mono text-xs text-zinc-400">{ban.device_id.slice(0, 16)}…</span>
              </td>
              <td className="px-6 py-4 text-zinc-50">
                {ban.full_name ?? <span className="text-zinc-500">Unlinked</span>}
              </td>
              <td className="max-w-xs px-6 py-4 text-zinc-400">
                <p className="line-clamp-2">{ban.reason}</p>
              </td>
              <td className="px-6 py-4 text-zinc-400">{formatDate(ban.created_at)}</td>
              <td className="px-6 py-4">
                <ExpiresBadge expiresAt={ban.expires_at} />
              </td>
              <td className="px-6 py-4">
                <button
                  onClick={() => ban.linked_user_id && onUnban(ban.linked_user_id)}
                  disabled={!ban.linked_user_id || unbanningId === ban.linked_user_id}
                  title={ban.linked_user_id ? undefined : "No linked user — cannot unban"}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {unbanningId === ban.linked_user_id ? "Unbanning…" : "Unban"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BannedUsersView() {
  const [activeTab, setActiveTab] = useState("users");
  const [userBans, setUserBans] = useState<ActiveBan[]>([]);
  const [deviceBans, setDeviceBans] = useState<ActiveDeviceBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refreshData = useCallback(() => {
    setLoading(true);
    setLastRefresh(new Date());
    Promise.all([fetchActiveBans(), fetchActiveDeviceBans()])
      .then(([bans, devices]) => {
        setUserBans(bans);
        setDeviceBans(devices);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load bans"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  async function handleUnban(userId: string) {
    setUnbanningId(userId);
    setError(null);
    try {
      await unbanUser(userId);
      setUserBans((prev) => prev.filter((b) => b.user_id !== userId));
      setDeviceBans((prev) => prev.filter((d) => d.linked_user_id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unban");
    } finally {
      setUnbanningId(null);
    }
  }

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs text-zinc-500">Last updated: {lastRefresh.toLocaleTimeString()}</p>
        <button
          onClick={refreshData}
          disabled={loading}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-4">
        <Tabs
          tabs={[
            { id: "users", label: "User bans", count: loading ? undefined : userBans.length, color: "rose" },
            { id: "devices", label: "Device bans", count: loading ? undefined : deviceBans.length, color: "amber" },
          ]}
          defaultTab="users"
          variant="underline"
          onChange={setActiveTab}
        />

        <div className="mt-6">
          {activeTab === "users" ? (
            loading ? (
              <TableSkeleton headers={USER_BAN_HEADERS} />
            ) : userBans.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
                No active user bans
              </div>
            ) : (
              <UserBansTable bans={userBans} unbanningId={unbanningId} onUnban={handleUnban} />
            )
          ) : loading ? (
            <TableSkeleton headers={DEVICE_BAN_HEADERS} />
          ) : deviceBans.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
              No active device bans
            </div>
          ) : (
            <DeviceBansTable bans={deviceBans} unbanningId={unbanningId} onUnban={handleUnban} />
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300 shadow-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-rose-200 hover:text-rose-100">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automated alerts (moderation_alerts)
// ---------------------------------------------------------------------------

const ALERT_SEVERITY_BADGE: Record<AlertSeverity, string> = {
  severe: "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40",
  standard: "bg-amber-500/15 text-amber-300",
};

const ALERT_ACTION_LABELS: Record<AlertActionType, string> = {
  message: "Messages",
  post: "Posts",
  comment: "Comments",
};

const ALERT_HEADERS = ["User", "Trigger", "Count", "Severity", "Timeout", "Flagged", "Actions"];

function AlertsTableSkeleton() {
  return <TableSkeleton headers={ALERT_HEADERS} />;
}

function ActionEventLabel({ event }: { event: ActionEvent }) {
  const label = ALERT_ACTION_LABELS[event.action_type as AlertActionType] ?? event.action_type;
  return (
    <li className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-zinc-300">{label}</span>
      <span className="text-xs text-zinc-500">{timeAgo(event.created_at)}</span>
    </li>
  );
}

function AlertActivityRow({ userId }: { userId: string }) {
  const [events, setEvents] = useState<ActionEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRecentUserActivity(userId)
      .then((data) => { if (!cancelled) setEvents(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load activity"); });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <tr className="bg-zinc-950/40">
      <td colSpan={ALERT_HEADERS.length} className="px-6 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Recent activity</p>
        {error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : events === null ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent recorded activity for this user.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {events.map((event) => (
              <ActionEventLabel key={event.id} event={event} />
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function AlertsTable({
  alerts,
  busyId,
  expandedId,
  onResolve,
  onUnban,
  onToggleDetails,
}: {
  alerts: ModerationAlert[];
  busyId: string | null;
  expandedId: string | null;
  onResolve: (alertId: string, status: "reviewed" | "dismissed") => void;
  onUnban: (alert: ModerationAlert) => void;
  onToggleDetails: (alertId: string) => void;
}) {
  return (
    <div className="-mx-6 -mb-6 overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-800 text-sm">
        <thead className="bg-zinc-800/60 text-left text-zinc-400">
          <tr>
            {ALERT_HEADERS.map((h) => (
              <th key={h} className="px-6 py-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {alerts.map((alert) => {
            const initials = getInitials(null, alert.user_username);
            const color = avatarColor(alert.user_id);
            const busy = busyId === alert.id;
            return (
              <React.Fragment key={alert.id}>
              <tr className="hover:bg-zinc-800/60 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${color}`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-50">{alert.user_username ?? "Unknown user"}</p>
                      <p className="truncate text-xs text-zinc-500">{alert.user_email ?? "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-zinc-400">
                  {ALERT_ACTION_LABELS[alert.action_type] ?? alert.action_type}
                  <span className="ml-1 text-xs text-zinc-500">({alert.window_label})</span>
                </td>
                <td className="px-6 py-4 text-zinc-50">{alert.action_count}</td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${ALERT_SEVERITY_BADGE[alert.severity]}`}>
                    {alert.severity}
                  </span>
                </td>
                <td className="px-6 py-4 text-zinc-400">
                  {alert.details?.timeout_minutes ? `${alert.details.timeout_minutes}m` : "—"}
                </td>
                <td className="px-6 py-4 text-zinc-400">{timeAgo(alert.created_at)}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onToggleDetails(alert.id)}
                      className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition hover:border-violet-500/50 hover:bg-violet-500/20"
                    >
                      {expandedId === alert.id ? "Hide" : "Details"}
                    </button>
                    <button
                      onClick={() => onUnban(alert)}
                      disabled={busy}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Unban
                    </button>
                    <button
                      onClick={() => onResolve(alert.id, "reviewed")}
                      disabled={busy}
                      className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition hover:border-blue-500/50 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reviewed
                    </button>
                    <button
                      onClick={() => onResolve(alert.id, "dismissed")}
                      disabled={busy}
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </td>
              </tr>
              {expandedId === alert.id && <AlertActivityRow userId={alert.user_id} />}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModerationAlertsView() {
  const [alerts, setAlerts] = useState<ModerationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refreshData = useCallback(() => {
    setLoading(true);
    setLastRefresh(new Date());
    fetchModerationAlerts()
      .then(setAlerts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load alerts"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  async function handleResolve(alertId: string, status: "reviewed" | "dismissed") {
    setBusyId(alertId);
    setError(null);
    try {
      await resolveModerationAlert(alertId, status);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update alert");
    } finally {
      setBusyId(null);
    }
  }

  function handleToggleDetails(alertId: string) {
    setExpandedId((prev) => (prev === alertId ? null : alertId));
  }

  async function handleUnban(alert: ModerationAlert) {
    setBusyId(alert.id);
    setError(null);
    try {
      await unbanUserFromAlert(alert.user_id);
      await resolveModerationAlert(alert.id, "reviewed");
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unban user");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs text-zinc-500">Last updated: {lastRefresh.toLocaleTimeString()}</p>
        <button
          onClick={refreshData}
          disabled={loading}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <AlertsTableSkeleton />
        ) : alerts.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
            No pending automated abuse alerts
          </div>
        ) : (
          <AlertsTable
            alerts={alerts}
            busyId={busyId}
            expandedId={expandedId}
            onResolve={handleResolve}
            onUnban={handleUnban}
            onToggleDetails={handleToggleDetails}
          />
        )}
      </div>

      {error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300 shadow-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-rose-200 hover:text-rose-100">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PageView = "reports" | "flagged" | "banned" | "alerts";

export default function ModerationPage() {
  const [pageView, setPageView] = useState<PageView>("reports");
  const [alertCount, setAlertCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    fetchModerationAlerts()
      .then((alerts) => setAlertCount(alerts.length))
      .catch(() => setAlertCount(undefined));
  }, [pageView]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
          <Tabs
            tabs={[
              { id: "reports", label: "Reports",          color: "amber" },
              { id: "flagged", label: "Flagged accounts", color: "rose"  },
              { id: "banned",  label: "Banned users",     color: "blue"  },
              { id: "alerts",  label: "Automated alerts", color: "violet", count: alertCount },
            ]}
            defaultTab="reports"
            variant="segmented"
            onChange={(id) => setPageView(id as PageView)}
          />
      </div>

      {pageView === "reports" && <ReportsView />}
      {pageView === "flagged" && <FlaggedAccountsView />}
      {pageView === "banned" && <BannedUsersView />}
      {pageView === "alerts" && <ModerationAlertsView />}
    </div>
  );
}
