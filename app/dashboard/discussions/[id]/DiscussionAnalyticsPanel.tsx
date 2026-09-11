"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiscussionAnalyticsPayload, DiscussionRow, DiscussionTrendPoint } from "@/lib/discussions/types";
import {
  funnelPct,
  HUB_TAB_VIEW_LABELS,
} from "@/lib/discussions/mapDiscussionAnalytics";
import {
  EmptyState,
  LifecyclePill,
  SectionCard,
  formatRelativeTime,
} from "../discussionUi";
import { formatDiscussionDate } from "./discussionDetailTypes";

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        highlight ? "border-emerald-500/25 bg-emerald-500/5" : "border-zinc-800 bg-zinc-950/80"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {sub ? <p className="mt-0.5 text-xs font-medium text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function TrendBars({
  trend,
  field,
  max,
  colorClass,
}: {
  trend: DiscussionTrendPoint[];
  field: "views" | "posts";
  max: number;
  colorClass: string;
}) {
  return (
    <div className="mt-2 flex items-end gap-1">
      {trend.map((point) => {
        const val = point[field];
        const h = max > 0 ? Math.max(4, Math.round((val / max) * 100)) : 4;
        const day = point.day.slice(5);
        return (
          <div key={`${field}-${point.day}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-14 w-full items-end justify-center rounded-md bg-zinc-900/80 px-0.5">
              <div className={`w-full rounded-sm ${colorClass}`} style={{ height: `${h}%`, minHeight: 2 }} title={`${val}`} />
            </div>
            <span className="text-[9px] font-medium text-zinc-600">{day}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReachFunnel({ a }: { a: DiscussionAnalyticsPayload }) {
  const viewerToJoin = funnelPct(a.trackedViewerJoinCount, a.uniqueViewers);
  const memberEngage = funnelPct(a.engagedParticipantCount, a.memberCount);
  const untrackedJoins = Math.max(0, a.memberCount - a.trackedViewerJoinCount);

  if (a.uniqueViewers === 0 && a.memberCount === 0) {
    return (
      <p className="text-sm text-zinc-500">Opens and joins will show here once members discover this discussion.</p>
    );
  }

  return (
    <div className="space-y-4">
      {a.uniqueViewers > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-900/80 px-4 py-3 text-center sm:flex-nowrap">
          <div className="flex-1">
            <p className="text-lg font-bold tabular-nums text-zinc-100">{a.uniqueViewers}</p>
            <p className="text-[10px] font-semibold uppercase text-zinc-500">Viewers</p>
          </div>
          <span className="text-zinc-600">→</span>
          <div className="flex-1">
            <p className="text-lg font-bold tabular-nums text-zinc-100">{a.trackedViewerJoinCount}</p>
            <p className="text-[10px] font-semibold uppercase text-zinc-500">
              {viewerToJoin != null ? `${viewerToJoin}% join` : "Joined"}
            </p>
          </div>
          <span className="text-zinc-600">→</span>
          <div className="flex-1">
            <p className="text-lg font-bold tabular-nums text-emerald-400">{a.engagedParticipantCount}</p>
            <p className="text-[10px] font-semibold uppercase text-zinc-500">
              {memberEngage != null ? `${memberEngage}% engage` : "Engaged"}
            </p>
          </div>
        </div>
      ) : null}

      <ol className="space-y-3 text-sm">
        {a.uniqueViewers > 0 ? (
          <li className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
            <p className="font-semibold text-zinc-200">Tracked viewers</p>
            <p className="text-xs text-zinc-500">Unique hub/gate opens (once per member per day)</p>
            <p className="mt-1 tabular-nums text-zinc-300">{a.uniqueViewers.toLocaleString()}</p>
          </li>
        ) : null}
        {a.uniqueViewers > 0 ? (
          <li className="ml-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
            <p className="font-semibold text-zinc-200">Joined with a logged visit</p>
            <p className="text-xs text-zinc-500">
              {viewerToJoin != null ? `${viewerToJoin}% of viewers became members` : "Members who also have a view event"}
            </p>
            <p className="mt-1 tabular-nums text-zinc-300">
              {a.trackedViewerJoinCount} / {a.uniqueViewers}
            </p>
          </li>
        ) : null}
        {a.memberCount > 0 ? (
          <li className={`rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 ${a.uniqueViewers > 0 ? "ml-8" : ""}`}>
            <p className="font-semibold text-zinc-200">Engaged members</p>
            <p className="text-xs text-zinc-500">Posted on the feed</p>
            <p className="mt-1 tabular-nums text-zinc-300">
              {a.engagedParticipantCount} / {a.memberCount}
              {memberEngage != null ? ` (${memberEngage}%)` : ""}
            </p>
          </li>
        ) : null}
      </ol>

      {untrackedJoins > 0 ? (
        <p className="text-xs text-zinc-500">
          {untrackedJoins} member{untrackedJoins !== 1 ? "s" : ""} joined without a logged visit (direct invite, etc.).
        </p>
      ) : null}
    </div>
  );
}

type Props = {
  discussionId: string;
  discussion: DiscussionRow;
};

export function DiscussionAnalyticsPanel({ discussionId, discussion }: Props) {
  const [analytics, setAnalytics] = useState<DiscussionAnalyticsPayload | null>(null);
  const [trend, setTrend] = useState<DiscussionTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/discussions/${discussionId}/analytics`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load analytics");
        setAnalytics(body.analytics);
        setTrend(body.trend ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [discussionId]);

  const tabRows = useMemo(() => {
    if (!analytics) return [];
    return Object.entries(analytics.tabViews)
      .filter(([tab, count]) => count > 0 && tab !== "events" && tab !== "live_chat")
      .sort((a, b) => b[1] - a[1])
      .map(([tab, count]) => ({
        tab,
        label: HUB_TAB_VIEW_LABELS[tab] ?? tab.replace(/_/g, " "),
        count,
      }));
  }, [analytics]);

  const maxTrendViews = Math.max(1, ...trend.map((t) => t.views));
  const maxTrendPosts = Math.max(1, ...trend.map((t) => t.posts));

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-800" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>;
  }

  if (!analytics) {
    return (
      <EmptyState
        title="No analytics yet"
        hint="Hub views and tab opens appear after members use the hub."
      />
    );
  }

  const a = analytics;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <LifecyclePill status={discussion.lifecycle_status} />
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          Same metrics as the mobile steward analytics screen. Views and tab opens count once per member per day;
          steward/moderator self-use is excluded from reach where noted in product copy.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Hub views"
          value={a.viewCount.toLocaleString()}
          sub={`${a.uniqueViewers.toLocaleString()} unique`}
          highlight
        />
        <StatCard
          label="Members"
          value={a.memberCount.toLocaleString()}
          sub={`${a.engagedParticipantCount} posted`}
        />
        <StatCard
          label="Feed posts"
          value={discussion.comment_count.toLocaleString()}
          sub={`${a.topLevelPosts} top-level · ${a.replyPosts} replies`}
        />
        <StatCard
          label="Engagement score"
          value={Math.round(discussion.engagement_score ?? 0).toLocaleString()}
          sub={`${a.daysActive} days since created`}
        />
      </div>

      {(a.pollCount > 0 || a.pollVoteCount > 0) && (
        <SectionCard title="Polls" description="Polls created in this hub.">
          <p className="text-sm text-zinc-300">
            {a.pollCount} poll{a.pollCount !== 1 ? "s" : ""} · {a.pollVoteCount.toLocaleString()} total votes
          </p>
        </SectionCard>
      )}

      {(a.uniqueViewers > 0 || a.memberCount > 0) && (
        <SectionCard title="Reach funnel" description="Hub & gate — tracked viewer → join → engagement.">
          <ReachFunnel a={a} />
        </SectionCard>
      )}

      {trend.length > 0 && (
        <SectionCard title="Activity, last 14 days" description="Daily views and posts.">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Views</p>
          <TrendBars trend={trend} field="views" max={maxTrendViews} colorClass="bg-blue-500/80" />
          <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Posts</p>
          <TrendBars trend={trend} field="posts" max={maxTrendPosts} colorClass="bg-emerald-500/80" />
        </SectionCard>
      )}

      {tabRows.length > 0 && (
        <SectionCard title="Hub tab views" description="Unique member opens per tab (once per day each).">
          <ul className="space-y-2">
            {tabRows.map((row) => {
              const max = tabRows[0]?.count ?? 1;
              const pct = Math.round((row.count / max) * 100);
              return (
                <li key={row.tab}>
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>{row.label}</span>
                    <span className="tabular-nums">{row.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="Feed quality" description="Likes, pins, media, and moderation.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Likes" value={a.commentLikes.toLocaleString()} />
          <StatCard label="Pinned posts" value={a.pinnedPosts.toLocaleString()} />
          <StatCard label="With media" value={a.postsWithMedia.toLocaleString()} />
          {a.hiddenPosts > 0 ? (
            <StatCard label="Hidden" value={a.hiddenPosts.toLocaleString()} />
          ) : (
            <StatCard label="Hidden" value="0" />
          )}
        </div>
      </SectionCard>

      <SectionCard title="Hub content" description="Non-feed assets in the hub.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Updates" value={a.updatesCount.toLocaleString()} />
          <StatCard label="Media" value={a.mediaCount.toLocaleString()} />
          <StatCard label="Wiki sections" value={a.wikiSectionCount.toLocaleString()} />
          <StatCard label="Resources" value={a.resourcesCount.toLocaleString()} />
        </div>
      </SectionCard>

      {a.reportCount > 0 && (
        <SectionCard title="Trust" description="Reports filed against this hub.">
          <p className="text-sm text-rose-300">
            {a.reportCount} report{a.reportCount !== 1 ? "s" : ""} — resolve from the Overview trust panel or moderation
            queue.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Stewardship" description="Lifecycle deadlines from the hub record.">
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-[10px] uppercase text-zinc-500">Next check-in due</dt>
            <dd className="text-zinc-300">
              {discussion.check_in_due_at
                ? formatDiscussionDate(discussion.check_in_due_at)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-zinc-500">Last check-in</dt>
            <dd className="text-zinc-300">
              {discussion.last_check_in_at
                ? formatRelativeTime(discussion.last_check_in_at)
                : "Never"}
            </dd>
          </div>
          {discussion.grace_expires_at && (
            <div>
              <dt className="text-[10px] uppercase text-zinc-500">Grace ends</dt>
              <dd className="text-zinc-300">{formatDiscussionDate(discussion.grace_expires_at)}</dd>
            </div>
          )}
          {discussion.bootstrap_expires_at && (
            <div>
              <dt className="text-[10px] uppercase text-zinc-500">Bootstrap ends</dt>
              <dd className="text-zinc-300">{formatDiscussionDate(discussion.bootstrap_expires_at)}</dd>
            </div>
          )}
        </dl>
      </SectionCard>
    </div>
  );
}
