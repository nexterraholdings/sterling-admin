"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ListingListItem, ListingStatus, ListingType } from "@/lib/commercial/types";
import { LISTING_STATUS_LABEL, LISTING_TYPE_LABEL } from "@/lib/commercial/types";
import {
  Avatar,
  EmptyState,
  FilterChip,
  FilterField,
  filterInputProps,
  formatRelativeTime,
  LoadMoreBar,
  personLabel,
  SectionCard,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest" },
  { value: "created_at", label: "Oldest" },
  { value: "-price", label: "Highest price" },
  { value: "price", label: "Lowest price" },
  { value: "title", label: "A → Z" },
];

const TYPE_FILTERS: { value: ListingType | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "sale", label: "Sale" },
  { value: "rent", label: "Rent" },
  { value: "deal", label: "Deal" },
];

const STATUS_FILTERS: { value: ListingStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "sold", label: "Sold" },
  { value: "expired", label: "Expired" },
];

const STATUS_BADGE_VARIANT: Record<ListingStatus, "emerald" | "amber" | "violet" | "default"> = {
  active: "emerald",
  pending: "amber",
  sold: "violet",
  expired: "default",
};

const TYPE_BADGE_VARIANT: Record<ListingType, "blue" | "default" | "rose"> = {
  sale: "blue",
  rent: "default",
  deal: "rose",
};

function formatPrice(price: number | null): string {
  if (price == null) return "Price not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    price
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex gap-2">
        <div className="h-6 w-14 rounded-full bg-zinc-800" />
        <div className="h-6 w-16 rounded-full bg-zinc-800" />
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

function ListingCard({ item }: { item: ListingListItem }) {
  const { listing, community, creator, lead_count } = item;
  return (
    <Link
      href={`/dashboard/listings/${listing.id}`}
      className="group block rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm transition hover:border-emerald-500/30 hover:bg-zinc-900/80 hover:shadow-md hover:shadow-emerald-500/5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={TYPE_BADGE_VARIANT[listing.listing_type]}>{LISTING_TYPE_LABEL[listing.listing_type]}</Badge>
        <Badge variant={STATUS_BADGE_VARIANT[listing.status]}>{LISTING_STATUS_LABEL[listing.status]}</Badge>
        {lead_count > 0 && <Badge variant="rose">{lead_count} lead{lead_count !== 1 ? "s" : ""}</Badge>}
      </div>

      <h3 className="mt-3 text-lg font-semibold leading-snug text-zinc-50 group-hover:text-emerald-100">
        {listing.title}
      </h3>

      <p className="mt-1.5 line-clamp-1 text-sm text-zinc-500">
        {[listing.address, community?.name].filter(Boolean).join(" · ") || "No address or community set"}
      </p>

      <p className="mt-2 text-sm font-semibold text-emerald-300">{formatPrice(listing.price)}</p>

      <div className="mt-4 flex items-center gap-3 border-t border-zinc-800/80 pt-4">
        <Avatar id={listing.created_by} person={creator} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-300">{personLabel(creator)}</p>
          <p className="text-xs text-zinc-500">Listed {formatRelativeTime(listing.created_at)}</p>
        </div>
        <span className="text-xs font-semibold text-emerald-400 opacity-0 transition group-hover:opacity-100">
          Open →
        </span>
      </div>
    </Link>
  );
}

function ListingTable({ items }: { items: ListingListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-4 py-3">Listing</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Community</th>
            <th className="px-4 py-3 text-right">Price</th>
            <th className="px-4 py-3 text-right">Leads</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80">
          {items.map(({ listing, community, lead_count }) => (
            <tr key={listing.id} className="transition hover:bg-zinc-900/60">
              <td className="max-w-xs px-4 py-3">
                <Link
                  href={`/dashboard/listings/${listing.id}`}
                  className="font-semibold text-zinc-100 hover:text-emerald-300"
                >
                  {listing.title}
                </Link>
                <p className="mt-0.5 truncate text-xs text-zinc-500">{listing.address}</p>
              </td>
              <td className="px-4 py-3">
                <Badge variant={TYPE_BADGE_VARIANT[listing.listing_type]}>
                  {LISTING_TYPE_LABEL[listing.listing_type]}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_BADGE_VARIANT[listing.status]}>
                  {LISTING_STATUS_LABEL[listing.status]}
                </Badge>
              </td>
              <td className="max-w-[8rem] truncate px-4 py-3 text-zinc-500">{community?.name ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{formatPrice(listing.price)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{lead_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ListingsListView() {
  const [search, setSearch] = useState("");
  const [listingType, setListingType] = useState<ListingType | "">("");
  const [status, setStatus] = useState<ListingStatus | "">("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const [items, setItems] = useState<ListingListItem[]>([]);
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
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
    if (search.trim()) params.set("search", search.trim());
    if (listingType) params.set("listingType", listingType);
    if (status) params.set("status", status);

    fetch(`/api/admin/listings?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load listings");
        setTotal(body.total);
        setItems((prev) => {
          const incoming = body.listings as ListingListItem[];
          if (page === 1) return incoming;
          const ids = new Set(prev.map((i) => i.listing.id));
          return [...prev, ...incoming.filter((i) => !ids.has(i.listing.id))];
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load listings"))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, [search, listingType, status, sort, page]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  const hasActiveFilters = !!(search.trim() || listingType || status);

  function clearFilters() {
    setSearch("");
    setListingType("");
    setStatus("");
    setPage(1);
  }

  const hasMore = items.length < total;

  function handleLoadMore() {
    if (loadingMore || loading || !hasMore) return;
    setPage((p) => p + 1);
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Find listings"
        description="Search brokerage listings by title or address, then narrow by type and status."
      >
        <FilterField label="Search by title or address">
          <input
            {...filterInputProps()}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Address, title, keyword…"
            autoComplete="off"
          />
        </FilterField>

        <div className="mt-4 flex flex-wrap gap-2">
          {TYPE_FILTERS.map((t) => (
            <FilterChip
              key={t.value || "all-types"}
              active={listingType === t.value}
              onClick={() => {
                setListingType(t.value);
                setPage(1);
              }}
              tone={t.value === "deal" ? "rose" : "violet"}
            >
              {t.label}
            </FilterChip>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <FilterChip
              key={s.value || "all-statuses"}
              active={status === s.value}
              onClick={() => {
                setStatus(s.value);
                setPage(1);
              }}
              tone="emerald"
            >
              {s.label}
            </FilterChip>
          ))}
          {hasActiveFilters && (
            <FilterChip active={false} onClick={clearFilters}>
              Clear all
            </FilterChip>
          )}
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-sm text-zinc-400">
          {loading ? (
            "Loading…"
          ) : (
            <>
              <span className="font-semibold text-zinc-200">{total}</span> listing{total !== 1 ? "s" : ""}
            </>
          )}
        </p>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Sort
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
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
      ) : items.length === 0 ? (
        <EmptyState
          title="No listings match"
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
              {items.map((item) => (
                <ListingCard key={item.listing.id} item={item} />
              ))}
            </div>
          ) : (
            <ListingTable items={items} />
          )}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900">
            <LoadMoreBar shown={items.length} total={total} loading={loadingMore} hasMore={hasMore} onLoadMore={handleLoadMore} />
          </div>
        </>
      )}
    </div>
  );
}
