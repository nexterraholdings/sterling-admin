"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchCommunities,
  fetchCommunityMembers,
  fetchAddressVerificationQueue,
  updateCommunity,
  deleteCommunity,
  removeCommunityMember,
  updateCommunityMemberRole,
  setCommunityType,
  reviewCommunityAddress,
  setCommunityIsPlus,
  type Community,
  type CommunityMember,
} from "./actions";
import {
  COMMUNITY_TYPE_LABEL,
  ADDRESS_VERIFICATION_LABEL,
  type CommunityType,
  type AddressVerificationStatus,
} from "@/lib/communities/types";
import { Tabs } from "@/components/dashboard/Tabs";
import { Pagination } from "@/components/ui/Pagination";

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700";
const textareaCls = `${inputCls} resize-none`;
const selectCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function CommunityTypeBadge({ type }: { type: CommunityType }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        type === "brokerage" ? "bg-violet-500/15 text-violet-300" : "bg-zinc-800 text-zinc-400"
      }`}
    >
      {COMMUNITY_TYPE_LABEL[type]}
    </span>
  );
}

function VerificationBadge({ status }: { status: AddressVerificationStatus }) {
  const styles: Record<AddressVerificationStatus, string> = {
    unverified: "bg-zinc-800 text-zinc-400",
    pending: "bg-amber-500/15 text-amber-300",
    verified: "bg-emerald-500/15 text-emerald-300",
    rejected: "bg-rose-500/15 text-rose-300",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {ADDRESS_VERIFICATION_LABEL[status]}
    </span>
  );
}

function PlusPill({ community }: { community: Community }) {
  if (!community.is_plus) return null;
  const title =
    community.is_plus_source === "manual" ? "Manually granted by an admin" : "Granted via billing";
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300"
    >
      ★ Plus
    </span>
  );
}

function EditCommunityPanel({
  community,
  onClose,
  onSaved,
}: {
  community: Community;
  onClose: () => void;
  onSaved: (updated: Community) => void;
}) {
  const [form, setForm] = useState({
    name: community.name ?? "",
    description: community.description ?? "",
    category: community.category ?? "",
    visibility: community.visibility ?? "public",
    community_type: community.community_type ?? "standard",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [plusBusy, setPlusBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [live, setLive] = useState(community);

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const updates = {
        name: form.name || null,
        description: form.description || null,
        category: form.category || null,
        visibility: form.visibility || null,
      };
      await updateCommunity(community.id, updates);
      if (form.community_type !== live.community_type) {
        await setCommunityType(community.id, form.community_type as CommunityType);
      }
      const updated = { ...live, ...updates, community_type: form.community_type as CommunityType };
      setLive(updated);
      onSaved(updated);
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePlusToggle(next: boolean) {
    const reason = next
      ? window.prompt("Reason for granting Plus (e.g. paid via invoice)?") ?? undefined
      : window.prompt("Reason for revoking Plus?") ?? undefined;
    setPlusBusy(true);
    try {
      const updated = await setCommunityIsPlus(community.id, next, reason);
      setLive(updated);
      onSaved(updated);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPlusBusy(false);
    }
  }

  async function handleAddressReview(status: AddressVerificationStatus) {
    setReviewBusy(true);
    try {
      const updated = await reviewCommunityAddress(community.id, status);
      setLive(updated);
      onSaved(updated);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">Edit community</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {community.name ?? "Untitled"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <CommunityTypeBadge type={live.community_type} />
              <VerificationBadge status={live.address_verification_status} />
              <PlusPill community={live} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-5">
            <Field label="Community name">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Community name"
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={4}
                className={textareaCls}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Community description…"
              />
            </Field>
            <Field label="Category">
              <input
                className={inputCls}
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="e.g. gaming, trading, general…"
              />
            </Field>
            <Field label="Visibility">
              <select
                className={selectCls}
                value={form.visibility}
                onChange={(e) => set("visibility", e.target.value)}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </Field>
            <Field label="Community type">
              <select
                className={selectCls}
                value={form.community_type}
                onChange={(e) => set("community_type", e.target.value)}
              >
                <option value="standard">Standard</option>
                <option value="brokerage">Brokerage (commercial)</option>
              </select>
              <p className="mt-1.5 text-xs text-zinc-500">
                Brokerage communities can post listings/deals and collect leads.
              </p>
            </Field>
          </div>

          {saveError && (
            <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">
              {saveError}
            </p>
          )}

          {live.address_verification_status === "pending" && (
            <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-200">Address verification pending</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-300/80">
                {live.address || "No address submitted"}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleAddressReview("verified")}
                  disabled={reviewBusy}
                  className="rounded-full bg-emerald-500/15 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAddressReview("rejected")}
                  disabled={reviewBusy}
                  className="rounded-full bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold text-rose-300 ring-1 ring-rose-500/30 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <p className="text-sm font-semibold text-zinc-100">Plus / Premium</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Paid plans aren&apos;t wired to real billing yet — this is a manual override for brokerages that paid
              out-of-band.
            </p>
            {live.is_plus && (
              <p className="mt-2 text-xs text-zinc-400">
                {live.is_plus_source === "manual" ? "Manually granted" : "Granted via billing"}
                {live.is_plus_granted_at && ` on ${new Date(live.is_plus_granted_at).toLocaleDateString()}`}
              </p>
            )}
            <div className="mt-3">
              {live.is_plus ? (
                <button
                  onClick={() => handlePlusToggle(false)}
                  disabled={plusBusy}
                  className="rounded-full bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold text-rose-300 ring-1 ring-rose-500/30 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  {plusBusy ? "Working…" : "Revoke Plus"}
                </button>
              ) : (
                <button
                  onClick={() => handlePlusToggle(true)}
                  disabled={plusBusy}
                  className="rounded-full bg-amber-500/15 px-3.5 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25 disabled:opacity-50"
                >
                  {plusBusy ? "Working…" : "Grant Plus"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-white px-5 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}

function MembersPanel({
  community,
  onClose,
}: {
  community: Community;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, [community.id]);

  async function loadMembers() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCommunityMembers(community.id);
      setMembers(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm("Remove this member from the community?")) return;
    try {
      await removeCommunityMember(community.id, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await updateCommunityMemberRole(community.id, userId, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m))
      );
    } catch (e: any) {
      alert(e.message);
    }
  }

  const ROLES = ["member", "moderator", "admin"];

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col overflow-hidden bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">Community members</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {community.name ?? "Untitled"} · {members.length} members
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {error && (
            <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">
              {error}
            </p>
          )}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-800" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              No members yet
            </p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-50">
                      {member.profile?.full_name ?? member.profile?.username ?? "Unknown"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {member.profile?.email ?? member.user_id}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                      className={selectCls}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRemoveMember(member.user_id)}
                      className="rounded-lg p-2 text-zinc-500 transition hover:bg-rose-500/15 hover:text-rose-400"
                      title="Remove member"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function CommunityRow({
  community,
  onEdit,
  onViewMembers,
  onDelete,
}: {
  community: Community;
  onEdit: (community: Community) => void;
  onViewMembers: (community: Community) => void;
  onDelete: (community: Community) => void;
}) {
  return (
    <tr className="hover:bg-zinc-800/60 transition-colors">
      <td className="px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-zinc-50">
              {community.name ?? "Untitled"}
            </p>
            <PlusPill community={community} />
          </div>
          {community.description && (
            <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
              {community.description}
            </p>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <CommunityTypeBadge type={community.community_type} />
      </td>
      <td className="px-6 py-4">
        <VerificationBadge status={community.address_verification_status} />
      </td>
      <td className="px-6 py-4">
        {community.category ? (
          <span className="inline-flex rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium capitalize text-zinc-300">
            {community.category}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )}
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            community.visibility === "private"
              ? "bg-violet-500/15 text-violet-300"
              : "bg-blue-500/15 text-blue-300"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${community.visibility === "private" ? "bg-violet-400" : "bg-blue-400"}`} />
          {community.visibility === "private" ? "Private" : "Public"}
        </span>
      </td>
      <td className="px-6 py-4 text-sm text-zinc-400">
        {community.members_count}
      </td>
      <td className="px-6 py-4 text-sm text-zinc-400">
        {community.posts_count ?? 0}
      </td>
      <td className="px-6 py-4 text-sm text-zinc-400">
        {community.created_at
          ? new Date(community.created_at).toLocaleDateString()
          : "—"}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onViewMembers(community)}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="View members"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.095a1.23 1.23 0 00.41-1.412A9.995 9.995 0 0010 12c-2.31 0-4.438.784-6.131 2.095z" />
            </svg>
          </button>
          <button
            onClick={() => onEdit(community)}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="Edit community"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(community)}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-rose-500/15 hover:text-rose-400"
            title="Delete community"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v3.5a2.75 2.75 0 002.75 2.75h2.5A2.75 2.75 0 0014 7.25v-3.5A2.75 2.75 0 0011.25 1h-2.5zM7 6.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 017 6.5zM5.75 3.75a.75.75 0 00-.75.75v3.5c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75v-3.5a.75.75 0 00-.75-.75h-2.5zM11 8.5a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 0111 8.5zM8.75 8a.75.75 0 00-.75.75v3.5c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75v-3.5A.75.75 0 0011.25 8h-2.5zM11 12.5a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 0111 12.5z" clipRule="evenodd" />
              <path d="M3.5 16.5a.75.75 0 01.75-.75h11a.75.75 0 010 1.5h-11A.75.75 0 013.5 16.5z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

