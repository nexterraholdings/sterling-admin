"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import type { DiscussionListItem } from "@/lib/discussions/types";
import {
  Avatar,
  EmptyState,
  FilterChip,
  FilterField,
  filterInputProps,
  formatRelativeTime,
  formatShortDate,
  LifecyclePill,
  LiveBadge,
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
  { value: "-live_last_go_live_at", label: "Recently live" },
  { value: "-avg_rate", label: "Highest rated" },
  { value: "title", label: "A → Z" },
];

const LIFECYCLE_FILTER_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "bootstrap", label: "Bootstrap" },
  { value: "active", label: "Active" },
  { value: "grace", label: "Grace" },
  { value: "claimable", label: "Claimable" },
  { value: "auction", label: "Auction" },
  { value: "expired", label: "Expired" },
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

function DiscussionCard({ d, flaggedOnly }: { d: DiscussionListItem; flaggedOnly: boolean }) {
  const rating =
    d.rate_count > 0 && d.avg_rate != null ? `★ ${d.avg_rate.toFixed(1)} (${d.rate_count})` : "No ratings";

  return (
    <Link
      href={`/dashboard/discussions/${d.id}`}
      className="group block rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm transition hover:border-emerald-500/30 hover:bg-zinc-900/80 hover:shadow-md hover:shadow-emerald-500/5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <LifecyclePill status={d.lifecycle_status ?? "active"} />
        <LiveBadge active={d.is_live} />
        {(flaggedOnly || d.report_count > 0) && <ReportsBadge count={d.report_count} />}
      </div>

      <h3 className="mt-3 text-lg font-semibold leading-snug text-zinc-50 group-hover:text-emerald-100">
        {d.title}
      </h3>

      <p className="mt-1.5 line-clamp-1 text-sm text-zinc-500">
        {[d.location_hint, d.community?.name].filter(Boolean).join(" · ") || "No location or community set"}
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
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Rating</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-300">{rating}</p>
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

      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
        <span>
          {d.live_last_go_live_at
            ? `Last live ${formatShortDate(d.live_last_go_live_at)}`
            : "Never went live"}
        </span>
        <span className="font-semibold text-emerald-400 opacity-0 transition group-hover:opacity-100">
          Open →
        </span>
      </div>
    </Link>
  );
}

