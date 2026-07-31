"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  searchUsers,
  adjustInvitePoints,
  fetchRecentAdjustments,
  fetchAdjustmentsForUser,
  type UserSearchResult,
  type RecentAdjustment,
} from "./actions";

type PersonLike = { email: string | null; username: string | null; full_name: string | null } | null;

function userLabel(u: PersonLike): string {
  if (!u) return "Unknown user";
  return u.username ? `@${u.username}` : u.full_name ?? u.email ?? "Unknown user";
}

function getInitials(u: PersonLike): string {
  if (u?.full_name?.trim()) {
    const parts = u.full_name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return u.full_name.slice(0, 2).toUpperCase();
  }
  return (u?.username ?? "??").slice(0, 2).toUpperCase();
}

const AVATAR_PALETTES = [
  "bg-violet-500/15 text-violet-300",
  "bg-blue-500/15 text-blue-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
];

function avatarColor(id: string): string {
  const n = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTES[n % AVATAR_PALETTES.length];
}

function Avatar({ id, person, size = "sm" }: { id: string; person: PersonLike; size?: "sm" | "md" }) {
  const dims = size === "md" ? "h-11 w-11 text-sm" : "h-8 w-8 text-xs";
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full font-bold ${dims} ${avatarColor(id)}`}>
      {getInitials(person)}
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DeltaBadge({ delta }: { delta: number }) {
  const positive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        positive ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
      }`}
    >
      <span>{positive ? "▲" : "▼"}</span>
      {positive ? "+" : ""}
      {delta}
    </span>
  );
}

const DELTA_PRESETS = [1, 5, 10, -1, -5, -10];

