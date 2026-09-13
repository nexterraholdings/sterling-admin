"use client";

import { useState } from "react";
import { Tabs } from "@/components/dashboard/Tabs";
import { BarChart, HorizontalBar, ProgressRow } from "@/components/ui/BarChart";
import type { RoleDistribution, CategoryBreakdown, TimeSeriesPoint, TrendingHub, PropAccountsSummary } from "../lib/analytics";

type AnalyticsClientProps = {
  roleDistribution: RoleDistribution[];
  categoryBreakdown: CategoryBreakdown[];
  userGrowthTrend: TimeSeriesPoint[];
  accountActivityTrend: TimeSeriesPoint[];
  postTrend: TimeSeriesPoint[];
  reportTrend: TimeSeriesPoint[];
  statusCounts: Record<string, number>;
  postTypeEntries: [string, number][];
  marketEntries: [string, number][];
  trendingHubs: TrendingHub[];
  totalUsers: number;
  totalReports: number;
  totalPosts: number;
  activeAccounts: number;
  propAccounts: PropAccountsSummary;
};

const trendColors: Record<string, string> = {
  growth: "rgb(59 130 246 / 0.8)",
  activity: "rgb(139 92 246 / 0.8)",
  posts: "rgb(16 185 129 / 0.8)",
  reports: "rgb(245 158 11 / 0.8)",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-400",
  reviewed: "bg-blue-400",
  actioned: "bg-emerald-400",
  dismissed: "bg-zinc-600",
  resolved: "bg-emerald-400",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  actioned: "Actioned",
  dismissed: "Dismissed",
  resolved: "Resolved",
};

const listPalette = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];

