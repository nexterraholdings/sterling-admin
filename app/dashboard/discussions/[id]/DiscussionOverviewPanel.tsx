"use client";

import Link from "next/link";
import { useState } from "react";
import type { DetailResponse } from "./discussionDetailTypes";
import { formatDiscussionDate, formatLiveDuration, profileLabel } from "./discussionDetailTypes";
import {
  DetailAccordion,
  FilterField,
  PrimaryButton,
  SectionCard,
  ModerationMenu,
  filterInputProps,
  formatRelativeTime,
} from "../discussionUi";

const LIFECYCLE_OPTIONS = ["bootstrap", "active", "grace", "claimable", "auction", "expired"] as const;

const REPORT_STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  reviewed: "bg-blue-500/15 text-blue-300",
  resolved: "bg-emerald-500/15 text-emerald-300",
  dismissed: "bg-zinc-800 text-zinc-400",
};

type Props = {
  id: string;
  data: DetailResponse;
  onReload: () => void;
  onActionError: (msg: string | null) => void;
  onDeleted?: () => void;
};

function formatAuctionSummary(auction: Record<string, unknown>): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  const ends = auction.ends_at ?? auction.end_at ?? auction.closes_at;
  if (ends) lines.push({ label: "Ends", value: formatDiscussionDate(String(ends)) });
  const high = auction.high_bid_cents ?? auction.current_bid_cents ?? auction.top_bid_cents;
  if (high != null) lines.push({ label: "High bid", value: `$${(Number(high) / 100).toFixed(2)}` });
  const bids = auction.bid_count ?? auction.bids_count;
  if (bids != null) lines.push({ label: "Bids", value: String(bids) });
  const status = auction.status ?? auction.state;
  if (status) lines.push({ label: "Status", value: String(status) });
  return lines;
}

