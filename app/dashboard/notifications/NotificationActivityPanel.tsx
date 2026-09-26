"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchNotificationActivity,
  type NotificationActivityRow,
  type NotificationTypeStat,
} from "@/app/dashboard/notifications/actions";
import { FilterChip, formatRelativeTime } from "@/components/admin/ui";
import { notificationTypeLabel } from "@/lib/notifications/systemNotificationCatalog";

const inputCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
    </div>
  );
}

export function NotificationActivityPanel() {
  const [rows, setRows] = useState<NotificationActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [windowCount, setWindowCount] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [statsTruncated, setStatsTruncated] = useState(false);
  const [typeStats, setTypeStats] = useState<NotificationTypeStat[]>([]);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback((nextType: string | null, nextSearch: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setRows([]);
    fetchNotificationActivity({ type: nextType, search: nextSearch, offset: 0, includeStats: true })
      .then((data) => {
        if (id !== requestId.current) return;
        setRows(data.rows);
        setTotal(data.total);
        setWindowCount(data.windowCount);
        setUnreadCount(data.unreadCount);
        setStatsTruncated(data.statsTruncated);
        setTypeStats(data.typeStats);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Load failed");
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load(typeFilter, debouncedSearch);
  }, [load, typeFilter, debouncedSearch]);

  async function loadMore() {
    const id = requestId.current;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await fetchNotificationActivity({
        type: typeFilter,
        search: debouncedSearch,
        offset: rows.length,
        includeStats: false,
      });
      if (id !== requestId.current) return;
      setRows((prev) => [...prev, ...data.rows]);
      setTotal(data.total);
    } catch (e: unknown) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      if (id === requestId.current) setLoadingMore(false);
    }
  }

  const visibleStats = typeStats.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Last 7 days" value={windowCount == null ? "—" : windowCount.toLocaleString()} />
        <Stat label="Still unread" value={unreadCount == null ? "—" : unreadCount.toLocaleString()} />
        <Stat label="Types in window" value={typeStats.length.toLocaleString()} />
      </div>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-50">Inbox</h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
              Rows stored in the notifications table. Counts cover the last 7 days
              {statsTruncated ? " (type mix is sampled from the newest 4,000)" : ""}.
            </p>
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 sm:max-w-md">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title…"
              className={`${inputCls} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={() => load(typeFilter, debouncedSearch)}
              disabled={loading}
              className="min-h-11 shrink-0 rounded-full border border-zinc-800 bg-zinc-950 px-4 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50 sm:min-h-0 sm:py-2"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip active={typeFilter == null} onClick={() => setTypeFilter(null)}>
            All types
          </FilterChip>
          {visibleStats.map((stat) => (
            <FilterChip
              key={stat.type}
              active={typeFilter === stat.type}
              onClick={() => setTypeFilter(stat.type)}
              tone="emerald"
            >
              {stat.type.replace(/_/g, " ")} · {stat.count.toLocaleString()}
            </FilterChip>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</p>
        )}

        <div className="mt-5 space-y-3 lg:hidden">
          {loading && rows.length === 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-zinc-800" />
            ))
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-zinc-800 px-4 py-12 text-center text-sm text-zinc-500">
              {typeFilter || debouncedSearch
                ? "No notifications match these filters."
                : "No notifications in the database yet."}
            </p>
          ) : (
            rows.map((row) => (
              <article key={row.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium text-zinc-100">{row.title}</p>
                  <time
                    dateTime={row.createdAt}
                    title={new Date(row.createdAt).toLocaleString()}
                    className="shrink-0 text-xs tabular-nums text-zinc-500"
                  >
                    {formatRelativeTime(row.createdAt)}
                  </time>
                </div>
                {row.body && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-500">{row.body}</p>}
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                  {row.isRead ? "Read" : "Unread"}
                </p>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-10 shrink-0 text-zinc-600">Type</dt>
                    <dd className="min-w-0 break-all font-mono text-emerald-300/90">{row.type}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-10 shrink-0 text-zinc-600">To</dt>
                    <dd className="min-w-0">
                      <Link href={`/dashboard/users?user=${row.userId}`} className="text-zinc-200 hover:text-white">
                        {row.recipientLabel}
                      </Link>
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-10 shrink-0 text-zinc-600">From</dt>
                    <dd className="min-w-0 text-zinc-400">
                      {row.actorId ? (
                        <Link href={`/dashboard/users?user=${row.actorId}`} className="hover:text-zinc-200">
                          {row.actorLabel}
                        </Link>
                      ) : (
                        <span className="text-zinc-600">System</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </div>

        <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-zinc-800 lg:block">
          <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
            <thead className="bg-zinc-950/80">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Message</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Type</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">To</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">From</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {loading && rows.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-3">
                      <div className="h-10 animate-pulse rounded-xl bg-zinc-800" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                    {typeFilter || debouncedSearch
                      ? "No notifications match these filters."
                      : "No notifications in the database yet."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-zinc-800/30">
                    <td className="max-w-md px-4 py-3">
                      <p className="font-medium text-zinc-100">{row.title}</p>
                      {row.body && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{row.body}</p>}
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                        {row.isRead ? "Read" : "Unread"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-emerald-300/90">{row.type}</p>
                      <p className="mt-1 max-w-[16rem] text-xs text-zinc-500">{notificationTypeLabel(row.type)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/users?user=${row.userId}`}
                        className="text-zinc-200 hover:text-white"
                      >
                        {row.recipientLabel}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {row.actorId ? (
                        <Link href={`/dashboard/users?user=${row.actorId}`} className="hover:text-zinc-200">
                          {row.actorLabel}
                        </Link>
                      ) : (
                        <span className="text-zinc-600">System</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-zinc-500">
                      <time dateTime={row.createdAt} title={new Date(row.createdAt).toLocaleString()}>
                        {formatRelativeTime(row.createdAt)}
                      </time>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-col gap-3 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
            {typeFilter ? ` ${typeFilter.replace(/_/g, " ")}` : ""}
          </p>
          {rows.length < total && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore || loading}
              className="min-h-11 rounded-full border border-zinc-800 bg-zinc-950 px-4 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