export function AnalyticsClient(props: AnalyticsClientProps) {
  const [trendTab, setTrendTab] = useState("growth");

  const trendData =
    trendTab === "growth" ? props.userGrowthTrend :
    trendTab === "activity" ? props.accountActivityTrend :
    trendTab === "posts" ? props.postTrend :
    props.reportTrend;

  const maxHubActivity = Math.max(...props.trendingHubs.map((h) => h.recent_comment_count), 1);

  return (
    <div className="space-y-6">
      {/* Row 1: Trending hubs + User roles */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Trending hubs */}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-zinc-50">Trending hubs</h3>
              <p className="mt-0.5 text-sm text-zinc-400">Ranked by comment activity, last 7 days</p>
            </div>
          </div>
          <div className="mt-6 space-y-1">
            {props.trendingHubs.length > 0 ? (
              props.trendingHubs.map((hub, i) => (
                <div key={hub.id} className="rounded-lg px-3 py-2 hover:bg-zinc-800">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400">
                          {i + 1}
                        </span>
                        <span className="truncate text-sm font-medium text-zinc-300">{hub.title}</span>
                      </div>
                      {hub.location_hint && (
                        <p className="ml-7 truncate text-xs text-zinc-500">{hub.location_hint}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm text-zinc-200">{hub.recent_comment_count.toLocaleString()}</span>
                      <span className="w-16 text-right text-xs text-zinc-500">
                        {hub.participant_count.toLocaleString()} members
                      </span>
                    </div>
                  </div>
                  <div className="ml-7 mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${listPalette[i % listPalette.length]}`}
                      style={{
                        width: `${Math.max((hub.recent_comment_count / maxHubActivity) * 100, hub.recent_comment_count > 0 ? 2 : 0)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
                No hubs yet
              </div>
            )}
          </div>
        </div>

        {/* User role distribution */}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-zinc-50">User roles</h3>
              <p className="mt-0.5 text-sm text-zinc-400">
                {props.totalUsers.toLocaleString()} total users
              </p>
            </div>
          </div>
          <div className="mt-6">
            <HorizontalBar data={props.roleDistribution} />
          </div>
        </div>
      </div>

      {/* Row 2: Trend chart + Report status */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        {/* Trend chart */}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-zinc-50">
                {trendTab === "growth" ? "14-day trend" : "7-day trend"}
              </h3>
              <p className="mt-0.5 text-sm text-zinc-400">
                {trendTab === "growth" ? "New users per day" :
                 trendTab === "activity" ? "Posts + hub comments per day" :
                 trendTab === "posts" ? "Posts per day" :
                 "Reports per day"}
              </p>
            </div>
            <Tabs
              tabs={[
                { id: "growth", label: "User growth", color: "blue" },
                { id: "activity", label: "Activity", color: "violet" },
                { id: "posts", label: "Posts", color: "emerald" },
                { id: "reports", label: "Reports", color: "amber" },
              ]}
              defaultTab="growth"
              variant="segmented"
              size="sm"
              onChange={setTrendTab}
            />
          </div>
          <div className="mt-6" style={{ height: 200 }}>
            {trendData.some((d) => d.value > 0) ? (
              <BarChart
                data={trendData}
                color={trendColors[trendTab] ?? "rgb(100 116 139 / 0.8)"}
                height={200}
                showValues
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
                No data in this window
              </div>
            )}
          </div>
        </div>

        {/* Report status breakdown */}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-50">Report status</h3>
          <p className="mt-0.5 text-sm text-zinc-400">
            {props.totalReports.toLocaleString()} total
          </p>
          <div className="mt-6 space-y-3">
            {Object.entries(props.statusCounts).length > 0 ? (
              Object.entries(props.statusCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => {
                  const pct = props.totalReports > 0
                    ? Math.round((count / props.totalReports) * 100)
                    : 0;
                  return (
                    <div key={status} className="flex items-center justify-between rounded-xl bg-zinc-800/60 px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${statusColors[status] ?? "bg-zinc-600"}`} />
                        <span className="text-sm font-medium text-zinc-300 capitalize">
                          {statusLabels[status] ?? status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-zinc-50">{count.toLocaleString()}</span>
                        <span className="w-10 text-right text-xs text-zinc-500">{pct}%</span>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
                No reports yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Post types + Markets + Report categories */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Post types */}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-50">Post types</h3>
          <p className="mt-0.5 text-sm text-zinc-400">
            {props.totalPosts.toLocaleString()} total
          </p>
          <div className="mt-6 space-y-1">
            {props.postTypeEntries.length > 0 ? (
              props.postTypeEntries.map(([type, count], i) => (
                <ProgressRow
                  key={type}
                  label={type}
                  count={count}
                  percentage={props.totalPosts > 0 ? Math.round((count / props.totalPosts) * 100) : 0}
                  color={listPalette[i % listPalette.length]}
                />
              ))
            ) : (
              <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
                No posts yet
              </div>
            )}
          </div>
        </div>

        {/* Markets */}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-50">Markets</h3>
          <p className="mt-0.5 text-sm text-zinc-400">
            User operating markets
          </p>
          <div className="mt-6 space-y-1">
            {props.marketEntries.length > 0 ? (
              props.marketEntries.slice(0, 10).map(([market, count], i) => (
                <ProgressRow
                  key={market}
                  label={market}
                  count={count}
                  percentage={props.totalUsers > 0 ? Math.round((count / props.totalUsers) * 100) : 0}
                  color={listPalette[i % listPalette.length]}
                />
              ))
            ) : (
              <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
                No market data
              </div>
            )}
            {props.marketEntries.length > 10 && (
              <p className="px-3 pt-1 text-xs text-zinc-500">
                +{props.marketEntries.length - 10} more markets
              </p>
            )}
          </div>
        </div>

        {/* Report categories */}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-50">Report categories</h3>
          <p className="mt-0.5 text-sm text-zinc-400">
            {props.totalReports.toLocaleString()} total reports
          </p>
          <div className="mt-6 space-y-1">
            {props.categoryBreakdown.length > 0 ? (
              props.categoryBreakdown.map((cat, i) => (
                <ProgressRow
                  key={cat.name}
                  label={cat.name}
                  count={cat.count}
                  percentage={cat.percentage}
                  color={listPalette[i % listPalette.length]}
                />
              ))
            ) : (
              <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
                No reports filed yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Prop accounts, kept visibly separate from real-user numbers above */}
      <div className="rounded-3xl border border-dashed border-blue-500/30 bg-blue-500/[0.03] p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-50">
              Prop accounts
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300 ring-1 ring-blue-500/25">
                Seeded
              </span>
            </h3>
            <p className="mt-0.5 text-sm text-zinc-400">
              Admin-generated test accounts used to seed groups and hubs — excluded from every number above.
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total prop accounts", value: props.propAccounts.total },
            { label: "New this week", value: props.propAccounts.newThisWeek },
            { label: "Active this week", value: props.propAccounts.activeThisWeek },
            { label: "Total posts", value: props.propAccounts.totalPosts },
            { label: "Posts this week", value: props.propAccounts.postsThisWeek },
            { label: "Comments this week", value: props.propAccounts.commentsThisWeek },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-zinc-900/60 px-3 py-2.5 ring-1 ring-zinc-800">
              <p className="text-lg font-semibold tabular-nums text-zinc-100">{stat.value.toLocaleString()}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
