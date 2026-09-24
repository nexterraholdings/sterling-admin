"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import type { DiscussionListItem } from "@/lib/discussions/types";
import {
  Avatar,
  EmptyState,
  FilterField,
  filterInputProps,
  formatRelativeTime,
  LoadMoreBar,
  personLabel,
  ReportsBadge,
  SectionCard,
} from "./discussionUi";

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest" },
  { value: "created_at", label: "Oldest" },
  { value: "-comment_count", label: "Most comments" },
  { value: "-engagement_score", label: "Top engagement" },
  { value: "title", label: "A → Z" },
];

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex gap-2">
        <div className="h-6 w-16 rounded-full bg-zinc-800" />
        <div className="h-6 w-12 rounded-full bg-zinc-800" />
      </div>
      <div className="mt-4 h-5 w-3/4 rounded bg-zinc-800" />
      <div className="mt-2 h-4 w-1/2 rounded bg-zinc-800" />
      <div className="mt-6 flex gap-3">
        <div className="h-10 w-10 rounded-full bg-zinc-800" />
        <div className="h-4 w-32 rounded bg-zinc-800" />
      </div>
    </div>
  );
}

function DiscussionCard({ d }: { d: DiscussionListItem }) {
  return (
    <Link
      href={`/dashboard/discussions/${d.id}`}
      className="group block rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm transition hover:border-emerald-500/30 hover:bg-zinc-900/80 hover:shadow-md hover:shadow-emerald-500/5"
    >
      {d.report_count > 0 && (
        <div className="mb-3">
          <ReportsBadge count={d.report_count} />
        </div>
      )}

      <h3 className="text-lg font-semibold leading-snug text-zinc-50 group-hover:text-emerald-100">
        {d.title}
      </h3>

      <p className="mt-1.5 line-clamp-1 text-sm text-zinc-500">
        {d.location_hint || "No location hint"}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Avatar id={d.creator_id} person={d.creator} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-300">{personLabel(d.creator)}</p>
          <p className="text-xs text-zinc-500">Created {formatRelativeTime(d.created_at)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-800/80 pt-4 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Members</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-300">{d.unique_participant_count ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Comments</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-300">{d.comment_count}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Engagement</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-300">{d.engagement_score ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end text-xs text-zinc-500">
        <span className="font-semibold text-emerald-400 opacity-0 transition group-hover:opacity-100">
          Open →
        </span>
      </div>
    </Link>
  );
}

function DiscussionTable({ discussions }: { discussions: DiscussionListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-4 py-3">Discussion</th>
            <th className="px-4 py-3">Creator</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3 text-right">Comments</th>
            <th className="px-4 py-3 text-right">Members</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80">
          {discussions.map((d) => (
            <tr key={d.id} className="transition hover:bg-zinc-900/60">
              <td className="max-w-xs px-4 py-3">
                <Link href={`/dashboard/discussions/${d.id}`} className="font-semibold text-zinc-100 hover:text-emerald-300">
                  {d.title}
                </Link>
                {d.report_count > 0 && (
                  <div className="mt-1">
                    <ReportsBadge count={d.report_count} />
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-zinc-400">{personLabel(d.creator)}</td>
              <td className="max-w-[8rem] truncate px-4 py-3 text-zinc-500">{d.location_hint ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{d.comment_count}</td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                {d.unique_participant_count ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DiscussionsListView() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [creatorSearch, setCreatorSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const [discussions, setDiscussions] = useState<DiscussionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    const append = page > 1;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort,
    });
    if (search.trim()) params.set("search", search.trim());
    if (city.trim()) params.set("city", city.trim());
    if (creatorSearch.trim()) params.set("creator", creatorSearch.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    fetch(`/api/admin/discussions?${params.toString()}`)
      .then(async (res) => {
        const text = await res.text();
        let body: { error?: string; discussions?: DiscussionListItem[]; total?: number } = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          throw new Error(res.ok ? "Hubs returned an invalid response" : `Could not load hubs (${res.status})`);
        }
        if (!res.ok) throw new Error(body.error || "Failed to load hubs");
        setTotal(body.total ?? 0);
        setDiscussions((prev) => {
          const incoming = (body.discussions ?? []) as DiscussionListItem[];
          if (page === 1) return incoming;
          const ids = new Set(prev.map((d) => d.id));
          return [...prev, ...incoming.filter((d) => !ids.has(d.id))];
        });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to load hubs";
        setError(message === "Failed to fetch" ? "Could not reach the hubs API. Restart SterlingAdmin and refresh." : message);
      })
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, [search, city, creatorSearch, dateFrom, dateTo, sort, page]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  const hasActiveFilters = !!(
    search.trim() ||
    city.trim() ||
    creatorSearch.trim() ||
    dateFrom ||
    dateTo
  );

  function clearFilters() {
    setSearch("");
    setCity("");
    setCreatorSearch("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const hasMore = discussions.length < total;

  function handleLoadMore() {
    if (loadingMore || loading || !hasMore) return;
    setPage((p) => p + 1);
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Find hubs"
        description="Search by title, then narrow by creator, place, or date."
      >
        <FilterField label="Search by title">
          <input
            {...filterInputProps()}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Neighborhood name, topic, keyword…"
            autoComplete="off"
          />
        </FilterField>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
          >
            Clear filters
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-4 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
        >
          {showAdvanced ? "Hide advanced filters" : "More filters (location, creator, dates…)"}
        </button>

        {showAdvanced && (
          <div className="mt-4 grid gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <FilterField label="Creator">
              <input
                {...filterInputProps()}
                value={creatorSearch}
                onChange={(e) => { setCreatorSearch(e.target.value); setPage(1); }}
                placeholder="@username or display name"
              />
            </FilterField>
            <FilterField label="City / location hint">
              <input
                {...filterInputProps()}
                value={city}
                onChange={(e) => { setCity(e.target.value); setPage(1); }}
                placeholder="e.g. Austin"
              />
            </FilterField>
            <FilterField label="Created from">
              <input
                type="date"
                {...filterInputProps()}
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
            </FilterField>
            <FilterField label="Created to">
              <input
                type="date"
                {...filterInputProps()}
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </FilterField>
          </div>
        )}
      </SectionCard>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-sm text-zinc-400">
          {loading ? "Loading…" : (
            <>
              <span className="font-semibold text-zinc-200">{total}</span>
              {" "}hub{total !== 1 ? "s" : ""}
            </>
          )}
        </p>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Sort
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <div className="flex rounded-xl border border-zinc-800 bg-zinc-950 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`rounded-lg px-3 py-2 transition ${viewMode === "cards" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            Cards
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`rounded-lg px-3 py-2 transition ${viewMode === "table" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            Table
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : discussions.length === 0 ? (
        <EmptyState
          title="No hubs match"
          hint="Try clearing filters or searching with a shorter keyword."
          action={
            hasActiveFilters ? (
              <button type="button" onClick={clearFilters} className="text-sm font-semibold text-emerald-400">
                Reset filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {viewMode === "cards" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {discussions.map((d) => (
                <DiscussionCard key={d.id} d={d} />
              ))}
            </div>
          ) : (
            <DiscussionTable discussions={discussions} />
          )}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900">
            <LoadMoreBar
              shown={discussions.length}
              total={total}
              loading={loadingMore}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
            />
          </div>
        </>
      )}

    </div>
  );
}
