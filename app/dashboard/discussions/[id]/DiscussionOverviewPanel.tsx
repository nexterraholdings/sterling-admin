"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DetailResponse } from "./discussionDetailTypes";
import { formatDiscussionDate, profileLabel } from "./discussionDetailTypes";
import {
  ADMIN_DISCUSSION_LIFECYCLE_OPTIONS,
  DISCUSSION_LIFECYCLE_LABELS,
  normalizeAdminLifecycleStatus,
  normalizeDiscussionLifecycleStatus,
} from "@/lib/discussions/lifecycle";
import {
  DetailAccordion,
  FilterField,
  PrimaryButton,
  SectionCard,
  ModerationMenu,
  filterInputProps,
  formatRelativeTime,
} from "../discussionUi";
import { HUB_NAME_HINT, sanitizeHubNameInput } from "@/lib/hub-name";

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

export function DiscussionOverviewPanel({ id, data, onReload, onActionError, onDeleted }: Props) {
  const discussion = data.discussion;
  const reports = data.reports ?? [];
  const address = data.address ?? null;
  const stewardshipClaims = data.stewardshipClaims ?? [];
  const pendingReports = reports.filter((r) => r.status === "pending");

  const [editTitle, setEditTitle] = useState(sanitizeHubNameInput(discussion.title ?? ""));
  const [editDescription, setEditDescription] = useState(discussion.description ?? "");
  const lifecyclePhase = normalizeDiscussionLifecycleStatus(discussion.lifecycle_status);
  const isBootstrapPhase = lifecyclePhase === "bootstrap";
  const [editLifecycle, setEditLifecycle] = useState(lifecyclePhase);
  const [editLat, setEditLat] = useState(String(discussion.center_lat ?? ""));
  const [editLng, setEditLng] = useState(String(discussion.center_lng ?? ""));
  const [editHint, setEditHint] = useState(discussion.location_hint ?? "");
  const [autoShareUpdates, setAutoShareUpdates] = useState(discussion.auto_share_updates);
  const [autoShareFeed, setAutoShareFeed] = useState(discussion.auto_share_feed);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEditTitle(sanitizeHubNameInput(discussion.title ?? ""));
    setEditDescription(discussion.description ?? "");
    setEditLifecycle(normalizeDiscussionLifecycleStatus(discussion.lifecycle_status));
    setEditLat(String(discussion.center_lat ?? ""));
    setEditLng(String(discussion.center_lng ?? ""));
    setEditHint(discussion.location_hint ?? "");
    setAutoShareUpdates(discussion.auto_share_updates);
    setAutoShareFeed(discussion.auto_share_feed);
  }, [discussion]);

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
      const currentLifecycle = normalizeDiscussionLifecycleStatus(discussion.lifecycle_status);
      if (editLifecycle !== currentLifecycle) {
        if (editLifecycle === "bootstrap") {
          throw new Error("Starting up cannot be set from admin.");
        }
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


  const claimWindowLines: { label: string; value: string }[] = [];
  if (discussion.claim_window_opens_at) {
    claimWindowLines.push({ label: "Claim opens", value: formatDiscussionDate(discussion.claim_window_opens_at) });
  }
  if (discussion.claim_window_closes_at) {
    claimWindowLines.push({ label: "Claim closes", value: formatDiscussionDate(discussion.claim_window_closes_at) });
  }
  if (stewardshipClaims.length > 0) {
    claimWindowLines.push({ label: "Registered claimants", value: String(stewardshipClaims.length) });
  }
  const lat = discussion.center_lat;
  const lng = discussion.center_lng;
  const osmEmbedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lng}`;
  const googleMapsLink = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <SectionCard title="Quick actions" description="Common support tasks without digging through forms.">
          <div className="flex flex-wrap gap-2">
            <PrimaryButton disabled={busy} onClick={() => postJson(`/api/admin/discussions/${id}/check-in`)}>
              Force check-in
            </PrimaryButton>
            {pendingReports.length > 0 && (
              <span className="self-center text-xs text-rose-300">
                {pendingReports.length} pending report{pendingReports.length !== 1 ? "s" : ""} — see Reports
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
              <input
                {...filterInputProps()}
                value={editTitle ?? ""}
                onChange={(e) => setEditTitle(sanitizeHubNameInput(e.target.value))}
                maxLength={24}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <p className="mt-1.5 text-xs text-zinc-500">{HUB_NAME_HINT}</p>
            </FilterField>
            <FilterField label="Lifecycle">
              <select
                {...filterInputProps()}
                value={editLifecycle}
                onChange={(e) => setEditLifecycle(normalizeDiscussionLifecycleStatus(e.target.value))}
              >
                {isBootstrapPhase && (
                  <option value="bootstrap">{DISCUSSION_LIFECYCLE_LABELS.bootstrap}</option>
                )}
                {ADMIN_DISCUSSION_LIFECYCLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-zinc-500">
                {isBootstrapPhase
                  ? "Creation phase. Choose Live (or another status) and save to leave Starting up. You cannot put a hub back into this state."
                  : ADMIN_DISCUSSION_LIFECYCLE_OPTIONS.find((o) => o.value === editLifecycle)?.description}
              </p>
            </FilterField>
            <div className="flex items-end sm:col-span-1">
              <PrimaryButton disabled={busy} onClick={saveMetadata}>
                Save changes
              </PrimaryButton>
            </div>
            <FilterField label="Description" className="sm:col-span-2">
              <textarea
                value={editDescription ?? ""}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                className={`${filterInputProps().className} resize-none`}
              />
            </FilterField>
          </div>
        </DetailAccordion>

        <DetailAccordion title="Stewardship" summary="Check-in deadlines and claim window">
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
          </dl>

          {(normalizeAdminLifecycleStatus(discussion.lifecycle_status) === "claimable"
            || claimWindowLines.length > 0) && (
            <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
              <p className="text-sm font-semibold text-violet-200">Stewardship claim window</p>
              {claimWindowLines.length > 0 ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {claimWindowLines.map((row) => (
                    <div key={row.label}>
                      <dt className="text-[10px] uppercase text-zinc-500">{row.label}</dt>
                      <dd className="text-sm font-medium text-zinc-200">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Hub locked on gate until a steward is chosen.</p>
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
              <input {...filterInputProps()} value={editLat ?? ""} onChange={(e) => setEditLat(e.target.value)} />
            </FilterField>
            <FilterField label="Longitude">
              <input {...filterInputProps()} value={editLng ?? ""} onChange={(e) => setEditLng(e.target.value)} />
            </FilterField>
            <FilterField label="Location hint">
              <input {...filterInputProps()} value={editHint ?? ""} onChange={(e) => setEditHint(e.target.value)} />
            </FilterField>
          </div>
          <PrimaryButton
            disabled={busy}
            onClick={() =>
              postJson(`/api/admin/discussions/${id}/location`, {
                center_lat: Number(editLat),
                center_lng: Number(editLng),
                location_hint: (editHint ?? "").trim() || null,
              })
            }
          >
            Save location
          </PrimaryButton>
        </DetailAccordion>

        <DetailAccordion title="Sharing" summary="Auto-share toggles for this hub">
          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
              <input type="checkbox" checked={autoShareUpdates} onChange={(e) => setAutoShareUpdates(e.target.checked)} />
              Auto-share updates
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
              <input type="checkbox" checked={autoShareFeed} onChange={(e) => setAutoShareFeed(e.target.checked)} />
              Auto-share feed posts
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
        <SectionCard title="Reports">
            {reports.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No reports filed</p>
            ) : (
              <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {reports.map((r) => (
                  <li key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium capitalize text-zinc-300">{(r.category ?? "report").replace(/_/g, " ")}</span>
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
        </SectionCard>

        <SectionCard title="Links">
          <ul className="space-y-2 text-sm">
            <li>
              <Link href={`/dashboard/users?search=${discussion.creator?.username ?? ""}`} className="text-emerald-400 hover:underline">
                Creator profile
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