function DiscussionTable({
  discussions,
  flaggedOnly,
}: {
  discussions: DiscussionListItem[];
  flaggedOnly: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-4 py-3">Discussion</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Creator</th>
            <th className="px-4 py-3">Community</th>
            <th className="px-4 py-3 text-right">Comments</th>
            <th className="px-4 py-3 text-right">Rating</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80">
          {discussions.map((d) => (
            <tr key={d.id} className="transition hover:bg-zinc-900/60">
              <td className="max-w-xs px-4 py-3">
                <Link href={`/dashboard/discussions/${d.id}`} className="font-semibold text-zinc-100 hover:text-emerald-300">
                  {d.title}
                </Link>
                {d.location_hint && <p className="mt-0.5 truncate text-xs text-zinc-500">{d.location_hint}</p>}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  <LifecyclePill status={d.lifecycle_status ?? "active"} />
                  <LiveBadge active={d.is_live} />
                  {(flaggedOnly || d.report_count > 0) && <ReportsBadge count={d.report_count} />}
                </div>
              </td>
              <td className="px-4 py-3 text-zinc-400">{personLabel(d.creator)}</td>
              <td className="max-w-[8rem] truncate px-4 py-3 text-zinc-500">{d.community?.name ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{d.comment_count}</td>
              <td className="px-4 py-3 text-right text-zinc-300">
                {d.rate_count > 0 && d.avg_rate != null ? `★ ${d.avg_rate.toFixed(1)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DiscussionsListView({ flaggedOnly }: { flaggedOnly: boolean }) {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [communitySearch, setCommunitySearch] = useState("");
  const [creatorSearch, setCreatorSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lifecycleStatus, setLifecycleStatus] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
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
    if (communitySearch.trim()) params.set("community", communitySearch.trim());
    if (creatorSearch.trim()) params.set("creator", creatorSearch.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (lifecycleStatus) params.set("lifecycleStatus", lifecycleStatus);
    if (liveOnly) params.set("liveOnly", "1");
    if (flaggedOnly) params.set("minReports", "1");

    fetch(`/api/admin/discussions?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load hubs");
        setTotal(body.total);
        setDiscussions((prev) => {
          const incoming = body.discussions as DiscussionListItem[];
          if (page === 1) return incoming;
          const ids = new Set(prev.map((d) => d.id));
          return [...prev, ...incoming.filter((d) => !ids.has(d.id))];
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load hubs"))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, [search, city, communitySearch, creatorSearch, dateFrom, dateTo, lifecycleStatus, liveOnly, flaggedOnly, sort, page]);

  useEffect(() => {
    setPage(1);
  }, [flaggedOnly]);

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
    communitySearch.trim() ||
    creatorSearch.trim() ||
    dateFrom ||
    dateTo ||
    lifecycleStatus ||
    liveOnly
  );

  function clearFilters() {
    setSearch("");
    setCity("");
    setCommunitySearch("");
    setCreatorSearch("");
    setDateFrom("");
    setDateTo("");
    setLifecycleStatus("");
    setLiveOnly(false);
    setPage(1);
  }

  function applyLifecycleQuick(status: string) {
    setLifecycleStatus((prev) => (prev === status ? "" : status));
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
        description="Search by title, then narrow with quick filters. Open any card for lifecycle controls, hub content, and moderation."
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

        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip active={liveOnly} onClick={() => { setLiveOnly((v) => !v); setPage(1); }} tone="rose">
            Live now
          </FilterChip>
          <FilterChip active={lifecycleStatus === "bootstrap"} onClick={() => applyLifecycleQuick("bootstrap")} tone="violet">
            Bootstrap
          </FilterChip>
          <FilterChip active={lifecycleStatus === "active"} onClick={() => applyLifecycleQuick("active")} tone="emerald">
            Active
          </FilterChip>
          <FilterChip active={lifecycleStatus === "grace"} onClick={() => applyLifecycleQuick("grace")}>
            Grace
          </FilterChip>
          <FilterChip active={lifecycleStatus === "auction"} onClick={() => applyLifecycleQuick("auction")} tone="rose">
            Auction
          </FilterChip>
          {hasActiveFilters && (
            <FilterChip active={false} onClick={clearFilters}>
              Clear all
            </FilterChip>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-4 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
        >
          {showAdvanced ? "Hide advanced filters" : "More filters (community, creator, dates…)"}
        </button>

        {showAdvanced && (
          <div className="mt-4 grid gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <FilterField label="Community name">
              <input
                {...filterInputProps()}
                value={communitySearch}
                onChange={(e) => { setCommunitySearch(e.target.value); setPage(1); }}
                placeholder="Linked home community"
              />
            </FilterField>
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
            <FilterField label="Lifecycle">
              <select
                {...filterInputProps()}
                value={lifecycleStatus}
                onChange={(e) => { setLifecycleStatus(e.target.value); setPage(1); }}
              >
                {LIFECYCLE_FILTER_OPTIONS.map((o) => (
                  <option key={o.value || "all"} value={o.value}>{o.label}</option>
                ))}
              </select>
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
              {flaggedOnly ? " flagged" : ""} discussion{total !== 1 ? "s" : ""}
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
          title={flaggedOnly ? "Nothing in the moderation queue" : "No hubs match"}
          hint={
            flaggedOnly
              ? "When users report area hubs, they appear here."
              : "Try clearing filters or searching with a shorter keyword."
          }
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
                <DiscussionCard key={d.id} d={d} flaggedOnly={flaggedOnly} />
              ))}
            </div>
          ) : (
            <DiscussionTable discussions={discussions} flaggedOnly={flaggedOnly} />
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