function CommunityRowSkeleton() {
  return (
    <tr>
      <td className="px-6 py-4">
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-zinc-700" />
          <div className="h-3 w-48 animate-pulse rounded bg-zinc-700" />
        </div>
      </td>
      <td className="px-6 py-4"><div className="h-5 w-16 animate-pulse rounded-full bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-5 w-16 animate-pulse rounded-full bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-5 w-16 animate-pulse rounded-full bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-5 w-16 animate-pulse rounded-full bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-4 w-12 animate-pulse rounded bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-4 w-12 animate-pulse rounded bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-4 w-20 animate-pulse rounded bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-700" /></td>
    </tr>
  );
}

const TABLE_HEADERS = ["Community", "Type", "Verification", "Category", "Visibility", "Members", "Posts", "Created", ""];

function TableHead() {
  return (
    <thead className="bg-zinc-800/60 text-left text-zinc-400">
      <tr>
        {TABLE_HEADERS.map((h, i) => (
          <th key={i} className="px-6 py-4 font-medium">
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function CommunitiesTableSkeleton() {
  return (
    <div className="-mx-6 -mb-6 overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-800 text-sm">
        <TableHead />
        <tbody className="divide-y divide-zinc-800">
          {Array.from({ length: 8 }).map((_, i) => (
            <CommunityRowSkeleton key={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type PageView = "all" | "queue";

export default function CommunitiesPage() {
  const [pageView, setPageView] = useState<PageView>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingCommunity, setEditingCommunity] = useState<Community | null>(null);
  const [viewingMembers, setViewingMembers] = useState<Community | null>(null);
  const [deletingCommunity, setDeletingCommunity] = useState<Community | null>(null);

  const [queueCommunities, setQueueCommunities] = useState<Community[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadCommunities(1);
  }, [debouncedSearch]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      const data = await fetchAddressVerificationQueue();
      setQueueCommunities(data);
    } catch (e: any) {
      setQueueError(e.message);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function loadCommunities(page: number) {
    setLoading(true);
    try {
      const { communities, totalCount } = await fetchCommunities(page, debouncedSearch);
      setCommunities(communities);
      setTotalCount(totalCount);
      setCurrentPage(page);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function goToPage(page: number) {
    loadCommunities(page);
  }

  function handleSaved(updated: Community) {
    setCommunities((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
    setQueueCommunities((prev) =>
      updated.address_verification_status === "pending"
        ? prev.map((c) => (c.id === updated.id ? updated : c))
        : prev.filter((c) => c.id !== updated.id)
    );
    setEditingCommunity(null);
  }

  async function handleDelete() {
    if (!deletingCommunity) return;
    if (
      !confirm(
        `Are you sure you want to delete "${deletingCommunity.name ?? "this community"}"? This action cannot be undone.`
      )
    ) {
      setDeletingCommunity(null);
      return;
    }

    try {
      await deleteCommunity(deletingCommunity.id);
      setCommunities((prev) => prev.filter((c) => c.id !== deletingCommunity.id));
      setTotalCount((prev) => prev - 1);
      setDeletingCommunity(null);
    } catch (e: any) {
      alert(e.message);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
              Communities
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-50">
              Community management
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Browse, edit, and manage communities. View members, change roles, or delete communities.
            </p>
          </div>
        </div>

        <div className="mt-5 max-w-md">
          <Tabs
            tabs={[
              { id: "all", label: "All communities", color: "emerald" },
              {
                id: "queue",
                label: queueCommunities.length > 0 ? `Verification queue (${queueCommunities.length})` : "Verification queue",
                color: "amber",
              },
            ]}
            defaultTab="all"
            variant="segmented"
            onChange={(id) => setPageView(id as PageView)}
          />
        </div>

        {/* Search */}
        {pageView === "all" && (
        <>
        <div className="relative mt-5">
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
            placeholder="Search by name or description…"
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

        {/* Table */}
        <div className="mt-6">
          {loading && communities.length === 0 ? (
            <CommunitiesTableSkeleton />
          ) : communities.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
              {debouncedSearch ? "No communities match your search" : "No communities found"}
            </div>
          ) : (
            <>
              <div className="-mx-6 -mb-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-800 text-sm">
                  <TableHead />
                  <tbody className="divide-y divide-zinc-800">
                    {communities.map((community) => (
                      <CommunityRow
                        key={community.id}
                        community={community}
                        onEdit={setEditingCommunity}
                        onViewMembers={setViewingMembers}
                        onDelete={setDeletingCommunity}
                      />
                    ))}
                    {loading &&
                      Array.from({ length: 3 }).map((_, i) => (
                        <CommunityRowSkeleton key={`sk-${i}`} />
                      ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={goToPage}
                totalItems={totalCount}
                pageSize={PAGE_SIZE}
              />
            </>
          )}
        </div>
        </>
        )}

        {/* Verification queue */}
        {pageView === "queue" && (
          <div className="mt-6">
            {queueError ? (
              <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{queueError}</div>
            ) : queueLoading ? (
              <CommunitiesTableSkeleton />
            ) : queueCommunities.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
                No brokerage addresses waiting on review.
              </div>
            ) : (
              <div className="space-y-3">
                {queueCommunities.map((community) => (
                  <div
                    key={community.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-zinc-50">{community.name ?? "Untitled"}</p>
                        <CommunityTypeBadge type={community.community_type} />
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">{community.address || "No address submitted"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const updated = await reviewCommunityAddress(community.id, "verified");
                          handleSaved(updated);
                        }}
                        className="rounded-full bg-emerald-500/15 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
                      >
                        Approve
                      </button>
                      <button
                        onClick={async () => {
                          const updated = await reviewCommunityAddress(community.id, "rejected");
                          handleSaved(updated);
                        }}
                        className="rounded-full bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold text-rose-300 ring-1 ring-rose-500/30 transition hover:bg-rose-500/20"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => setEditingCommunity(community)}
                        className="rounded-full border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit panel */}
      {editingCommunity && (
        <EditCommunityPanel
          community={editingCommunity}
          onClose={() => setEditingCommunity(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Members panel */}
      {viewingMembers && (
        <MembersPanel
          community={viewingMembers}
          onClose={() => setViewingMembers(null)}
        />
      )}

      {/* Delete confirmation */}
      {deletingCommunity && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setDeletingCommunity(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-zinc-900 p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-zinc-50">
                Delete community?
              </h3>
              <p className="mt-2 text-sm text-zinc-400">
                Are you sure you want to delete{" "}
                <span className="font-semibold">
                  "{deletingCommunity.name ?? "this community"}"
                </span>
                ? This will also remove all members. This action cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDeletingCommunity(null)}
                  className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
                >
                  Delete community
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
