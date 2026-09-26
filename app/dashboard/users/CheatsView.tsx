"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  boostPostLikes,
  boostProfileConnections,
  fetchPosts,
  fetchProfileItems,
  type PostItem,
  type ProfileItem,
} from "@/app/dashboard/cheats/actions";

const PAGE = 24;
const PRESETS = [10, 25, 50, 100, 250, 500];

type Mode = "add" | "set";
type Tab = "posts" | "profiles";
type PostSort = "recent" | "likes";
type ProfileSort = "name" | "connections";
type Phase =
  | { type: "idle" }
  | { type: "panel" }
  | { type: "saving" }
  | { type: "done"; delta: number }
  | { type: "error"; msg: string };

const fieldCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function relativeTime(iso: string | null) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function deltaLabel(delta: number, noun: string) {
  if (delta === 0) return `${noun} unchanged`;
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta).toLocaleString()} ${noun}`;
}

function AdjustPanel({
  noun,
  current,
  floor = 0,
  busy,
  onApply,
  onCancel,
}: {
  noun: string;
  current: number;
  floor?: number;
  busy: boolean;
  onApply: (value: number, mode: Mode) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<Mode>("add");
  const [amount, setAmount] = useState(25);
  const [custom, setCustom] = useState("");
  const effective = custom !== "" ? Math.max(0, Math.min(1_000_000, Math.floor(Number(custom) || 0))) : amount;
  const next = Math.max(floor, mode === "set" ? effective : current + effective);

  return (
    <form
      className="mt-3 rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onApply(effective, mode);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Adjust {noun}</p>
        <div className="flex rounded-xl border border-zinc-800 p-0.5">
          {(["add", "set"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setMode(option);
                setCustom("");
                if (option === "set") setAmount(current);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                mode === option ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {option === "add" ? "Add" : "Set exact"}
            </button>
          ))}
        </div>
      </div>

      {mode === "add" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setAmount(preset);
                setCustom("");
              }}
              className={`rounded-xl border px-3 py-1.5 font-mono text-xs ${
                custom === "" && amount === preset
                  ? "border-cyan-400/50 text-cyan-100"
                  : "border-zinc-700 text-zinc-300 hover:border-cyan-400/30"
              }`}
            >
              +{preset}
            </button>
          ))}
        </div>
      )}

      <label className="mt-3 block text-xs text-zinc-400">
        {mode === "add" ? "Custom amount" : "Exact total"}
        <input
          type="number"
          min={0}
          max={1000000}
          value={custom}
          placeholder={mode === "add" ? "e.g. 300" : String(current)}
          onChange={(event) => setCustom(event.target.value)}
          className={`${fieldCls} mt-1 w-36`}
        />
      </label>

      <p className="mt-3 font-mono text-xs text-zinc-400">
        {current.toLocaleString()} → <span className="text-cyan-100">{next.toLocaleString()}</span>
      </p>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || (mode === "add" && effective < 1)}
          className="rounded-xl border border-cyan-400/40 px-4 py-2 text-xs font-medium text-cyan-100 disabled:opacity-40"
        >
          {busy ? "Writing…" : "Apply"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:border-zinc-500"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function StatusLine({ phase, noun, onDismiss }: { phase: Phase; noun: string; onDismiss: () => void }) {
  if (phase.type === "done") {
    return (
      <p className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
        {deltaLabel(phase.delta, noun)}
      </p>
    );
  }
  if (phase.type === "error") {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2">
        <p className="text-xs text-rose-200">{phase.msg}</p>
        <button type="button" onClick={onDismiss} className="text-xs text-rose-200 underline">
          Dismiss
        </button>
      </div>
    );
  }
  return null;
}

function PostRow({
  post,
  selected,
  onToggle,
  onCount,
}: {
  post: PostItem;
  selected: boolean;
  onToggle: () => void;
  onCount: (id: string, total: number, delta: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [total, setTotal] = useState(post.likes_count);

  useEffect(() => {
    setTotal(post.likes_count);
  }, [post.likes_count]);

  async function apply(value: number, mode: Mode) {
    const before = total;
    setPhase({ type: "saving" });
    try {
      const next = await boostPostLikes(post.id, value, mode);
      setTotal(next);
      onCount(post.id, next, next - before);
      setPhase({ type: "done", delta: next - before });
    } catch (error) {
      setPhase({ type: "error", msg: error instanceof Error ? error.message : "Update failed" });
    }
  }

  const open = phase.type === "panel" || phase.type === "saving";

  return (
    <article
      className={`rounded-2xl border px-4 py-3 transition ${
        open || selected ? "border-cyan-400/35 bg-cyan-400/5" : "border-zinc-800 bg-zinc-950/40 hover:border-cyan-400/25"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select post by ${post.author_username ?? "unknown"}`}
          className="mt-1 h-4 w-4 accent-cyan-400"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            <span className="font-medium text-zinc-200">@{post.author_username || "unknown"}</span>
            {post.place_name && <span>{post.place_name}</span>}
            {post.created_at && <span className="font-mono text-[10px] uppercase tracking-wide">{relativeTime(post.created_at)}</span>}
          </div>
          {post.body ? <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{post.body}</p> : null}
          {post.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.image_url}
              alt=""
              className="mt-2 max-h-48 rounded-xl border border-zinc-800 object-cover"
            />
          ) : null}
          {!post.body && !post.image_url ? <p className="mt-1 text-sm italic text-zinc-500">No content</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className="font-mono text-sm tabular-nums text-zinc-100">{total.toLocaleString()}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">likes</p>
          {phase.type !== "saving" && phase.type !== "panel" && (
            <button
              type="button"
              onClick={() => setPhase({ type: "panel" })}
              className="rounded-xl border border-cyan-400/30 px-3 py-1 text-xs text-cyan-100 hover:border-cyan-300/60"
            >
              Adjust
            </button>
          )}
          {phase.type === "saving" && <span className="font-mono text-[10px] uppercase tracking-wide text-cyan-300">Writing</span>}
        </div>
      </div>
      {open && (
        <AdjustPanel
          noun="likes"
          current={total}
          busy={phase.type === "saving"}
          onApply={apply}
          onCancel={() => setPhase({ type: "idle" })}
        />
      )}
      <StatusLine phase={phase} noun="likes" onDismiss={() => setPhase({ type: "idle" })} />
    </article>
  );
}

function ProfileRow({
  profile,
  selected,
  onToggle,
  onCount,
}: {
  profile: ProfileItem;
  selected: boolean;
  onToggle: () => void;
  onCount: (id: string, total: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [total, setTotal] = useState(profile.connections_count);
  const name = profile.full_name || profile.username || "Unknown";

  useEffect(() => {
    setTotal(profile.connections_count);
  }, [profile.connections_count]);

  async function apply(value: number, mode: Mode) {
    const before = total;
    setPhase({ type: "saving" });
    try {
      const result = await boostProfileConnections(profile.id, value, mode);
      setTotal(result.newCount);
      onCount(profile.id, result.newCount);
      setPhase({ type: "done", delta: result.newCount - before });
    } catch (error) {
      setPhase({ type: "error", msg: error instanceof Error ? error.message : "Update failed" });
    }
  }

  const open = phase.type === "panel" || phase.type === "saving";

  return (
    <article
      className={`rounded-2xl border px-4 py-3 transition ${
        open || selected ? "border-cyan-400/35 bg-cyan-400/5" : "border-zinc-800 bg-zinc-950/40 hover:border-cyan-400/25"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${name}`}
          className="mt-3 h-4 w-4 accent-cyan-400"
        />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 font-mono text-xs text-cyan-100">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-50">{name}</p>
          <p className="truncate text-xs text-zinc-500">{profile.username ? `@${profile.username}` : "No username"}</p>
          <span className="mt-1 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{profile.account_role}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className="font-mono text-sm tabular-nums text-zinc-100">{total.toLocaleString()}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">connections</p>
          {phase.type !== "saving" && phase.type !== "panel" && (
            <button
              type="button"
              onClick={() => setPhase({ type: "panel" })}
              className="rounded-xl border border-cyan-400/30 px-3 py-1 text-xs text-cyan-100 hover:border-cyan-300/60"
            >
              Adjust
            </button>
          )}
          {phase.type === "saving" && <span className="font-mono text-[10px] uppercase tracking-wide text-cyan-300">Writing</span>}
        </div>
      </div>
      {open && (
        <AdjustPanel
          noun="connections"
          current={total}
          floor={profile.real_connections}
          busy={phase.type === "saving"}
          onApply={apply}
          onCancel={() => setPhase({ type: "idle" })}
        />
      )}
      <StatusLine phase={phase} noun="connections" onDismiss={() => setPhase({ type: "idle" })} />
    </article>
  );
}

function RowSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 rounded bg-zinc-800" />
        <div className="h-10 flex-1 rounded bg-zinc-800" />
        <div className="h-8 w-16 rounded bg-zinc-800" />
      </div>
    </div>
  );
}

export function CheatsView() {
  const [tab, setTab] = useState<Tab>("posts");
  const [postQuery, setPostQuery] = useState("");
  const [profileQuery, setProfileQuery] = useState("");
  const [postSearch, setPostSearch] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [postSort, setPostSort] = useState<PostSort>("recent");
  const [profileSort, setProfileSort] = useState<ProfileSort>("name");
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [postsMore, setPostsMore] = useState(false);
  const [profilesMore, setProfilesMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<Mode>("add");
  const [bulkAmount, setBulkAmount] = useState("25");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setPostSearch(postQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [postQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setProfileSearch(profileQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [profileQuery]);

  const activeSearch = tab === "posts" ? postSearch : profileSearch;
  const activeSort = tab === "posts" ? postSort : profileSort;

  useEffect(() => {
    const id = ++requestId.current;
    setLoadError(null);
    setSelected(new Set());
    setBulkNote(null);
    if (tab === "posts") setPostsLoading(true);
    else setProfilesLoading(true);

    const request =
      tab === "posts"
        ? fetchPosts(activeSearch || undefined, 0, activeSort as PostSort)
        : fetchProfileItems(activeSearch || undefined, 0, activeSort as ProfileSort);

    request
      .then((rows) => {
        if (requestId.current !== id) return;
        if (tab === "posts") {
          setPosts(rows as PostItem[]);
          setPostsMore(rows.length === PAGE);
        } else {
          setProfiles(rows as ProfileItem[]);
          setProfilesMore(rows.length === PAGE);
        }
      })
      .catch((error) => {
        if (requestId.current !== id) return;
        if (tab === "posts") setPosts([]);
        else setProfiles([]);
        setLoadError(error instanceof Error ? error.message : "Failed to load");
      })
      .finally(() => {
        if (requestId.current !== id) return;
        if (tab === "posts") setPostsLoading(false);
        else setProfilesLoading(false);
      });
  }, [tab, activeSearch, activeSort]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setLoadError(null);
    try {
      if (tab === "posts") {
        const rows = await fetchPosts(postSearch || undefined, posts.length, postSort);
        setPosts((current) => [...current, ...rows]);
        setPostsMore(rows.length === PAGE);
      } else {
        const rows = await fetchProfileItems(profileSearch || undefined, profiles.length, profileSort);
        setProfiles((current) => [...current, ...rows]);
        setProfilesMore(rows.length === PAGE);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [tab, postSearch, profileSearch, postSort, profileSort, posts.length, profiles.length]);

  const visibleIds = tab === "posts" ? posts.map((post) => post.id) : profiles.map((profile) => profile.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const loading = tab === "posts" ? postsLoading : profilesLoading;
  const hasMore = tab === "posts" ? postsMore : profilesMore;
  const rawQuery = tab === "posts" ? postQuery : profileQuery;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visibleIds));
  }

  async function applySelected(event: FormEvent) {
    event.preventDefault();
    const value = Math.max(0, Math.min(1_000_000, Math.floor(Number(bulkAmount) || 0)));
    if (bulkMode === "add" && value < 1) return;
    const ids = [...selected];
    setBulkBusy(true);
    setBulkNote(null);
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        if (tab === "posts") {
          const next = await boostPostLikes(id, value, bulkMode);
          setPosts((current) => current.map((post) => (post.id === id ? { ...post, likes_count: next } : post)));
        } else {
          const result = await boostProfileConnections(id, value, bulkMode);
          setProfiles((current) =>
            current.map((profile) => (profile.id === id ? { ...profile, connections_count: result.newCount } : profile)),
          );
        }
        done += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    setBulkNote(failed ? `${done} updated, ${failed} failed` : `Updated ${done}`);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400/80">Engagement</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Cheats</h1>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["posts", "Feed"],
              ["profiles", "Users"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-xl border px-3 py-2 text-sm ${
                tab === id ? "border-cyan-400/40 text-cyan-100" : "border-zinc-700 text-zinc-300 hover:border-cyan-400/30"
              }`}
            >
              {label}
            </button>
          ))}
          <select
            value={tab === "posts" ? postSort : profileSort}
            onChange={(event) => {
              if (tab === "posts") setPostSort(event.target.value as PostSort);
              else setProfileSort(event.target.value as ProfileSort);
            }}
            className="ml-auto rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-400/50"
          >
            {tab === "posts" ? (
              <>
                <option value="recent">Newest</option>
                <option value="likes">Most likes</option>
              </>
            ) : (
              <>
                <option value="name">Name</option>
                <option value="connections">Most connections</option>
              </>
            )}
          </select>
        </div>

        <div className="relative mt-3">
          <input
            type="text"
            value={rawQuery}
            onChange={(event) => (tab === "posts" ? setPostQuery(event.target.value) : setProfileQuery(event.target.value))}
            placeholder={tab === "posts" ? "Search author, group, hub, or text" : "Search name or username"}
            className={`${fieldCls} pl-3`}
          />
        </div>

        {selected.size > 0 && (
          <form onSubmit={applySelected} className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-3">
            <p className="mr-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200">{selected.size} selected</p>
            <div className="flex rounded-xl border border-zinc-800 p-0.5">
              {(["add", "set"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setBulkMode(option)}
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    bulkMode === option ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-400"
                  }`}
                >
                  {option === "add" ? "Add" : "Set"}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              value={bulkAmount}
              onChange={(event) => setBulkAmount(event.target.value)}
              className={`${fieldCls} w-28`}
              aria-label={bulkMode === "add" ? "Amount to add" : "Exact total"}
            />
            <button
              type="submit"
              disabled={bulkBusy}
              className="rounded-xl border border-cyan-400/40 px-3 py-2 text-sm text-cyan-100 disabled:opacity-40"
            >
              {bulkBusy ? "Writing…" : "Apply to selected"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300"
            >
              Clear
            </button>
          </form>
        )}
        {bulkNote && <p className="mt-2 font-mono text-xs text-cyan-200/80">{bulkNote}</p>}
      </div>

      <div className="space-y-2">
        {!loading && visibleIds.length > 0 && (
          <label className="flex items-center gap-2 px-1 text-xs text-zinc-500">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-cyan-400" />
            Select loaded
            <span className="font-mono text-[10px] uppercase tracking-wide">{visibleIds.length} shown</span>
          </label>
        )}

        {loadError && (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{loadError}</div>
        )}

        {loading
          ? Array.from({ length: 4 }).map((_, index) => <RowSkeleton key={index} />)
          : tab === "posts"
            ? posts.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  selected={selected.has(post.id)}
                  onToggle={() => toggle(post.id)}
                  onCount={(id, total) =>
                    setPosts((current) => current.map((item) => (item.id === id ? { ...item, likes_count: total } : item)))
                  }
                />
              ))
            : profiles.map((profile) => (
                <ProfileRow
                  key={profile.id}
                  profile={profile}
                  selected={selected.has(profile.id)}
                  onToggle={() => toggle(profile.id)}
                  onCount={(id, total) =>
                    setProfiles((current) =>
                      current.map((item) => (item.id === id ? { ...item, connections_count: total } : item)),
                    )
                  }
                />
              ))}

        {!loading && !loadError && visibleIds.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-12 text-center text-sm text-zinc-500">
            {rawQuery ? "Nothing matches that search" : "Nothing to show"}
          </div>
        )}

        {!loading && hasMore && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="w-full rounded-xl border border-zinc-700 py-2 text-sm text-zinc-300 hover:border-cyan-400/40 hover:text-cyan-100 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
