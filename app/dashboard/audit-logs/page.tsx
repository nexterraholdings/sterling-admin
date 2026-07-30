"use client";

import { useState, useEffect } from "react";
import { Tabs } from "@/components/dashboard/Tabs";
import { Pagination } from "@/components/ui/Pagination";
import {
  fetchAuditLogs,
  fetchAuditLogCounts,
  type AuditCategory,
  type AuditLogEntry,
} from "./actions";

const AUDIT_PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, string> = {
  ban_user: "User banned",
  unban_user: "User unbanned",
  strike_user: "Moderation strike added",
  ban_device: "Device banned",
  unban_device: "Device unbanned",
  auto_hide_post: "Post auto-hidden (mass-reported)",
  auto_suspend_user: "User auto-suspended (mass-reported)",
  restore_post: "Auto-hidden post restored",
  login_success: "Admin sign-in succeeded",
  login_failed: "Admin sign-in failed",
  login_rate_limited: "Admin sign-in rate limited",
  logout: "Admin signed out",
  mfa_enrolled: "Admin MFA enrolled",
  mfa_verified: "Admin MFA verified",
};

function actionLabel(action: string): string {
  return (
    ACTION_LABELS[action] ??
    action
      .split("_")
      .map((w) => w[0]?.toUpperCase() + w.slice(1))
      .join(" ")
  );
}

const typeColors: Record<AuditCategory, string> = {
  moderation: "bg-amber-500/15 text-amber-300",
  admin: "bg-blue-500/15 text-blue-300",
  system: "bg-zinc-800 text-zinc-400",
  security: "bg-rose-500/15 text-rose-300",
};

const typeIcons: Record<AuditCategory, string> = {
  moderation: "⚑",
  admin: "◉",
  security: "⚙",
  system: "◌",
};

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatTimestamp(dateStr);
}

function LogRow({ log }: { log: AuditLogEntry }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-800/60 p-4 transition hover:border-zinc-700">
      <span className="mt-0.5 text-lg text-zinc-500">{typeIcons[log.category]}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-zinc-50">{actionLabel(log.action)}</p>
        <p className="mt-0.5 text-sm text-zinc-400">
          {log.detail ?? "—"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {log.actor_label && (
            <p className="text-xs text-zinc-500">by {log.actor_label}</p>
          )}
          {log.target_type && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              {log.target_type}
              {log.target_id && (
                <span className="text-zinc-500">· {log.target_id.slice(0, 8)}</span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeColors[log.category]}`}>
          {log.category}
        </span>
        <span className="whitespace-nowrap text-xs text-zinc-500" title={formatTimestamp(log.created_at)}>
          {formatRelativeTime(log.created_at)}
        </span>
      </div>
    </div>
  );
}

function LogRowSkeleton() {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-800/60 p-4">
      <div className="h-5 w-5 shrink-0 animate-pulse rounded bg-zinc-700" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-zinc-700" />
        <div className="h-3 w-64 animate-pulse rounded bg-zinc-700" />
      </div>
      <div className="h-5 w-20 shrink-0 animate-pulse rounded-full bg-zinc-700" />
    </div>
  );
}

const TABS: { id: string; label: string; color: "blue" | "amber" | "rose" | "violet" }[] = [
  { id: "all", label: "All events", color: "blue" },
  { id: "moderation", label: "Moderation", color: "amber" },
  { id: "admin", label: "Admin", color: "blue" },
  { id: "security", label: "Security", color: "rose" },
  { id: "system", label: "System", color: "violet" },
];

export default function AuditLogsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const category = activeTab === "all" ? undefined : (activeTab as AuditCategory);
  const totalPages = Math.max(1, Math.ceil(totalCount / AUDIT_PAGE_SIZE));

  useEffect(() => {
    fetchAuditLogCounts()
      .then(setCounts)
      .catch(() => setCounts(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAuditLogs(1, category, debouncedSearch)
      .then(({ logs, totalCount }) => {
        setLogs(logs);
        setTotalCount(totalCount);
        setCurrentPage(1);
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeTab, debouncedSearch]);

  function goToPage(page: number) {
    setLoading(true);
    fetchAuditLogs(page, category, debouncedSearch)
      .then(({ logs, totalCount }) => {
        setLogs(logs);
        setTotalCount(totalCount);
        setCurrentPage(page);
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function handleTabChange(tab: string) {
    setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
          Audit logs
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-50">Administrative history</h2>
      </div>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            tabs={TABS.map((t) => ({
              ...t,
              count: counts ? counts[t.id] : undefined,
            }))}
            defaultTab="all"
            variant="pills"
            size="sm"
            onChange={handleTabChange}
          />

          <div className="relative lg:w-72">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actor, action, target…"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 pl-10 pr-4 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:bg-zinc-900 focus:ring-2 focus:ring-zinc-700"
            />
            {search !== debouncedSearch && (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <svg
                  className="h-4 w-4 animate-spin text-zinc-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
              </span>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</p>
        )}

        {!error && (
          <div className="mt-6 space-y-2">
            {loading && logs.length === 0 ? (
              Array.from({ length: AUDIT_PAGE_SIZE }).map((_, i) => <LogRowSkeleton key={i} />)
            ) : logs.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
                {debouncedSearch ? "No audit events match your search" : "No audit events found"}
              </div>
            ) : (
              logs.map((log) => <LogRow key={log.id} log={log} />)
            )}
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={totalCount}
          pageSize={AUDIT_PAGE_SIZE}
        />
      </div>
    </div>
  );
}
