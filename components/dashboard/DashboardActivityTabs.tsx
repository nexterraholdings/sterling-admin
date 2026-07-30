"use client";

import { useState } from "react";
import { Flag, Shield, UserPlus, FileText } from "lucide-react";
import { Tabs } from "@/components/dashboard/Tabs";

export type ActivityItemType = {
  id: string;
  type: "report" | "user" | "moderation" | "post";
  title: string;
  detail: string;
  timestamp: string;
  severity?: "low" | "medium" | "high" | "critical";
};

type DashboardActivityTabsProps = {
  activity: ActivityItemType[];
  alerts: ActivityItemType[];
  changes: ActivityItemType[];
};

const severityStyle: Record<string, { dot: string; badge: string; label: string }> = {
  low: { dot: "bg-zinc-500", badge: "bg-zinc-800 text-zinc-400", label: "Low" },
  medium: { dot: "bg-amber-400", badge: "bg-amber-500/15 text-amber-300", label: "Medium" },
  high: { dot: "bg-rose-400", badge: "bg-rose-500/15 text-rose-300", label: "High" },
  critical: { dot: "bg-rose-500", badge: "bg-rose-500/20 text-rose-200", label: "Critical" },
};

const typeConfig: Record<
  string,
  { icon: typeof Flag; ring: string; label: string }
> = {
  report: { icon: Flag, ring: "bg-amber-500/10 text-amber-300 ring-amber-500/20", label: "Report" },
  user: { icon: UserPlus, ring: "bg-blue-500/10 text-blue-300 ring-blue-500/20", label: "User" },
  moderation: { icon: Shield, ring: "bg-rose-500/10 text-rose-300 ring-rose-500/20", label: "Moderation" },
  post: { icon: FileText, ring: "bg-violet-500/10 text-violet-300 ring-violet-500/20", label: "Post" },
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700/80 bg-zinc-950/40 px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-500">
        <FileText className="h-5 w-5" />
      </span>
      <p className="mt-4 text-sm font-medium text-zinc-400">{message}</p>
      <p className="mt-1 text-xs text-zinc-600">Activity from the last 3 days appears here</p>
    </div>
  );
}

function ActivityTimeline({ items, empty }: { items: ActivityItemType[]; empty: string }) {
  if (items.length === 0) {
    return <EmptyState message={empty} />;
  }

  return (
    <ol className="relative space-y-0">
      <div className="absolute bottom-3 left-[19px] top-3 w-px bg-zinc-800" aria-hidden />

      {items.map((item, index) => {
        const config = typeConfig[item.type] ?? typeConfig.post;
        const Icon = config.icon;
        const severity = item.severity ? severityStyle[item.severity] : null;
        const isLast = index === items.length - 1;

        return (
          <li
            key={item.id}
            className={`group relative flex gap-4 py-3 ${isLast ? "" : ""}`}
          >
            <span
              className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${config.ring}`}
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 transition group-hover:border-zinc-700 group-hover:bg-zinc-900/80">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      {config.label}
                    </span>
                    {severity && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${severity.badge}`}>
                        {severity.label}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 font-medium text-zinc-100">{item.title}</p>
                  <p className="mt-0.5 text-sm text-zinc-500 line-clamp-2">{item.detail}</p>
                </div>
                <time className="shrink-0 text-xs tabular-nums text-zinc-600">{item.timestamp}</time>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DashboardActivityTabs({ activity, alerts, changes }: DashboardActivityTabsProps) {
  const [overviewTab, setOverviewTab] = useState("activity");

  const tabItems =
    overviewTab === "activity" ? activity :
    overviewTab === "alerts" ? alerts :
    changes;

  const emptyMessage =
    overviewTab === "activity" ? "No recent activity" :
    overviewTab === "alerts" ? "No active alerts" :
    "No recent changes";

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-50">Live feed</h3>
          <p className="mt-0.5 text-sm text-zinc-500">
            Reports, signups, and platform events from the last 3 days
          </p>
        </div>
        <Tabs
          tabs={[
            { id: "activity", label: "All", count: activity.length, color: "emerald" },
            { id: "alerts", label: "Alerts", count: alerts.length, color: "amber" },
            { id: "changes", label: "Signups", count: changes.length, color: "blue" },
          ]}
          defaultTab="activity"
          variant="segmented"
          size="sm"
          onChange={(tab) => setOverviewTab(tab as "activity" | "alerts" | "changes")}
        />
      </div>

      <div className="mt-6">
        <ActivityTimeline items={tabItems} empty={emptyMessage} />
      </div>
    </div>
  );
}