function UserSearchPicker({
  selected,
  onSelect,
}: {
  selected: UserSearchResult | null;
  onSelect: (u: UserSearchResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setSearchError(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      searchUsers(query)
        .then((users) => {
          setResults(users);
          setSearchError(null);
        })
        .catch((err) => {
          setResults([]);
          setSearchError(err instanceof Error ? err.message : "User search failed");
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar id={selected.id} person={selected} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-50">{userLabel(selected)}</p>
            <p className="truncate text-xs text-zinc-500">{selected.email ?? selected.id}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300">
            {selected.referral_count} pts
          </span>
          <button
            type="button"
            onClick={() => { onSelect(null); setQuery(""); }}
            className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setSearchError(null); }}
        onFocus={() => setOpen(true)}
        placeholder="Search by name, username, or email"
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
      />
      {open && query.trim() && (
        <div className="absolute z-10 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
          {searching ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex animate-pulse items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-zinc-700" />
                  <div className="h-3 w-32 rounded bg-zinc-700" />
                </div>
              ))}
            </div>
          ) : searchError ? (
            <div className="px-3 py-4 text-center text-sm text-rose-300">{searchError}</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-zinc-500">No users found</div>
          ) : (
            results.map((u) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(u); setOpen(false); }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-zinc-800"
              >
                <Avatar id={u.id} person={u} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-50">{userLabel(u)}</p>
                  <p className="truncate text-xs text-zinc-500">{u.email ?? u.id}</p>
                </div>
                <span className="shrink-0 text-xs text-zinc-500">{u.referral_count} pts</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function UserHistoryPreview({ userId }: { userId: string }) {
  const [history, setHistory] = useState<RecentAdjustment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    fetchAdjustmentsForUser(userId, 5)
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [userId]);

  if (history === null) {
    return (
      <div className="mt-3 space-y-1.5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-3 w-2/3 animate-pulse rounded bg-zinc-800" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return <p className="mt-3 text-xs text-zinc-500">No prior adjustments for this user</p>;
  }

  return (
    <div className="mt-3 space-y-1.5 border-t border-zinc-800/80 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Recent history</p>
      {history.map((h) => (
        <div key={h.id} className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 flex-1 truncate text-zinc-400">{h.reason}</span>
          <span className="shrink-0 text-zinc-600">{formatDate(h.created_at)}</span>
          <DeltaBadge delta={h.points_delta} />
        </div>
      ))}
    </div>
  );
}

function AdjustmentRowSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-800 bg-zinc-800/60 p-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-zinc-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 rounded bg-zinc-700" />
          <div className="h-3 w-full rounded bg-zinc-700" />
        </div>
        <div className="h-5 w-12 rounded-full bg-zinc-700" />
      </div>
    </div>
  );
}

export default function InvitePointsPage() {
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [pointsDelta, setPointsDelta] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const [adjustments, setAdjustments] = useState<RecentAdjustment[]>([]);
  const [loadingAdjustments, setLoadingAdjustments] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const loadAdjustments = useCallback(() => {
    setLoadingAdjustments(true);
    setListError(null);
    fetchRecentAdjustments(20)
      .then(setAdjustments)
      .catch((err) => setListError(err instanceof Error ? err.message : "Failed to load adjustments"))
      .finally(() => setLoadingAdjustments(false));
  }, []);

  useEffect(() => { loadAdjustments(); }, [loadAdjustments]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const parsedDelta = Number(pointsDelta);
  const hasValidDelta = pointsDelta.trim() !== "" && Number.isInteger(parsedDelta) && parsedDelta !== 0;
  const previewBalance = selectedUser && hasValidDelta
    ? Math.max(0, selectedUser.referral_count + parsedDelta)
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!selectedUser) {
      setFormError("Select a target user");
      return;
    }
    if (!hasValidDelta) {
      setFormError("Points must be a nonzero whole number");
      return;
    }
    if (!reason.trim()) {
      setFormError("Reason is required");
      return;
    }

    setSubmitting(true);
    try {
      const adjustment = await adjustInvitePoints({
        targetUserId: selectedUser.id,
        pointsDelta: parsedDelta,
        reason,
      });
      setToast({
        kind: "success",
        message: `${parsedDelta > 0 ? "Granted" : "Deducted"} ${Math.abs(parsedDelta)} points for ${userLabel(selectedUser)}. New balance: ${adjustment.new_referral_count}.`,
      });
      setSelectedUser(null);
      setPointsDelta("");
      setReason("");
      loadAdjustments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to adjust points";
      setFormError(message);
      setToast({ kind: "error", message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header + form */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Invite Points</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-50">Adjust invite points</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Manually grant or deduct a user's invite (referral) point balance. Every adjustment is
          logged below and in the audit log. This does not affect this week's referral leaderboard,
          which is computed separately from referral signups.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 border-t border-zinc-800 pt-5">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-zinc-400">Target user</span>
            <UserSearchPicker selected={selectedUser} onSelect={setSelectedUser} />
            {selectedUser && <UserHistoryPreview userId={selectedUser.id} />}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">Points delta</span>
              <input
                type="number"
                step={1}
                value={pointsDelta}
                onChange={(e) => setPointsDelta(e.target.value)}
                placeholder="e.g. 5 or -3"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DELTA_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPointsDelta(String(preset))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      preset > 0
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500/50 hover:bg-emerald-500/20"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:border-rose-500/50 hover:bg-rose-500/20"
                    }`}
                  >
                    {preset > 0 ? `+${preset}` : preset}
                  </button>
                ))}
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">Reason</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this being adjusted?"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
              />
            </label>
          </div>

          {previewBalance !== null && (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-800/60 px-4 py-3">
              <span className="text-xs font-medium text-zinc-500">Balance preview</span>
              <span className="text-sm font-semibold text-zinc-400">{selectedUser!.referral_count}</span>
              <span className="text-zinc-600">→</span>
              <span className={`text-base font-bold ${parsedDelta > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {previewBalance}
              </span>
            </div>
          )}

          {formError && (
            <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{formError}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-5 py-2 text-sm font-medium text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Submit adjustment"}
          </button>
        </form>
      </div>

      {/* Audit trail */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Last {adjustments.length || 20} adjustments
          </h3>
          <button
            onClick={loadAdjustments}
            disabled={loadingAdjustments}
            className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-40"
          >
            {loadingAdjustments ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {loadingAdjustments ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <AdjustmentRowSkeleton key={i} />)}</div>
        ) : listError ? (
          <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{listError}</div>
        ) : adjustments.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
            No adjustments yet
          </div>
        ) : (
          <div className="space-y-3">
            {adjustments.map((a) => (
              <div key={a.id} className="rounded-xl border border-zinc-800 bg-zinc-800/60 p-4 transition hover:border-zinc-700">
                <div className="flex items-start gap-3">
                  <Avatar id={a.target_user_id} person={a.target} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-50">{userLabel(a.target)}</span>
                      <DeltaBadge delta={a.points_delta} />
                      <span className="text-xs text-zinc-500">current balance: {a.current_referral_count}</span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">{a.reason}</p>
                    <p className="mt-1.5 text-[11px] text-zinc-500">
                      By {userLabel(a.admin)} · {formatDate(a.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${
            toast.kind === "success"
              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
              : "bg-rose-500/15 text-rose-300 ring-rose-500/30"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
