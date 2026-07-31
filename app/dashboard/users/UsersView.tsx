"use client";

import { useState, useEffect } from "react";
import type { AuthUserRow, UserDeleteTarget, UserProfile } from "@/lib/types";
import { Tabs } from "@/components/dashboard/Tabs";
import { Pagination } from "@/components/ui/Pagination";
import { banUser, type BanType } from "@/app/dashboard/banned-users/actions";
import { strikeUser } from "@/app/dashboard/moderation/actions";
import {
  fetchProfiles,
  fetchProfileById,
  fetchAuthUsers,
  fetchProfileAuthPresence,
  updateProfile,
  deleteUserByTarget,
  deleteUsersByTarget,
  type FetchFilter,
} from "@/app/dashboard/users/actions";
import {
  fetchUserDevices,
  fetchDeviceAccounts,
  banDevice,
  unbanDevice,
  type UserDevice,
  type DeviceAccount,
} from "@/app/dashboard/users/device-actions";

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Edit panel
// ---------------------------------------------------------------------------

const ACCOUNT_ROLES = ["member", "creator", "moderator", "admin", "owner"];
const USER_ROLES = ["member", "creator", "moderator", "admin", "support", "owner"];

const ACCOUNT_ROLE_BADGE: Record<string, string> = {
  owner: "bg-violet-500/15 text-violet-300",
  admin: "bg-rose-500/15 text-rose-300",
  moderator: "bg-amber-500/15 text-amber-300",
  creator: "bg-blue-500/15 text-blue-300",
  member: "bg-emerald-500/15 text-emerald-300",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700";
const selectCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700";
const readOnlyCls =
  "rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200";

function userToForm(user: UserProfile) {
  return {
    full_name: user.full_name ?? "",
    username: user.username ?? "",
    account_role: user.account_role ?? "member",
    role: user.role ?? "",
    bio: user.bio ?? "",
    phone_number: user.phone_number ?? "",
    moderation_strike_count: user.moderation_strike_count,
  };
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

function formatDeviceDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DeviceAccountsList({ deviceId }: { deviceId: string }) {
  const [accounts, setAccounts] = useState<DeviceAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDeviceAccounts(deviceId)
      .then((data) => {
        if (!cancelled) setAccounts(data);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  if (error) {
    return <p className="px-4 py-3 text-xs text-rose-400">{error}</p>;
  }

  if (!accounts) {
    return (
      <div className="space-y-2 px-4 py-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-3 w-40 animate-pulse rounded bg-zinc-700" />
        ))}
      </div>
    );
  }

  if (accounts.length === 0) {
    return <p className="px-4 py-3 text-xs text-zinc-500">No other accounts on this device.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-800 px-4 py-2">
      {accounts.map((account) => (
        <li key={account.user_id} className="flex items-center justify-between gap-3 py-2 text-xs">
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-200">
              {account.full_name ?? account.username ?? account.user_id}
            </p>
            <p className="truncate text-zinc-500">{account.email ?? "—"}</p>
          </div>
          <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {account.account_role ?? "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DeviceRow({
  device,
  userId,
  onBanned,
  onUnbanned,
}: {
  device: UserDevice;
  userId: string;
  onBanned: (deviceId: string, expiresAt: string | null) => void;
  onUnbanned: (deviceId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showBanForm, setShowBanForm] = useState(false);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unbanning, setUnbanning] = useState(false);

  async function handleBan() {
    setSubmitting(true);
    setError(null);
    try {
      const iso = expiresAt ? new Date(expiresAt).toISOString() : null;
      await banDevice({
        deviceId: device.device_id,
        reason: reason.trim(),
        expiresAt: iso,
        linkedUserId: userId,
      });
      onBanned(device.device_id, iso);
      setShowBanForm(false);
      setReason("");
      setExpiresAt("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnban() {
    setUnbanning(true);
    setError(null);
    try {
      await unbanDevice(device.device_id);
      onUnbanned(device.device_id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUnbanning(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-xs text-zinc-300">
              {device.device_id.slice(0, 16)}…
            </span>
            {device.is_banned && (
              <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
                Banned
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {[device.platform, device.app_version].filter(Boolean).join(" · ") || "Unknown platform"}
            {" · last seen "}
            {formatDeviceDate(device.last_seen_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {device.linked_account_count > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800"
            >
              {device.linked_account_count} other account
              {device.linked_account_count === 1 ? "" : "s"}
            </button>
          )}
          {device.is_banned ? (
            <button
              type="button"
              onClick={handleUnban}
              disabled={unbanning}
              className="whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {unbanning ? "Unbanning…" : "Unban"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowBanForm((v) => !v)}
              className="whitespace-nowrap rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20"
            >
              Ban device
            </button>
          )}
        </div>
      </div>

      {expanded && device.linked_account_count > 0 && (
        <div className="border-t border-zinc-800">
          <DeviceAccountsList deviceId={device.device_id} />
        </div>
      )}

      {showBanForm && (
        <div className="space-y-3 border-t border-zinc-800 bg-rose-500/5 px-4 py-3">
          <textarea
            rows={2}
            className={`${inputCls} resize-none`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for banning this device…"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              className={inputCls}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowBanForm(false)}
              disabled={submitting}
              className="shrink-0 whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBan}
              disabled={submitting || !reason.trim()}
              className="shrink-0 whitespace-nowrap rounded-full bg-rose-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Banning…" : "Confirm"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="border-t border-zinc-800 px-4 py-2 text-xs text-rose-400">{error}</p>}
    </div>
  );
}

function DevicesSection({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<UserDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDevices(null);
    setError(null);
    fetchUserDevices(userId)
      .then((data) => {
        if (!cancelled) setDevices(data);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function markBanned(deviceId: string, expiresAt: string | null) {
    setDevices((prev) =>
      prev?.map((d) =>
        d.device_id === deviceId ? { ...d, is_banned: true, ban_expires_at: expiresAt } : d
      ) ?? prev
    );
  }

  function markUnbanned(deviceId: string) {
    setDevices((prev) =>
      prev?.map((d) =>
        d.device_id === deviceId ? { ...d, is_banned: false, ban_expires_at: null } : d
      ) ?? prev
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Devices</p>

      {error && (
        <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</p>
      )}

      {!error && devices === null && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-800" />
          ))}
        </div>
      )}

      {!error && devices !== null && devices.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-700 bg-zinc-800/60 px-4 py-3 text-xs text-zinc-500">
          No devices on record for this user.
        </p>
      )}

      {!error && devices !== null && devices.length > 0 && (
        <div className="space-y-2">
          {devices.map((device) => (
            <DeviceRow
              key={device.device_id}
              device={device}
              userId={userId}
              onBanned={markBanned}
              onUnbanned={markUnbanned}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PresenceBadge({
  present,
  label,
}: {
  present: boolean;
  label: string;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
        present
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-amber-500/15 text-amber-300"
      }`}
    >
      {present ? `${label} ✓` : `No ${label}`}
    </span>
  );
}

function DeleteTargetForm({
  label,
  hasAuth,
  hasProfile,
  deleting,
  deleteError,
  onCancel,
  onConfirm,
}: {
  label: string;
  hasAuth: boolean;
  hasProfile: boolean;
  deleting: boolean;
  deleteError: string | null;
  onCancel: () => void;
  onConfirm: (target: UserDeleteTarget) => void;
}) {
  const defaultTarget: UserDeleteTarget =
    hasAuth && hasProfile ? "both" : hasAuth ? "auth" : "profile";
  const [target, setTarget] = useState<UserDeleteTarget>(defaultTarget);
  const [confirmText, setConfirmText] = useState("");

  const warning =
    target === "auth"
      ? "Removes the auth identity only. Any profile row will be left orphaned."
      : target === "profile"
      ? "Removes the profiles row only. The user can still sign in if auth remains."
      : "Permanently deletes auth.users (and cascaded public data). This cannot be undone.";

  return (
    <div className="mt-6 space-y-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">
        Delete account
      </p>
      <p className="text-sm text-zinc-400">
        Choose what to remove for{" "}
        <span className="font-medium text-zinc-200">{label}</span>.
      </p>

      <div className="space-y-2">
        {(
          [
            {
              id: "both" as const,
              title: "Both (recommended)",
              enabled: hasAuth,
              hint: "Auth + cascaded data (profile removed via cascade)",
            },
            {
              id: "auth" as const,
              title: "Auth only",
              enabled: hasAuth,
              hint: "auth.users only — leaves profile if present",
            },
            {
              id: "profile" as const,
              title: "Profile only",
              enabled: hasProfile,
              hint: "profiles row only — leaves auth if present",
            },
          ] as const
        ).map((opt) => (
          <label
            key={opt.id}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
              !opt.enabled
                ? "cursor-not-allowed border-zinc-800 bg-zinc-950/40 opacity-40"
                : target === opt.id
                ? "border-rose-500/40 bg-rose-500/10"
                : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
            }`}
          >
            <input
              type="radio"
              name="delete-target"
              className="mt-1"
              checked={target === opt.id}
              disabled={!opt.enabled || deleting}
              onChange={() => setTarget(opt.id)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-200">
                {opt.title}
              </span>
              <span className="block text-xs text-zinc-500">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <p className="text-xs text-amber-300/90">{warning}</p>

      <Field label='Type "DELETE" to confirm'>
        <input
          className={inputCls}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          disabled={deleting}
        />
      </Field>

      {deleteError && (
        <p className="rounded-xl bg-rose-500/20 px-4 py-3 text-sm text-rose-300">
          {deleteError}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={deleting}
          className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(target)}
          disabled={
            deleting ||
            confirmText !== "DELETE" ||
            (target === "both" && !hasAuth) ||
            (target === "auth" && !hasAuth) ||
            (target === "profile" && !hasProfile)
          }
          className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function EditUserPanel({
  user,
  onClose,
  onSaved,
  onDeleted,
}: {
  user: UserProfile;
  onClose: () => void;
  onSaved: (updated: UserProfile) => void;
  onDeleted: (userId: string, target: UserDeleteTarget) => void;
}) {
  const [profile, setProfile] = useState(user);
  const [form, setForm] = useState(() => userToForm(user));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showBanForm, setShowBanForm] = useState(false);
  const [banning, setBanning] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);
  const [banForm, setBanForm] = useState({
    reason: "",
    banType: "general" as BanType,
    expiresAt: "",
    alsoBanDevices: true,
  });

  const [striking, setStriking] = useState(false);
  const [strikeError, setStrikeError] = useState<string | null>(null);

  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setProfile(user);
    setForm(userToForm(user));
    setSaveError(null);
    setShowBanForm(false);
    setShowDeleteForm(false);

    fetchProfileById(user.id)
      .then((fresh) => {
        if (cancelled || !fresh) return;
        setProfile(fresh);
        setForm(userToForm(fresh));
      })
      .catch((e) => {
        if (!cancelled) console.error(e);
      });

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const hasAuth = user.has_auth !== false;
  const hasProfile = true;

  function set(key: string, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setBan<K extends keyof typeof banForm>(key: K, value: (typeof banForm)[K]) {
    setBanForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleBan() {
    setBanning(true);
    setBanError(null);
    try {
      await banUser({
        userId: profile.id,
        reason: banForm.reason.trim(),
        banType: banForm.banType,
        expiresAt: banForm.expiresAt ? new Date(banForm.expiresAt).toISOString() : null,
        alsoBanDevices: banForm.alsoBanDevices,
      });
      onClose();
    } catch (e: any) {
      setBanError(e.message);
    } finally {
      setBanning(false);
    }
  }

  async function handleStrike() {
    setStriking(true);
    setStrikeError(null);
    try {
      await strikeUser(profile.id);
      const newCount = form.moderation_strike_count + 1;
      set("moderation_strike_count", newCount);
      onSaved({ ...profile, moderation_strike_count: newCount });
    } catch (e: any) {
      setStrikeError(e.message);
    } finally {
      setStriking(false);
    }
  }

  async function handleDelete(target: UserDeleteTarget) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUserByTarget(profile.id, target);
      onDeleted(profile.id, target);
      if (target === "auth") {
        setShowDeleteForm(false);
      }
    } catch (e: any) {
      setDeleteError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const updates = {
        full_name: form.full_name || null,
        username: form.username || null,
        account_role: form.account_role,
        role: form.role || null,
        bio: form.bio || null,
        phone_number: form.phone_number || null,
        moderation_strike_count: Number(form.moderation_strike_count),
      };
      await updateProfile(profile.id, updates);
      onSaved({ ...profile, ...updates });
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
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
            <h2 className="text-base font-semibold text-zinc-50">Edit user</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {profile.email ?? profile.username ?? profile.id}
            </p>
            <div className="mt-2">
              <PresenceBadge present={hasAuth} label="Auth" />
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
            <Field label="Email">
              <p className={readOnlyCls}>{profile.email ?? "—"}</p>
            </Field>
            <Field label="Full name">
              <input
                className={inputCls}
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="Full name"
              />
            </Field>
            <Field label="Username">
              <input
                className={inputCls}
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                placeholder="username"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Account role">
                <select
                  className={selectCls}
                  value={form.account_role}
                  onChange={(e) => set("account_role", e.target.value)}
                >
                  {ACCOUNT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Role">
                <select
                  className={selectCls}
                  value={form.role}
                  onChange={(e) => set("role", e.target.value)}
                >
                  <option value="">— none —</option>
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Phone number">
              <input
                className={inputCls}
                value={form.phone_number}
                onChange={(e) => set("phone_number", e.target.value)}
                placeholder="+1 555 000 0000"
              />
            </Field>
            <Field label="Moderation strikes">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={form.moderation_strike_count}
                  onChange={(e) =>
                    set("moderation_strike_count", parseInt(e.target.value, 10) || 0)
                  }
                />
                <button
                  type="button"
                  onClick={handleStrike}
                  disabled={striking || saving}
                  className="shrink-0 whitespace-nowrap rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 transition hover:border-amber-500/50 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {striking ? "Striking…" : "+1 Strike"}
                </button>
              </div>
              {strikeError && (
                <p className="mt-1.5 text-xs text-rose-400">{strikeError}</p>
              )}
            </Field>
            <Field label="Bio">
              <textarea
                rows={4}
                className={`${inputCls} resize-none`}
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
                placeholder="User bio…"
              />
            </Field>
          </div>

          {saveError && (
            <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">
              {saveError}
            </p>
          )}

          <DevicesSection userId={profile.id} />

          {showBanForm && (
            <div className="mt-6 space-y-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">Ban user</p>
              <Field label="Reason">
                <textarea
                  rows={3}
                  className={`${inputCls} resize-none`}
                  value={banForm.reason}
                  onChange={(e) => setBan("reason", e.target.value)}
                  placeholder="Why is this user being banned?"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Ban type">
                  <select
                    className={selectCls}
                    value={banForm.banType}
                    onChange={(e) => setBan("banType", e.target.value as BanType)}
                  >
                    <option value="general">General</option>
                    <option value="harassment">Harassment</option>
                    <option value="spam">Spam</option>
                    <option value="content_violation">Content Violation</option>
                  </select>
                </Field>
                <Field label="Expires (optional)">
                  <input
                    type="date"
                    className={inputCls}
                    value={banForm.expiresAt}
                    onChange={(e) => setBan("expiresAt", e.target.value)}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={banForm.alsoBanDevices}
                  onChange={(e) => setBan("alsoBanDevices", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 text-rose-500 focus:ring-rose-500"
                />
                Also ban all registered devices
              </label>

              {banError && (
                <p className="rounded-xl bg-rose-500/20 px-4 py-3 text-sm text-rose-300">{banError}</p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowBanForm(false);
                    setBanError(null);
                  }}
                  disabled={banning}
                  className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBan}
                  disabled={banning || !banForm.reason.trim()}
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {banning ? "Banning…" : "Confirm ban"}
                </button>
              </div>
            </div>
          )}

          {showDeleteForm && (
            <DeleteTargetForm
              label={profile.email ?? profile.username ?? profile.id}
              hasAuth={hasAuth}
              hasProfile={hasProfile}
              deleting={deleting}
              deleteError={deleteError}
              onCancel={() => {
                setShowDeleteForm(false);
                setDeleteError(null);
              }}
              onConfirm={handleDelete}
            />
          )}
        </div>

        {/* Footer */}
        {!showBanForm && !showDeleteForm && (
          <div className="flex justify-between gap-3 border-t border-zinc-800 px-6 py-4">
            <div className="flex gap-3">
              <button
                onClick={() => setShowBanForm(true)}
                disabled={saving}
                className="rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ban user
              </button>
              <button
                onClick={() => setShowDeleteForm(true)}
                disabled={saving}
                className="rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete account
              </button>
            </div>
            <div className="flex gap-3">
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
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

const checkboxCls =
  "h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/40 focus:ring-offset-0";

function SelectionToolbar({
  count,
  onClear,
  onDelete,
  deleting,
}: {
  count: number;
  onClear: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-700 bg-zinc-950/80 px-4 py-3">
      <p className="text-sm text-zinc-300">
        <span className="font-semibold text-zinc-50">{count}</span> selected
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          disabled={deleting}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete selected…"}
        </button>
      </div>
    </div>
  );
}

function BulkDeleteModal({
  count,
  hasAuth,
  hasProfile,
  deleting,
  deleteError,
  onCancel,
  onConfirm,
}: {
  count: number;
  hasAuth: boolean;
  hasProfile: boolean;
  deleting: boolean;
  deleteError: string | null;
  onCancel: () => void;
  onConfirm: (target: UserDeleteTarget) => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-zinc-800 bg-zinc-900 p-2 shadow-2xl">
        <DeleteTargetForm
          label={`${count} selected user${count === 1 ? "" : "s"}`}
          hasAuth={hasAuth}
          hasProfile={hasProfile}
          deleting={deleting}
          deleteError={deleteError}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </div>
    </>
  );
}

function UserRow({
  user,
  selected,
  onToggle,
  onEdit,
}: {
  user: UserProfile;
  selected: boolean;
  onToggle: (id: string) => void;
  onEdit: (user: UserProfile) => void;
}) {
  return (
    <tr
      onClick={() => onEdit(user)}
      className={`cursor-pointer transition-colors hover:bg-zinc-800/60 ${
        selected ? "bg-emerald-500/5" : ""
      }`}
    >
      <td className="px-6 py-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            className={checkboxCls}
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggle(user.id)}
            aria-label={`Select ${user.full_name ?? user.username ?? user.id}`}
          />
          <div className="min-w-0">
            <p className="font-medium text-zinc-50">
              {user.full_name ?? user.username ?? "—"}
            </p>
            {user.username && (
              <p className="mt-0.5 text-xs text-zinc-500">@{user.username}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-zinc-400">{user.email ?? "—"}</td>
      <td className="px-6 py-4">
        <PresenceBadge present={user.has_auth !== false} label="Auth" />
      </td>
      <td className="px-6 py-4">
        <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {user.role ?? "—"}
        </span>
      </td>
      <td className="px-6 py-4 text-zinc-400">
        <div className="flex flex-wrap gap-2">
          {user.operating_markets.map((market) => (
            <span
              key={market}
              className="rounded-full bg-zinc-800 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400"
            >
              {market}
            </span>
          ))}
        </div>
      </td>
      <td className="px-6 py-4">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
            ACCOUNT_ROLE_BADGE[user.account_role] ?? "bg-zinc-800 text-zinc-400"
          }`}
        >
          {user.account_role}
        </span>
      </td>
      <td className="px-6 py-4">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            user.moderation_strike_count > 3
              ? "bg-rose-500/15 text-rose-300"
              : user.moderation_strike_count > 0
              ? "bg-amber-500/15 text-amber-300"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {user.moderation_strike_count}
        </span>
      </td>
      <td className="px-6 py-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(user);
          }}
          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          title="Edit user"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

function UserRowSkeleton() {
  return (
    <tr>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-pulse rounded bg-zinc-700" />
          <div className="h-4 w-32 animate-pulse rounded bg-zinc-700" />
        </div>
      </td>
      <td className="px-6 py-4"><div className="h-4 w-40 animate-pulse rounded bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-5 w-16 animate-pulse rounded-full bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-5 w-16 animate-pulse rounded-full bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-5 w-24 animate-pulse rounded-full bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-5 w-16 animate-pulse rounded-full bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-5 w-8 animate-pulse rounded-full bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-7 w-7 animate-pulse rounded-lg bg-zinc-700" /></td>
    </tr>
  );
}

const TABLE_HEADERS = ["User", "Email", "Auth", "Role", "Markets", "Access", "Strikes", ""];

function TableHead({
  allSelected,
  someSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
}) {
  return (
    <thead className="bg-zinc-800/60 text-left text-zinc-400">
      <tr>
        {TABLE_HEADERS.map((h, i) => (
          <th key={i} className="px-6 py-4 font-medium">
            {i === 0 ? (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={onToggleAll}
                  aria-label="Select all users on this page"
                />
                <span>{h}</span>
              </div>
            ) : (
              h
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="-mx-6 -mb-6 overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-800 text-sm">
        <TableHead allSelected={false} someSelected={false} onToggleAll={() => {}} />
        <tbody className="divide-y divide-zinc-800">
          {Array.from({ length: 8 }).map((_, i) => (
            <UserRowSkeleton key={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatAuthDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AuthUserPanel({
  user,
  onClose,
  onDeleted,
}: {
  user: AuthUserRow;
  onClose: () => void;
  onDeleted: (userId: string, target: UserDeleteTarget) => void;
}) {
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(target: UserDeleteTarget) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUserByTarget(user.id, target);
      onDeleted(user.id, target);
      if (target === "profile") {
        setShowDeleteForm(false);
      }
    } catch (e: any) {
      setDeleteError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">Auth user</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {user.email ?? user.phone ?? user.id}
            </p>
            <div className="mt-2">
              <PresenceBadge present={user.has_profile} label="Profile" />
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

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-5">
            <Field label="User ID">
              <p className="break-all rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">
                {user.id}
              </p>
            </Field>
            <Field label="Email">
              <p className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
                {user.email ?? "—"}
              </p>
            </Field>
            <Field label="Phone">
              <p className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
                {user.phone ?? "—"}
              </p>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Created">
                <p className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
                  {formatAuthDate(user.created_at)}
                </p>
              </Field>
              <Field label="Last sign-in">
                <p className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
                  {formatAuthDate(user.last_sign_in_at)}
                </p>
              </Field>
            </div>
            {user.banned_until && (
              <Field label="Banned until">
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  {formatAuthDate(user.banned_until)}
                </p>
              </Field>
            )}
            {user.has_profile && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Linked profile
                </p>
                <p className="mt-2 text-sm font-medium text-zinc-200">
                  {user.profile_full_name ?? user.profile_username ?? "—"}
                </p>
                {user.profile_username && (
                  <p className="mt-0.5 text-xs text-zinc-500">@{user.profile_username}</p>
                )}
              </div>
            )}
          </div>

          {showDeleteForm && (
            <DeleteTargetForm
              label={user.email ?? user.phone ?? user.id}
              hasAuth
              hasProfile={user.has_profile}
              deleting={deleting}
              deleteError={deleteError}
              onCancel={() => {
                setShowDeleteForm(false);
                setDeleteError(null);
              }}
              onConfirm={handleDelete}
            />
          )}
        </div>

        {!showDeleteForm && (
          <div className="flex justify-between gap-3 border-t border-zinc-800 px-6 py-4">
            <button
              onClick={() => setShowDeleteForm(true)}
              className="rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20"
            >
              Delete…
            </button>
            <button
              onClick={onClose}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function AuthUserRow({
  user,
  selected,
  onToggle,
  onOpen,
}: {
  user: AuthUserRow;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (user: AuthUserRow) => void;
}) {
  return (
    <tr
      onClick={() => onOpen(user)}
      className={`cursor-pointer transition-colors hover:bg-zinc-800/60 ${
        selected ? "bg-emerald-500/5" : ""
      }`}
    >
      <td className="px-6 py-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            className={checkboxCls}
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggle(user.id)}
            aria-label={`Select ${user.email ?? user.id}`}
          />
          <div className="min-w-0">
            <p className="font-medium text-zinc-50">{user.email ?? "—"}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
              {user.id}
            </p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-zinc-400">{user.phone ?? "—"}</td>
      <td className="px-6 py-4">
        <PresenceBadge present={user.has_profile} label="Profile" />
        {user.has_profile && (user.profile_username || user.profile_full_name) && (
          <p className="mt-1 text-xs text-zinc-500">
            {user.profile_full_name ?? `@${user.profile_username}`}
          </p>
        )}
      </td>
      <td className="px-6 py-4 text-zinc-400">{formatAuthDate(user.created_at)}</td>
      <td className="px-6 py-4 text-zinc-400">{formatAuthDate(user.last_sign_in_at)}</td>
      <td className="px-6 py-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen(user);
          }}
          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          title="View auth user"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
            <path
              fillRule="evenodd"
              d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </td>
    </tr>
  );
}

const AUTH_TABLE_HEADERS = ["Email", "Phone", "Profile", "Created", "Last sign-in", ""];

function AuthTableHead({
  allSelected,
  someSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
}) {
  return (
    <thead className="bg-zinc-800/60 text-left text-zinc-400">
      <tr>
        {AUTH_TABLE_HEADERS.map((h, i) => (
          <th key={i} className="px-6 py-4 font-medium">
            {i === 0 ? (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={onToggleAll}
                  aria-label="Select all auth users on this page"
                />
                <span>{h}</span>
              </div>
            ) : (
              h
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function AuthUsersTableSkeleton() {
  return (
    <div className="-mx-6 -mb-6 overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-800 text-sm">
        <AuthTableHead allSelected={false} someSelected={false} onToggleAll={() => {}} />
        <tbody className="divide-y divide-zinc-800">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 animate-pulse rounded bg-zinc-700" />
                  <div className="h-4 w-40 animate-pulse rounded bg-zinc-700" />
                </div>
              </td>
              <td className="px-6 py-4"><div className="h-4 w-28 animate-pulse rounded bg-zinc-700" /></td>
              <td className="px-6 py-4"><div className="h-5 w-20 animate-pulse rounded-full bg-zinc-700" /></td>
              <td className="px-6 py-4"><div className="h-4 w-24 animate-pulse rounded bg-zinc-700" /></td>
              <td className="px-6 py-4"><div className="h-4 w-24 animate-pulse rounded bg-zinc-700" /></td>
              <td className="px-6 py-4"><div className="h-7 w-7 animate-pulse rounded-lg bg-zinc-700" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuthUsersTable({
  search,
  emptyMessage = "No auth users found",
}: {
  search: string;
  emptyMessage?: string;
}) {
  const [users, setUsers] = useState<AuthUserRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<AuthUserRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const allSelected = users.length > 0 && users.every((u) => selectedIds.has(u.id));
  const someSelected = users.some((u) => selectedIds.has(u.id));
  const selectedUsers = users.filter((u) => selectedIds.has(u.id));

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setUsers([]);
    setCurrentPage(1);
    setSelectedIds(new Set());

    fetchAuthUsers(1, search)
      .then(({ users: next, totalCount: count }) => {
        setUsers(next);
        setTotalCount(count);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load auth users")
      )
      .finally(() => setLoading(false));
  }, [search]);

  function goToPage(page: number) {
    setLoading(true);
    setLoadError(null);
    setSelectedIds(new Set());
    fetchAuthUsers(page, search)
      .then(({ users: next, totalCount: count }) => {
        setUsers(next);
        setTotalCount(count);
        setCurrentPage(page);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load auth users")
      )
      .finally(() => setLoading(false));
  }

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(users.map((u) => u.id)));
  }

  function handleDeleted(userId: string, target: UserDeleteTarget) {
    if (target === "profile") {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, has_profile: false } : u))
      );
      setSelected((prev) =>
        prev?.id === userId ? { ...prev, has_profile: false } : prev
      );
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setTotalCount((prev) => Math.max(0, prev - 1));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    setSelected(null);
  }

  async function handleBulkDelete(target: UserDeleteTarget) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    setBulkDeleteError(null);
    try {
      const { deleted, failed } = await deleteUsersByTarget(ids, target);
      if (target === "profile") {
        const deletedSet = new Set(deleted);
        setUsers((prev) =>
          prev.map((u) =>
            deletedSet.has(u.id) ? { ...u, has_profile: false } : u
          )
        );
      } else {
        const deletedSet = new Set(deleted);
        setUsers((prev) => prev.filter((u) => !deletedSet.has(u.id)));
        setTotalCount((prev) => Math.max(0, prev - deleted.length));
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of deleted) next.delete(id);
        return next;
      });
      if (failed.length > 0) {
        setBulkDeleteError(
          `Deleted ${deleted.length}, failed ${failed.length}: ${failed[0].error}`
        );
      } else {
        setShowBulkDelete(false);
      }
    } catch (e: any) {
      setBulkDeleteError(e.message);
    } finally {
      setBulkDeleting(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">
        {loadError}
      </div>
    );
  }

  if (loading && users.length === 0) {
    return <AuthUsersTableSkeleton />;
  }

  if (!loading && users.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {selected && (
        <AuthUserPanel
          user={selected}
          onClose={() => setSelected(null)}
          onDeleted={handleDeleted}
        />
      )}

      {showBulkDelete && (
        <BulkDeleteModal
          count={selectedIds.size}
          hasAuth
          hasProfile={selectedUsers.some((u) => u.has_profile)}
          deleting={bulkDeleting}
          deleteError={bulkDeleteError}
          onCancel={() => {
            setShowBulkDelete(false);
            setBulkDeleteError(null);
          }}
          onConfirm={handleBulkDelete}
        />
      )}

      <SelectionToolbar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onDelete={() => setShowBulkDelete(true)}
        deleting={bulkDeleting}
      />

      <div className="-mx-6 -mb-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-800 text-sm">
          <AuthTableHead
            allSelected={allSelected}
            someSelected={someSelected}
            onToggleAll={toggleAll}
          />
          <tbody className="divide-y divide-zinc-800">
            {users.map((user) => (
              <AuthUserRow
                key={user.id}
                user={user}
                selected={selectedIds.has(user.id)}
                onToggle={toggleId}
                onOpen={setSelected}
              />
            ))}
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-4 w-4 animate-pulse rounded bg-zinc-700" />
                      <div className="h-4 w-40 animate-pulse rounded bg-zinc-700" />
                    </div>
                  </td>
                  <td className="px-6 py-4"><div className="h-4 w-28 animate-pulse rounded bg-zinc-700" /></td>
                  <td className="px-6 py-4"><div className="h-5 w-20 animate-pulse rounded-full bg-zinc-700" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-24 animate-pulse rounded bg-zinc-700" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-24 animate-pulse rounded bg-zinc-700" /></td>
                  <td className="px-6 py-4"><div className="h-7 w-7 animate-pulse rounded-lg bg-zinc-700" /></td>
                </tr>
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
  );
}

// ---------------------------------------------------------------------------
// Users view (per filter tab table)
// ---------------------------------------------------------------------------

function UsersTable({
  accountRole,
  flagged,
  search,
  emptyMessage = "No users found",
}: {
  accountRole?: string;
  flagged?: boolean;
  search: string;
  emptyMessage?: string;
}) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const filter: FetchFilter = { account_role: accountRole, flagged };
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const allSelected = users.length > 0 && users.every((u) => selectedIds.has(u.id));
  const someSelected = users.some((u) => selectedIds.has(u.id));
  const selectedUsers = users.filter((u) => selectedIds.has(u.id));

  async function attachAuthPresence(profiles: UserProfile[]): Promise<UserProfile[]> {
    if (profiles.length === 0) return profiles;
    try {
      const presentIds = await fetchProfileAuthPresence(profiles.map((p) => p.id));
      const present = new Set(presentIds);
      return profiles.map((p) => ({ ...p, has_auth: present.has(p.id) }));
    } catch (e) {
      console.error(e);
      return profiles.map((p) => ({ ...p, has_auth: undefined }));
    }
  }

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setUsers([]);
    setCurrentPage(1);
    setSelectedIds(new Set());

    fetchProfiles(1, filter, search)
      .then(async ({ profiles, totalCount }) => {
        const withAuth = await attachAuthPresence(profiles);
        setUsers(withAuth);
        setTotalCount(totalCount);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load users")
      )
      .finally(() => setLoading(false));
  }, [accountRole, flagged, search]);

  function goToPage(page: number) {
    setLoading(true);
    setLoadError(null);
    setSelectedIds(new Set());
    fetchProfiles(page, filter, search)
      .then(async ({ profiles, totalCount }) => {
        const withAuth = await attachAuthPresence(profiles);
        setUsers(withAuth);
        setTotalCount(totalCount);
        setCurrentPage(page);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load users")
      )
      .finally(() => setLoading(false));
  }

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(users.map((u) => u.id)));
  }

  function handleSaved(updated: UserProfile) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    setEditingUser(null);
  }

  function handleDeleted(userId: string, target: UserDeleteTarget) {
    if (target === "auth") {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, has_auth: false } : u))
      );
      setEditingUser((prev) =>
        prev?.id === userId ? { ...prev, has_auth: false } : prev
      );
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setTotalCount((prev) => Math.max(0, prev - 1));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    setEditingUser(null);
  }

  async function handleBulkDelete(target: UserDeleteTarget) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    setBulkDeleteError(null);
    try {
      const { deleted, failed } = await deleteUsersByTarget(ids, target);
      if (target === "auth") {
        const deletedSet = new Set(deleted);
        setUsers((prev) =>
          prev.map((u) =>
            deletedSet.has(u.id) ? { ...u, has_auth: false } : u
          )
        );
      } else {
        const deletedSet = new Set(deleted);
        setUsers((prev) => prev.filter((u) => !deletedSet.has(u.id)));
        setTotalCount((prev) => Math.max(0, prev - deleted.length));
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of deleted) next.delete(id);
        return next;
      });
      if (failed.length > 0) {
        setBulkDeleteError(
          `Deleted ${deleted.length}, failed ${failed.length}: ${failed[0].error}`
        );
      } else {
        setShowBulkDelete(false);
      }
    } catch (e: any) {
      setBulkDeleteError(e.message);
    } finally {
      setBulkDeleting(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">
        {loadError}
      </div>
    );
  }

  if (loading && users.length === 0) {
    return <UsersTableSkeleton />;
  }

  if (!loading && users.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {editingUser && (
        <EditUserPanel
          key={editingUser.id}
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {showBulkDelete && (
        <BulkDeleteModal
          count={selectedIds.size}
          hasAuth={selectedUsers.some((u) => u.has_auth !== false)}
          hasProfile
          deleting={bulkDeleting}
          deleteError={bulkDeleteError}
          onCancel={() => {
            setShowBulkDelete(false);
            setBulkDeleteError(null);
          }}
          onConfirm={handleBulkDelete}
        />
      )}

      <SelectionToolbar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onDelete={() => setShowBulkDelete(true)}
        deleting={bulkDeleting}
      />

      <div className="-mx-6 -mb-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-800 text-sm">
          <TableHead
            allSelected={allSelected}
            someSelected={someSelected}
            onToggleAll={toggleAll}
          />
          <tbody className="divide-y divide-zinc-800">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                selected={selectedIds.has(user.id)}
                onToggle={toggleId}
                onEdit={setEditingUser}
              />
            ))}
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <UserRowSkeleton key={`sk-${i}`} />
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
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function UserManagementView() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const searchPlaceholder =
    activeTab === "auth"
      ? "Search auth users by email, phone, id, or profile name…"
      : "Search by name, email, or username…";

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      {/* Search */}
      <div className="relative">
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
          placeholder={searchPlaceholder}
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

      {/* Tabs */}
      <div className="mt-5">
        <Tabs
          tabs={[
            { id: "all", label: "All users", color: "blue" },
            { id: "auth", label: "Auth users", color: "violet" },
            { id: "admins", label: "Admins", color: "rose" },
            { id: "moderators", label: "Moderators", color: "amber" },
            { id: "flagged", label: "Flagged", color: "rose" },
          ]}
          defaultTab="all"
          variant="pills"
          size="sm"
          onChange={setActiveTab}
        />
      </div>

      {/* Content */}
      <div className="mt-6">
        {activeTab === "all" && (
          <UsersTable key="all" search={debouncedSearch} />
        )}
        {activeTab === "auth" && (
          <AuthUsersTable
            key="auth"
            search={debouncedSearch}
            emptyMessage="No auth users found"
          />
        )}
        {activeTab === "admins" && (
          <UsersTable
            key="admins"
            accountRole="admin"
            search={debouncedSearch}
            emptyMessage="No admin accounts found"
          />
        )}
        {activeTab === "moderators" && (
          <UsersTable
            key="moderators"
            accountRole="moderator"
            search={debouncedSearch}
            emptyMessage="No moderator accounts found"
          />
        )}
        {activeTab === "flagged" && (
          <UsersTable
            key="flagged"
            flagged
            search={debouncedSearch}
            emptyMessage="No flagged users"
          />
        )}
      </div>
    </div>
  );
}
