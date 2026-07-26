"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { LeadListItem, LeadStatus } from "@/lib/commercial/types";
import { LEAD_STATUS_LABEL } from "@/lib/commercial/types";
import { EmptyState, FilterChip, FilterField, filterInputProps, formatRelativeTime, LoadMoreBar, SectionCard } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: LeadStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
];

const LEAD_BADGE_VARIANT: Record<LeadStatus, "amber" | "blue" | "emerald"> = {
  new: "amber",
  contacted: "blue",
  closed: "emerald",
};

const NEXT_STATUS: Record<LeadStatus, LeadStatus | null> = {
  new: "contacted",
  contacted: "closed",
  closed: null,
};

function RowSkeleton() {
  return (
    <TableRow>
      <TableCell colSpan={5}>
        <div className="h-5 animate-pulse rounded bg-zinc-800/60" />
      </TableCell>
    </TableRow>
  );
}

export function LeadsInboxView() {
  const searchParams = useSearchParams();
  const initialListingId = searchParams.get("listingId");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    const append = page > 1;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    if (initialListingId) params.set("listingId", initialListingId);

    fetch(`/api/admin/leads?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load leads");
        setTotal(body.total);
        setItems((prev) => {
          const incoming = body.leads as LeadListItem[];
          if (page === 1) return incoming;
          const ids = new Set(prev.map((i) => i.lead.id));
          return [...prev, ...incoming.filter((i) => !ids.has(i.lead.id))];
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load leads"))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, [search, status, page, initialListingId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  async function advanceStatus(leadId: string, nextStatus: LeadStatus) {
    setBusyId(leadId);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to update lead");
      toast.success(`Lead marked ${LEAD_STATUS_LABEL[nextStatus].toLowerCase()}`);
      setItems((prev) =>
        prev.map((it) => (it.lead.id === leadId ? { ...it, lead: { ...it.lead, status: nextStatus } } : it))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update lead");
    } finally {
      setBusyId(null);
    }
  }

  const hasActiveFilters = !!(search.trim() || status || initialListingId);
  const hasMore = items.length < total;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Find leads"
        description="Search by listing, buyer name, or message, then narrow by status."
      >
        <FilterField label="Search">
          <input
            {...filterInputProps()}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Listing title, name, message…"
            autoComplete="off"
          />
        </FilterField>
        <div className="mt-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <FilterChip
              key={s.value || "all"}
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
            <FilterChip
              active={false}
              onClick={() => {
                setSearch("");
                setStatus("");
                setPage(1);
                if (initialListingId) window.history.replaceState(null, "", "/dashboard/leads");
              }}
            >
              Clear all
            </FilterChip>
          )}
        </div>
      </SectionCard>

      <p className="px-1 text-sm text-zinc-400">
        {loading ? (
          "Loading…"
        ) : (
          <>
            <span className="font-semibold text-zinc-200">{total}</span> lead{total !== 1 ? "s" : ""}
          </>
        )}
      </p>

      {error ? (
        <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : !loading && items.length === 0 ? (
        <EmptyState
          title="No leads match"
          hint="When buyers or renters tap “I'm interested” on a listing, they appear here."
        />
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Listing</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
                : items.map(({ lead, listing, community, contact }) => {
                    const next = NEXT_STATUS[lead.status];
                    return (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <p className="font-semibold text-zinc-100">{contact.full_name}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {contact.phone_number && (
                              <a href={`tel:${contact.phone_number}`} className="hover:text-emerald-300">
                                {contact.phone_number}
                              </a>
                            )}
                            {contact.phone_number && contact.email && " · "}
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="hover:text-emerald-300">
                                {contact.email}
                              </a>
                            )}
                            {!contact.phone_number && !contact.email && "No contact info"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/dashboard/listings/${listing.id}`}
                            className="font-medium text-zinc-200 hover:text-emerald-300"
                          >
                            {listing.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-zinc-500">{community.name ?? "—"}</p>
                        </TableCell>
                        <TableCell className="max-w-xs whitespace-normal text-zinc-400">
                          {lead.message || <span className="text-zinc-600">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={LEAD_BADGE_VARIANT[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
                            <span className="text-xs text-zinc-500">{formatRelativeTime(lead.created_at)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {next ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === lead.id}
                              onClick={() => advanceStatus(lead.id, next)}
                            >
                              Mark {LEAD_STATUS_LABEL[next].toLowerCase()}
                            </Button>
                          ) : (
                            <span className="text-xs text-zinc-600">Closed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900">
          <LoadMoreBar
            shown={items.length}
            total={total}
            loading={loadingMore}
            hasMore={hasMore}
            onLoadMore={() => {
              if (!loadingMore && hasMore) setPage((p) => p + 1);
            }}
          />
        </div>
      )}
    </div>
  );
}
