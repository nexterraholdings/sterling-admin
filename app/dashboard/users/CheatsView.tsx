"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchPosts,
  fetchProfileItems,
  fetchCommunities,
  boostPostLikes,
  boostProfileConnections,
  boostCommunityMembers,
  type PostItem,
  type ProfileItem,
  type CommunityItem,
} from "@/app/dashboard/cheats/actions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESETS = [10, 25, 50, 100, 250, 500];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-violet-500/15 text-violet-300",
  "bg-sky-500/15 text-sky-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
];

function avatarColor(id: string) {
  return AVATAR_COLORS[id.charCodeAt(id.length - 1) % AVATAR_COLORS.length];
}

// ---------------------------------------------------------------------------
// Boost panel
// ---------------------------------------------------------------------------

function BoostPanel({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(25);
  const [custom, setCustom] = useState("");

  const effective =
    custom !== "" ? Math.max(1, Math.min(9999, Number(custom) || 0)) : amount;

  return (
    <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
      <p className="text-xs font-semibold text-amber-300">Add fake {label}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => { setAmount(p); setCustom(""); }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              custom === "" && amount === p
                ? "bg-amber-500 text-white shadow-sm"
                : "bg-zinc-900 text-amber-300 ring-1 ring-amber-500/30 hover:ring-amber-500/50"
            }`}
          >
            +{p}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-amber-400">Custom:</span>
        <input
          type="number"
          min={1}
          max={9999}
          placeholder="e.g. 300"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="w-28 rounded-xl border border-amber-500/20 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
        />
      </div>

      <p className="mt-3 text-xs text-amber-400">
        Will add <span className="font-bold">+{effective}</span> {label}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => onConfirm(effective)}
          className="rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600 active:scale-95"
        >
          ⚡ Apply boost
        </button>
        <button
          onClick={onCancel}
          className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post card
// ---------------------------------------------------------------------------

type PostPhase =
  | { type: "idle" }
  | { type: "panel" }
  | { type: "saving" }
  | { type: "done"; amount: number }
  | { type: "error"; msg: string };

function PostCard({ post }: { post: PostItem }) {
  const [phase, setPhase] = useState<PostPhase>({ type: "idle" });
  const [total, setTotal] = useState(post.likes_count);

  async function handleConfirm(amount: number) {
    setPhase({ type: "saving" });
    try {
      const newTotal = await boostPostLikes(post.id, amount);
      setTotal(newTotal);
      setPhase({ type: "done", amount });
      setTimeout(() => setPhase({ type: "idle" }), 3000);
    } catch (e) {
      setPhase({ type: "error", msg: e instanceof Error ? e.message : "Boost failed" });
    }
  }

  const isBoosting = phase.type === "panel";
  const isSaving   = phase.type === "saving";
  const isDone     = phase.type === "done";

  return (
    <div
      className={`rounded-2xl border bg-zinc-900 p-4 transition ${
        isBoosting ? "border-amber-500/40 shadow-md" : "border-zinc-800 hover:border-zinc-700 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {post.author_username && (
              <span className="font-semibold text-zinc-300">@{post.author_username}</span>
            )}
            {post.community_name && (
              <>
                <span>·</span>
                <span>{post.community_name}</span>
              </>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm text-zinc-400">
            {post.body ?? <span className="italic text-zinc-500">No content</span>}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1 text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-rose-400">
              <path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z" />
            </svg>
            <span className={`font-semibold tabular-nums transition-colors ${isDone ? "text-emerald-400" : "text-zinc-300"}`}>
              {total.toLocaleString()}
            </span>
          </div>

          {phase.type === "idle" && (
            <button
              onClick={() => setPhase({ type: "panel" })}
              className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300 transition hover:border-amber-500/50 hover:bg-amber-500/20"
            >
              ⚡ Boost
            </button>
          )}

          {isSaving && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-400" />
              Saving…
            </span>
          )}
        </div>
      </div>

      {isBoosting && (
        <BoostPanel
          label="likes"
          onConfirm={handleConfirm}
          onCancel={() => setPhase({ type: "idle" })}
        />
      )}

      {isDone && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <span>✓</span>
          <p className="text-xs font-semibold text-emerald-300">
            +{(phase as { type: "done"; amount: number }).amount} likes saved to DB
          </p>
        </div>
      )}

      {phase.type === "error" && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
          <p className="text-xs text-rose-300">{phase.msg}</p>
          <button
            onClick={() => setPhase({ type: "idle" })}
            className="text-xs font-medium text-rose-400 underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post card skeleton
// ---------------------------------------------------------------------------

function PostCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex gap-2">
            <div className="h-3.5 w-24 rounded-full bg-zinc-700" />
            <div className="h-3.5 w-20 rounded-full bg-zinc-700" />
          </div>
          <div className="h-4 w-full rounded bg-zinc-700" />
          <div className="h-4 w-3/4 rounded bg-zinc-700" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="h-4 w-10 rounded bg-zinc-700" />
          <div className="h-6 w-16 rounded-full bg-zinc-700" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile card
// ---------------------------------------------------------------------------

type ProfilePhase =
  | { type: "idle" }
  | { type: "panel" }
  | { type: "saving" }
  | { type: "done"; inserted: number }
  | { type: "error"; msg: string };

function ProfileCard({ profile }: { profile: ProfileItem }) {
  const [phase, setPhase] = useState<ProfilePhase>({ type: "idle" });
  const [total, setTotal] = useState(profile.connections_count);

  async function handleConfirm(amount: number) {
    setPhase({ type: "saving" });
    try {
      const { newCount, inserted } = await boostProfileConnections(profile.id, amount);
      setTotal(newCount);
      setPhase({ type: "done", inserted });
      setTimeout(() => setPhase({ type: "idle" }), 3500);
    } catch (e) {
      setPhase({ type: "error", msg: e instanceof Error ? e.message : "Boost failed" });
    }
  }

  const isBoosting = phase.type === "panel";
  const isSaving   = phase.type === "saving";
  const isDone     = phase.type === "done";
  const displayName = profile.full_name || profile.username || "Unknown";
  const color = avatarColor(profile.id);

  return (
    <div
      className={`rounded-2xl border bg-zinc-900 p-4 transition ${
        isBoosting ? "border-amber-500/40 shadow-md" : "border-zinc-800 hover:border-zinc-700 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${color}`}>
            {initials(displayName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-50">{displayName}</p>
            {profile.username && <p className="text-xs text-zinc-500">@{profile.username}</p>}
            <span className="mt-1 inline-block rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400 capitalize">
              {profile.account_role}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-right">
            <p className={`text-lg font-bold tabular-nums leading-none transition-colors ${isDone ? "text-emerald-400" : "text-zinc-50"}`}>
              {total.toLocaleString()}
            </p>
            <p className="text-[10px] text-zinc-500">connections</p>
          </div>

          {phase.type === "idle" && (
            <button
              onClick={() => setPhase({ type: "panel" })}
              className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300 transition hover:border-amber-500/50 hover:bg-amber-500/20"
            >
              ⚡ Boost
            </button>
          )}

          {isSaving && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-400" />
              Saving…
            </span>
          )}
        </div>
      </div>

      {isBoosting && (
        <BoostPanel
          label="connections"
          onConfirm={handleConfirm}
          onCancel={() => setPhase({ type: "idle" })}
        />
      )}

      {isDone && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <span>✓</span>
          <p className="text-xs font-semibold text-emerald-300">
            +{(phase as { type: "done"; inserted: number }).inserted} connections added · {total.toLocaleString()} total
          </p>
        </div>
      )}

      {phase.type === "error" && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
          <p className="text-xs text-rose-300">{phase.msg}</p>
          <button
            onClick={() => setPhase({ type: "idle" })}
            className="text-xs font-medium text-rose-400 underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile card skeleton
// ---------------------------------------------------------------------------

function ProfileCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-zinc-700" />
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-zinc-700" />
            <div className="h-3 w-20 rounded bg-zinc-700" />
            <div className="h-4 w-14 rounded-full bg-zinc-700" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="h-6 w-10 rounded bg-zinc-700" />
          <div className="h-6 w-16 rounded-full bg-zinc-700" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Community card
// ---------------------------------------------------------------------------

type CommunityPhase =
  | { type: "idle" }
  | { type: "panel" }
  | { type: "saving" }
  | { type: "done"; inserted: number }
  | { type: "error"; msg: string };

function CommunityCard({ community }: { community: CommunityItem }) {
  const [phase, setPhase] = useState<CommunityPhase>({ type: "idle" });
  const [total, setTotal] = useState(community.members_count);

  async function handleConfirm(amount: number) {
    setPhase({ type: "saving" });
    try {
      const { newCount, inserted } = await boostCommunityMembers(community.id, amount);
      setTotal(newCount);
      setPhase({ type: "done", inserted });
      setTimeout(() => setPhase({ type: "idle" }), 3500);
    } catch (e) {
      setPhase({ type: "error", msg: e instanceof Error ? e.message : "Boost failed" });
    }
  }

  const isBoosting = phase.type === "panel";
  const isSaving   = phase.type === "saving";
  const isDone     = phase.type === "done";
  const displayName = community.name || "Untitled Community";

  return (
    <div
      className={`rounded-2xl border bg-zinc-900 p-4 transition ${
        isBoosting ? "border-amber-500/40 shadow-md" : "border-zinc-800 hover:border-zinc-700 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-50">{displayName}</p>
          {community.description && (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{community.description}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-right">
            <p className={`text-lg font-bold tabular-nums leading-none transition-colors ${isDone ? "text-emerald-400" : "text-zinc-50"}`}>
              {total.toLocaleString()}
            </p>
            <p className="text-[10px] text-zinc-500">members</p>
          </div>

          {phase.type === "idle" && (
            <button
              onClick={() => setPhase({ type: "panel" })}
              className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300 transition hover:border-amber-500/50 hover:bg-amber-500/20"
            >
              ⚡ Boost
            </button>
          )}

          {isSaving && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-400" />
              Saving…
            </span>
          )}
        </div>
      </div>

      {isBoosting && (
        <BoostPanel
          label="members"
          onConfirm={handleConfirm}
          onCancel={() => setPhase({ type: "idle" })}
        />
      )}

      {isDone && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <span>✓</span>
          <p className="text-xs font-semibold text-emerald-300">
            +{(phase as { type: "done"; inserted: number }).inserted} members added · {total.toLocaleString()} total
          </p>
        </div>
      )}

      {phase.type === "error" && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
          <p className="text-xs text-rose-300">{phase.msg}</p>
          <button
            onClick={() => setPhase({ type: "idle" })}
            className="text-xs font-medium text-rose-400 underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Community card skeleton
// ---------------------------------------------------------------------------

function CommunityCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-zinc-700" />
          <div className="h-3 w-full rounded bg-zinc-700" />
          <div className="h-3 w-3/4 rounded bg-zinc-700" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="h-6 w-10 rounded bg-zinc-700" />
          <div className="h-6 w-16 rounded-full bg-zinc-700" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function CheatsView() {
  const [tab, setTab] = useState<"posts" | "profiles" | "communities">("posts");
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  const [communities, setCommunities] = useState<CommunityItem[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch), 300);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const loadPosts = useCallback((q: string) => {
    setPostsLoading(true);
    setLoadError(null);
    fetchPosts(q || undefined)
      .then(setPosts)
      .catch((err) => {
        setPosts([]);
        setLoadError(err instanceof Error ? err.message : "Failed to load posts");
      })
      .finally(() => setPostsLoading(false));
  }, []);

  const loadProfiles = useCallback((q: string) => {
    setProfilesLoading(true);
    setLoadError(null);
    fetchProfileItems(q || undefined)
      .then(setProfiles)
      .catch((err) => {
        setProfiles([]);
        setLoadError(err instanceof Error ? err.message : "Failed to load profiles");
      })
      .finally(() => setProfilesLoading(false));
  }, []);

  const loadCommunities = useCallback((q: string) => {
    setCommunitiesLoading(true);
    setLoadError(null);
    fetchCommunities(q || undefined)
      .then(setCommunities)
      .catch((err) => {
        setCommunities([]);
        setLoadError(err instanceof Error ? err.message : "Failed to load communities");
      })
      .finally(() => setCommunitiesLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "posts") loadPosts(search);
    else if (tab === "profiles") loadProfiles(search);
    else if (tab === "communities") loadCommunities(search);
  }, [search, tab, loadPosts, loadProfiles, loadCommunities]);

  useEffect(() => {
    if (profiles.length === 0 && !profilesLoading) {
      loadProfiles("");
    }
  }, [loadProfiles, profiles.length, profilesLoading]);

  function switchTab(next: "posts" | "profiles" | "communities") {
    setTab(next);
    setRawSearch("");
    setSearch("");
    setLoadError(null);
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        {/* Warning */}
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <span className="mt-0.5 shrink-0 text-amber-400">⚡</span>
          <p className="text-sm leading-6 text-amber-300">
            Directly writes fake likes and connections to the database. Changes are permanent and bypass normal platform rules.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => switchTab("posts")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === "posts" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z" />
            </svg>
            Post Likes
          </button>
          <button
            onClick={() => switchTab("profiles")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === "profiles" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
            </svg>
            Profile Connections
          </button>
          <button
            onClick={() => switchTab("communities")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === "communities" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1h8ZM6 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1h8ZM5.978 11.167c.852.563 1.957.863 3.022.863 1.065 0 2.17-.3 3.022-.863" />
            </svg>
            Community Members
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          >
            <path
              fillRule="evenodd"
              d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            placeholder={
              tab === "posts"
                ? "Search by author, community, or content…"
                : tab === "profiles"
                ? "Search by name or username…"
                : "Search by community name…"
            }
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 py-2.5 pl-10 pr-4 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-zinc-500 focus:bg-zinc-900 focus:ring-2 focus:ring-zinc-800"
          />
          {rawSearch !== search && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
            </div>
          )}
        </div>

        {/* Results */}
        <div className="mt-4 space-y-3">
          {loadError && (
            <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{loadError}</div>
          )}
          {tab === "posts" ? (
            postsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <PostCardSkeleton key={i} />)
            ) : posts.length > 0 ? (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            ) : !loadError ? (
              <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60">
                <p className="text-sm text-zinc-500">
                  {rawSearch ? "No posts match your search" : "No posts found"}
                </p>
              </div>
            ) : null
          ) : tab === "profiles" ? (
            profilesLoading ? (
              Array.from({ length: 4 }).map((_, i) => <ProfileCardSkeleton key={i} />)
            ) : profiles.length > 0 ? (
              profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />)
            ) : !loadError ? (
              <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60">
                <p className="text-sm text-zinc-500">
                  {rawSearch ? "No profiles match your search" : "No profiles found"}
                </p>
              </div>
            ) : null
          ) : (
            communitiesLoading ? (
              Array.from({ length: 4 }).map((_, i) => <CommunityCardSkeleton key={i} />)
            ) : communities.length > 0 ? (
              communities.map((community) => <CommunityCard key={community.id} community={community} />)
            ) : !loadError ? (
              <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60">
                <p className="text-sm text-zinc-500">
                  {rawSearch ? "No communities match your search" : "No communities found"}
                </p>
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}
