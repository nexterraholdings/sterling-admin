"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Flag,
  Layers,
  MessageSquare,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { DashboardActivityTabs, type ActivityItemType } from "@/components/dashboard/DashboardActivityTabs";
import type { DashboardMetrics } from "@/app/dashboard/lib/metrics";

type DashboardOverviewClientProps = {
  metrics: DashboardMetrics;
  activity: ActivityItemType[];
  alerts: ActivityItemType[];
  changes: ActivityItemType[];
};

const QUICK_ACTIONS = [
  {
    href: "/dashboard/moderation",
    label: "Moderation queue",
    description: "Review reports and take action",
    icon: Shield,
    tone: "rose" as const,
  },
  {
    href: "/dashboard/users",
    label: "User directory",
    description: "Profiles, roles, and cheats",
    icon: Users,
    tone: "blue" as const,
  },
  {
    href: "/dashboard/discussions",
    label: "Area hubs",
    description: "Discussions, live sessions, stewardship",
    icon: MessageSquare,
    tone: "violet" as const,
  },
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    description: "Growth, trends, and breakdowns",
    icon: BarChart3,
    tone: "emerald" as const,
  },
];

const toneRing: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  blue: "bg-blue-500/10 text-blue-300 ring-blue-500/20",
  violet: "bg-violet-500/10 text-violet-300 ring-violet-500/20",
  rose: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getPlatformStatus(metrics: DashboardMetrics) {
  if (metrics.pendingFlags > 0 || metrics.reportsToday > 3) {
    return {
      label: "Needs attention",
      tone: "amber" as const,
      detail: `${metrics.pendingFlags} pending report${metrics.pendingFlags !== 1 ? "s" : ""}${metrics.reportsToday > 0 ? ` · ${metrics.reportsToday} filed today` : ""}`,
    };
  }
  if (metrics.reportsToday > 0) {
    return {
      label: "Moderate load",
      tone: "blue" as const,
      detail: `${metrics.reportsToday} report${metrics.reportsToday !== 1 ? "s" : ""} filed today — queue is manageable`,
    };
  }
  return {
    label: "All clear",
    tone: "emerald" as const,
    detail: "No urgent moderation items in the queue",
  };
}

export function DashboardOverviewClient({
  metrics,
  activity,
  alerts,
  changes,
}: DashboardOverviewClientProps) {
  const status = getPlatformStatus(metrics);
  const hasUrgentWork = metrics.pendingFlags > 0 || metrics.reportsToday > 0;
  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Command header */}
      <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.08),transparent_50%)]" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-950/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                  <Zap className="h-3 w-3 text-emerald-400" />
                  Overview
                </span>
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${toneRing[status.tone]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.tone === "emerald" ? "bg-emerald-400" : status.tone === "amber" ? "bg-amber-400" : "bg-blue-400"} shadow-[0_0_0_3px_rgba(255,255,255,0.06)]`} />
                  {status.label}
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
                {getGreeting()}. Here&apos;s your platform pulse.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
                {status.detail}
                {metrics.activeUsers > 0 && (
                  <>
                    {" "}
                    Tracking{" "}
                    <span className="font-medium text-zinc-300">
                      {metrics.activeUsers.toLocaleString()} users
                    </span>
                    ,{" "}
                    <span className="font-medium text-zinc-300">
                      {metrics.totalPosts.toLocaleString()} posts
                    </span>
                    , and{" "}
                    <span className="font-medium text-zinc-300">
                      {metrics.totalCommunities} communities
                    </span>
                    .
                  </>
                )}
              </p>
              <p className="mt-3 text-xs text-zinc-500">{formattedDate}</p>
            </div>

            {hasUrgentWork && (
              <Link
                href="/dashboard/moderation"
                className="group shrink-0 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 transition hover:border-amber-500/40 hover:bg-amber-500/15 lg:max-w-xs"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-100">Review moderation queue</p>
                    <p className="mt-1 text-xs leading-5 text-amber-200/80">
                      {metrics.pendingFlags > 0
                        ? `${metrics.pendingFlags} pending report${metrics.pendingFlags !== 1 ? "s" : ""} waiting for action.`
                        : `${metrics.reportsToday} new report${metrics.reportsToday !== 1 ? "s" : ""} filed today.`}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                      Open queue
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Priority metrics — bento grid */}
      <section aria-label="Key metrics">
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <StatsCard
              variant="featured"
              title="Pending reports"
              value={String(metrics.pendingFlags)}
              change={metrics.pendingFlags > 0 ? "needs review" : "queue clear"}
              tone={metrics.pendingFlags > 0 ? "amber" : "emerald"}
              href="/dashboard/flagged-accounts"
              icon={<Flag className="h-4 w-4" />}
              subtitle={
                metrics.reportsThisWeek > 0
                  ? `${metrics.reportsThisWeek} filed this week`
                  : "No reports this week"
              }
            />
          </div>
          <div className="lg:col-span-4">
            <StatsCard
              variant="featured"
              title="Reports today"
              value={String(metrics.reportsToday)}
              change={metrics.reportsToday > 0 ? "active" : "none"}
              tone={metrics.reportsToday > 0 ? "rose" : "slate"}
              href="/dashboard/moderation"
              icon={<Shield className="h-4 w-4" />}
              subtitle={`${metrics.newUsersToday} new user${metrics.newUsersToday !== 1 ? "s" : ""} today`}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-1">
            <StatsCard
              variant="compact"
              title="Users"
              value={metrics.activeUsers.toLocaleString()}
              change=""
              tone="blue"
              href="/dashboard/users"
              icon={<Users className="h-3.5 w-3.5" />}
              subtitle={`+${metrics.newUsersThisWeek} this week`}
            />
            <StatsCard
              variant="compact"
              title="Posts"
              value={metrics.totalPosts.toLocaleString()}
              change=""
              tone="violet"
              icon={<Layers className="h-3.5 w-3.5" />}
              subtitle={`${metrics.totalCommunities} communities`}
            />
          </div>
        </div>
      </section>

      {/* Activity + quick actions */}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <DashboardActivityTabs activity={activity} alerts={alerts} changes={changes} />

        <aside className="space-y-4">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-50">Quick actions</h3>
            <p className="mt-1 text-xs text-zinc-500">Jump to common admin workflows</p>
            <ul className="mt-4 space-y-2">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <li key={action.href}>
                    <Link
                      href={action.href}
                      className="group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition hover:border-zinc-700 hover:bg-zinc-800/80"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${toneRing[action.tone]}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-zinc-200 group-hover:text-zinc-50">
                          {action.label}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-zinc-500">
                          {action.description}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-50">Audit trail</h3>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">
              {metrics.modActions.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Total logged admin actions</p>
            <Link
              href="/dashboard/audit-logs"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              View audit logs
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