export function DiscussionOverviewPanel({ id, data, onReload, onActionError, onDeleted }: Props) {
  const { discussion, ratings, reports, address, liveSessions, liveLimits, auction } = data;
  const pendingReports = reports.filter((r) => r.status === "pending");

  const [editTitle, setEditTitle] = useState(discussion.title);
  const [editDescription, setEditDescription] = useState(discussion.description ?? "");
  const [editLifecycle, setEditLifecycle] = useState(discussion.lifecycle_status);
  const [editLat, setEditLat] = useState(String(discussion.center_lat));
  const [editLng, setEditLng] = useState(String(discussion.center_lng));
  const [editHint, setEditHint] = useState(discussion.location_hint ?? "");
  const [communityId, setCommunityId] = useState(discussion.community_id ?? "");
  const [autoShareUpdates, setAutoShareUpdates] = useState(discussion.auto_share_updates);
  const [autoShareFeed, setAutoShareFeed] = useState(discussion.auto_share_feed);
  const [busy, setBusy] = useState(false);

  async function postJson(path: string, body?: unknown) {
    onActionError(null);
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : "{}",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      onReload();
    } catch (e) {
      onActionError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function patchJson(path: string, body: unknown) {
    onActionError(null);
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      onReload();
    } catch (e) {
      onActionError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveMetadata() {
    setBusy(true);
    onActionError(null);
    try {
      const res = await fetch(`/api/admin/discussions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      if (editLifecycle !== discussion.lifecycle_status) {
        const life = await fetch(`/api/admin/discussions/${id}/lifecycle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: editLifecycle }),
        });
        const lifeJson = await life.json();
        if (!life.ok) throw new Error(lifeJson.error || "Lifecycle update failed");
      }
      onReload();
    } catch (e) {
      onActionError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateReportStatus(reportId: string, status: string) {
    onActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update report");
      onReload();
    } catch (e) {
      onActionError(e instanceof Error ? e.message : "Failed to update report");
    } finally {
      setBusy(false);
    }
  }

  async function banCreator() {
    const creatorId = discussion.creator_id;
    if (!creatorId) return;
    const reason = window.prompt("Ban reason (shown in audit log):", "Violation of platform rules")?.trim();
    if (reason === null) return;
    if (!confirm(`Ban ${profileLabel(discussion.creator)} from the platform? This also bans their devices.`)) return;
    onActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${creatorId}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || "Violation of platform rules" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ban failed");
      onReload();
    } catch (e) {
      onActionError(e instanceof Error ? e.message : "Ban failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDiscussion() {
    const reason = window.prompt("Optional reason for audit log:")?.trim() ?? "";
    if (!confirm(`Permanently delete “${discussion.title}”? This cannot be undone.`)) return;
    onActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/discussions/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolveReports: true, reason: reason || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      onDeleted?.();
    } catch (e) {
      onActionError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  const auctionLines = auction ? formatAuctionSummary(auction) : [];
  const lat = discussion.center_lat;
  const lng = discussion.center_lng;
  const osmEmbedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lng}`;
  const googleMapsLink = `https://www.google.com/maps?q=${lat},${lng}`;

  const weeklyUsed = Number(liveLimits?.weekly_used_seconds ?? 0);
  const weeklyCap = Number(liveLimits?.weekly_cap_seconds ?? 86400);
  const weeklyPct = weeklyCap > 0 ? Math.min(100, Math.round((weeklyUsed / weeklyCap) * 100)) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <SectionCard title="Quick actions" description="Common support tasks without digging through forms.">
          <div className="flex flex-wrap gap-2">
            <PrimaryButton disabled={busy} onClick={() => postJson(`/api/admin/discussions/${id}/check-in`)}>
              Force check-in
            </PrimaryButton>
            {discussion.is_live ? (
              <PrimaryButton
                variant="danger"
                disabled={busy}
                onClick={() => postJson(`/api/admin/discussions/${id}/live`, { enabled: false })}
              >
                End live session
              </PrimaryButton>
            ) : (
              <PrimaryButton disabled={busy} onClick={() => postJson(`/api/admin/discussions/${id}/live`, { enabled: true })}>
                Start live (admin)
              </PrimaryButton>
            )}
            {pendingReports.length > 0 && (
              <span className="self-center text-xs text-rose-300">
                {pendingReports.length} pending report{pendingReports.length !== 1 ? "s" : ""} — see Trust below
              </span>
            )}
          </div>
        </SectionCard>

        <DetailAccordion
          title="Edit hub"
          summary="Title, description, lifecycle phase"
          defaultOpen
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FilterField label="Title" className="sm:col-span-2">
              <input {...filterInputProps()} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={60} />
            </FilterField>
            <FilterField label="Lifecycle">
              <select
                {...filterInputProps()}
                value={editLifecycle}
                onChange={(e) => setEditLifecycle(e.target.value as typeof editLifecycle)}
              >
                {LIFECYCLE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FilterField>
            <div className="flex items-end sm:col-span-1">
              <PrimaryButton disabled={busy} onClick={saveMetadata}>
                Save changes
              </PrimaryButton>
            </div>
            <FilterField label="Description" className="sm:col-span-2">
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                className={`${filterInputProps().className} resize-none`}
              />
            </FilterField>
          </div>
        </DetailAccordion>

        <DetailAccordion title="Stewardship & live" summary="Deadlines, weekly live budget, session history">
          <dl className="grid gap-3 sm:grid-cols-2">
            {discussion.bootstrap_expires_at && (
              <div>
                <dt className="text-[10px] uppercase text-zinc-500">Bootstrap ends</dt>
                <dd className="text-sm text-zinc-300">{formatDiscussionDate(discussion.bootstrap_expires_at)}</dd>
              </div>
            )}
            {discussion.check_in_due_at && (
              <div>
                <dt className="text-[10px] uppercase text-zinc-500">Check-in due</dt>
                <dd className="text-sm text-zinc-300">{formatDiscussionDate(discussion.check_in_due_at)}</dd>
              </div>
            )}
            {discussion.last_check_in_at && (
              <div>
                <dt className="text-[10px] uppercase text-zinc-500">Last check-in</dt>
                <dd className="text-sm text-zinc-300">{formatRelativeTime(discussion.last_check_in_at)}</dd>
              </div>
            )}
            {discussion.grace_expires_at && (
              <div>
                <dt className="text-[10px] uppercase text-zinc-500">Grace ends</dt>
                <dd className="text-sm text-zinc-300">{formatDiscussionDate(discussion.grace_expires_at)}</dd>
              </div>
            )}
            {discussion.live_last_go_live_at && (
              <div>
                <dt className="text-[10px] uppercase text-zinc-500">Last went live</dt>
                <dd className="text-sm text-zinc-300">{formatDiscussionDate(discussion.live_last_go_live_at)}</dd>
              </div>
            )}
          </dl>

          <div className="mt-5">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Weekly live budget</span>
              <span>
                {Math.round(weeklyUsed / 60)}m / {Math.round(weeklyCap / 60)}m
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-rose-500/80 transition-all" style={{ width: `${weeklyPct}%` }} />
            </div>
          </div>

          {liveSessions.length > 0 && (
            <ul className="mt-6 space-y-3">
              {liveSessions.slice(0, 8).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-zinc-200">{formatLiveDuration(s.started_at, s.ended_at)}</p>
                    <p className="text-xs text-zinc-500">
                      {formatDiscussionDate(s.started_at)}
                      {s.ended_at ? ` → ${formatDiscussionDate(s.ended_at)}` : " · still open"}
                    </p>
                  </div>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                    {s.end_reason ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {auction && (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold text-amber-200">Auction</p>
              {auctionLines.length > 0 ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {auctionLines.map((row) => (
                    <div key={row.label}>
                      <dt className="text-[10px] uppercase text-zinc-500">{row.label}</dt>
                      <dd className="text-sm font-medium text-zinc-200">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Auction data present — open raw JSON in logs if needed.</p>
              )}
            </div>
          )}
        </DetailAccordion>

        <DetailAccordion title="Location" summary="Pin on map and location hint shown in app">
          <div className="overflow-hidden rounded-2xl border border-zinc-800">
            <iframe title="Hub map" src={osmEmbedSrc} className="h-56 w-full" style={{ border: 0 }} loading="lazy" />
          </div>
          {address?.display_name && <p className="mt-2 text-xs text-zinc-500">{address.display_name}</p>}
          <a
            href={googleMapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs font-medium text-emerald-400 hover:underline"
          >
            Open in Google Maps
          </a>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <FilterField label="Latitude">
              <input {...filterInputProps()} value={editLat} onChange={(e) => setEditLat(e.target.value)} />
            </FilterField>
            <FilterField label="Longitude">
              <input {...filterInputProps()} value={editLng} onChange={(e) => setEditLng(e.target.value)} />
            </FilterField>
            <FilterField label="Location hint">
              <input {...filterInputProps()} value={editHint} onChange={(e) => setEditHint(e.target.value)} />
            </FilterField>
          </div>
          <PrimaryButton
            disabled={busy}
            onClick={() =>
              postJson(`/api/admin/discussions/${id}/location`, {
                center_lat: Number(editLat),
                center_lng: Number(editLng),
                location_hint: editHint.trim() || null,
              })
            }
          >
            Save location
          </PrimaryButton>
        </DetailAccordion>

        <DetailAccordion title="Community & sharing" summary="Home community link and auto-share toggles">
          <FilterField label="Home community ID">
            <input {...filterInputProps()} value={communityId} onChange={(e) => setCommunityId(e.target.value)} />
          </FilterField>
          {discussion.community && (
            <p className="mb-3 text-xs text-zinc-500">
              Current: <span className="text-zinc-300">{discussion.community.name}</span>
            </p>
          )}
          <PrimaryButton
            disabled={busy || !communityId.trim()}
            onClick={() => postJson(`/api/admin/discussions/${id}/community`, { community_id: communityId.trim() })}
          >
            Reassign community
          </PrimaryButton>
          <div className="mt-6 space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
              <input type="checkbox" checked={autoShareUpdates} onChange={(e) => setAutoShareUpdates(e.target.checked)} />
              Auto-share updates to linked community
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
              <input type="checkbox" checked={autoShareFeed} onChange={(e) => setAutoShareFeed(e.target.checked)} />
              Auto-share feed posts to linked community
            </label>
            <PrimaryButton
              disabled={busy}
              onClick={() =>
                patchJson(`/api/admin/discussions/${id}/auto-share`, {
                  auto_share_updates: autoShareUpdates,
                  auto_share_feed: autoShareFeed,
                })
              }
            >
              Save sharing settings
            </PrimaryButton>
          </div>
        </DetailAccordion>

        <DetailAccordion title="Danger zone" summary="Irreversible moderation — use only when necessary">
          <p className="text-sm leading-relaxed text-zinc-400">
            Banning removes the creator from the app. Deleting removes this discussion and all hub content.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <PrimaryButton variant="danger" disabled={busy || !discussion.creator_id} onClick={() => void banCreator()}>
              Ban creator
            </PrimaryButton>
            <PrimaryButton variant="danger" disabled={busy} onClick={() => void deleteDiscussion()}>
              Delete discussion
            </PrimaryButton>
          </div>
        </DetailAccordion>
      </div>

      <aside className="space-y-4">
        <SectionCard title="Trust & ratings">
          {ratings.rate_count === 0 ? (
            <p className="text-sm text-zinc-500">No star ratings yet</p>
          ) : (
            <p className="text-4xl font-semibold text-zinc-50">
              {ratings.avg_rate?.toFixed(1)}
              <span className="ml-1 text-2xl text-amber-400">★</span>
              <span className="ml-2 text-sm font-normal text-zinc-500">({ratings.rate_count})</span>
            </p>
          )}
          <div className="mt-6 border-t border-zinc-800 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Reports</p>
            {reports.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No reports filed</p>
            ) : (
              <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {reports.map((r) => (
                  <li key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium capitalize text-zinc-300">{r.category.replace(/_/g, " ")}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${REPORT_STATUS_STYLE[r.status] ?? "bg-zinc-800 text-zinc-400"}`}>
                        {r.status}
                      </span>
                    </div>
                    {r.description && <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{r.description}</p>}
                    <p className="mt-1 text-[10px] text-zinc-600">
                      {profileLabel(r.reporter)} · {formatRelativeTime(r.created_at)}
                    </p>
                    {r.status === "pending" && (
                      <div className="mt-3 border-t border-zinc-800 pt-2">
                        <ModerationMenu
                          actions={[
                            {
                              id: "reviewed",
                              label: "Mark reviewed",
                              onClick: () => updateReportStatus(r.id, "reviewed"),
                            },
                            {
                              id: "resolved",
                              label: "Resolve",
                              onClick: () => updateReportStatus(r.id, "resolved"),
                            },
                            {
                              id: "dismiss",
                              label: "Dismiss",
                              onClick: () => updateReportStatus(r.id, "dismissed"),
                            },
                          ]}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Links">
          <ul className="space-y-2 text-sm">
            <li>
              <Link href={`/dashboard/users?search=${discussion.creator?.username ?? ""}`} className="text-emerald-400 hover:underline">
                Creator profile
              </Link>
            </li>
            <li>
              <Link href="/dashboard/communities" className="text-emerald-400 hover:underline">
                Communities admin
              </Link>
            </li>
            <li>
              <Link href="/dashboard/moderation" className="text-emerald-400 hover:underline">
                Moderation queue
              </Link>
            </li>
          </ul>
        </SectionCard>
      </aside>
    </div>
  );
}
