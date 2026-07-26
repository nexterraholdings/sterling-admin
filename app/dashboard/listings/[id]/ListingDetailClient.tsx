"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type {
  CommunityListingRow,
  LeadListItem,
  LeadStatus,
  ListingCommunityStub,
  ListingCreatorStub,
  ListingStatus,
} from "@/lib/commercial/types";
import { LEAD_STATUS_LABEL, LISTING_STATUS_LABEL, LISTING_TYPE_LABEL } from "@/lib/commercial/types";
import {
  Avatar,
  EmptyState,
  formatRelativeTime,
  formatShortDate,
  GhostLinkButton,
  personLabel,
  SectionCard,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_BADGE_VARIANT: Record<ListingStatus, "emerald" | "amber" | "violet" | "default"> = {
  active: "emerald",
  pending: "amber",
  sold: "violet",
  expired: "default",
};

const LEAD_BADGE_VARIANT: Record<LeadStatus, "amber" | "blue" | "emerald"> = {
  new: "amber",
  contacted: "blue",
  closed: "emerald",
};

const STATUS_TRANSITIONS: ListingStatus[] = ["active", "pending", "sold", "expired"];

function formatPrice(price: number | null): string {
  if (price == null) return "Not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    price
  );
}

function formatMetric(value: number | null, kind: "currency" | "percent"): string {
  if (value == null) return "—";
  if (kind === "percent") return `${value.toFixed(2)}%`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    value
  );
}

type DetailPayload = {
  listing: CommunityListingRow;
  community: ListingCommunityStub | null;
  creator: ListingCreatorStub | null;
  leads: LeadListItem[];
  leadCount: number;
};

export function ListingDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/listings/${id}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load listing");
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load listing"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(status: ListingStatus) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to update status");
      toast.success(`Listing marked ${LISTING_STATUS_LABEL[status].toLowerCase()}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/listings/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to delete listing");
      toast.success("Listing deleted");
      window.location.href = "/dashboard/listings";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete listing");
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-3xl bg-zinc-900" />
        <div className="h-64 animate-pulse rounded-3xl bg-zinc-900" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">
        {error ?? "Listing not found"}
      </div>
    );
  }

  const { listing, community, creator, leads, leadCount } = data;
  const isDeal = listing.listing_type === "deal";
  const osmEmbedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${listing.lng - 0.01},${listing.lat - 0.01},${listing.lng + 0.01},${listing.lat + 0.01}&layer=mapnik&marker=${listing.lat},${listing.lng}`;
  const googleMapsLink = `https://www.google.com/maps?q=${listing.lat},${listing.lng}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div>
          <GhostLinkButton href="/dashboard/listings">← All listings</GhostLinkButton>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant={listing.listing_type === "deal" ? "rose" : listing.listing_type === "rent" ? "default" : "blue"}>
              {LISTING_TYPE_LABEL[listing.listing_type]}
            </Badge>
            <Badge variant={STATUS_BADGE_VARIANT[listing.status]}>{LISTING_STATUS_LABEL[listing.status]}</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-zinc-50">{listing.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{listing.address}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Price</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-300">{formatPrice(listing.price)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Overview" description={listing.description ?? "No description provided."}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Community</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-100">{community?.name ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Leads</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-100">{leadCount}</p>
              </div>
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Listed</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-100">{formatShortDate(listing.created_at)}</p>
              </div>
            </div>

            {listing.photos && listing.photos.length > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {listing.photos.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt={`Listing photo ${i + 1}`} className="h-24 w-full rounded-xl object-cover" />
                ))}
              </div>
            )}
          </SectionCard>

          {isDeal && (
            <SectionCard
              title="Deal analysis"
              description="Investor figures submitted by the brokerage — only shown for deal listings."
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">After repair value</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-100">
                    {formatMetric(listing.after_repair_value, "currency")}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Est. rehab cost</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-100">
                    {formatMetric(listing.estimated_rehab_cost, "currency")}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Est. monthly rent</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-100">
                    {formatMetric(listing.estimated_monthly_rent, "currency")}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Cap rate</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-100">{formatMetric(listing.cap_rate, "percent")}</p>
                </div>
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Cash-on-cash return</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-100">
                    {formatMetric(listing.cash_on_cash_return, "percent")}
                  </p>
                </div>
              </div>
              {listing.investment_notes && (
                <p className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm leading-relaxed text-zinc-400">
                  {listing.investment_notes}
                </p>
              )}
            </SectionCard>
          )}

          <SectionCard title="Location" description="Pin on map and full address">
            <div className="overflow-hidden rounded-2xl border border-zinc-800">
              <iframe title="Listing map" src={osmEmbedSrc} className="h-56 w-full" style={{ border: 0 }} loading="lazy" />
            </div>
            <p className="mt-2 text-xs text-zinc-500">{listing.address}</p>
            <a
              href={googleMapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs font-medium text-emerald-400 hover:underline"
            >
              Open in Google Maps →
            </a>
          </SectionCard>

          <SectionCard title="Leads" description="Buyers/renters who expressed interest in this listing">
            {leads.length === 0 ? (
              <EmptyState title="No leads yet" hint="Interested users who tap “I'm interested” will show up here." />
            ) : (
              <div className="space-y-2">
                {leads.map(({ lead, contact }) => (
                  <div
                    key={lead.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{contact.full_name}</p>
                      <p className="text-xs text-zinc-500">
                        {[contact.phone_number, contact.email].filter(Boolean).join(" · ") || "No contact info"}
                      </p>
                      {lead.message && <p className="mt-1 text-xs text-zinc-400">“{lead.message}”</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={LEAD_BADGE_VARIANT[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
                      <span className="text-xs text-zinc-500">{formatRelativeTime(lead.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {leadCount > 0 && (
              <Link
                href={`/dashboard/leads?listingId=${listing.id}`}
                className="mt-4 inline-block text-xs font-semibold text-emerald-400 hover:underline"
              >
                Manage these leads in the inbox →
              </Link>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Listed by">
            <div className="flex items-center gap-3">
              <Avatar id={listing.created_by} person={creator} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-200">{personLabel(creator)}</p>
                <p className="text-xs text-zinc-500">Created {formatRelativeTime(listing.created_at)}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Status" description="Move this listing through its lifecycle">
            <div className="flex flex-col gap-2">
              {STATUS_TRANSITIONS.map((s) => (
                <Button
                  key={s}
                  variant={s === listing.status ? "secondary" : "outline"}
                  size="sm"
                  disabled={busy || s === listing.status}
                  onClick={() => changeStatus(s)}
                  className="justify-start"
                >
                  {LISTING_STATUS_LABEL[s]}
                  {s === listing.status && " (current)"}
                </Button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Danger zone" description="Permanently remove this listing">
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => setDeleteOpen(true)}>
              Delete listing
            </Button>
          </SectionCard>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this listing?</DialogTitle>
            <DialogDescription>
              This permanently removes “{listing.title}” and its associated leads. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete listing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
