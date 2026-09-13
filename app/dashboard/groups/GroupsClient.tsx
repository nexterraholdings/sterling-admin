"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Avatar,
  formatRelativeTime,
  personLabel,
} from "@/app/dashboard/discussions/discussionUi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminGroupListItem, GroupVisibility } from "@/lib/groups/types";
import { GROUP_CATEGORY_LABELS, GROUP_VISIBILITY_LABELS, GROUP_VISIBILITY_VALUES, groupCategoryLabel } from "@/lib/groups/types";
import type { SeededHubListItem, SeededPlaceKind } from "@/lib/seeded-hubs/types";

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest" },
  { value: "created_at", label: "Oldest" },
  { value: "title", label: "A → Z" },
];

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15 disabled:opacity-50";

async function readApiJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.status === 404
        ? "That admin API route is missing. Refresh the page and try again."
        : "The server returned a page instead of data. Refresh and try again.",
    );
  }
}

function KindBadge({ kind }: { kind: SeededPlaceKind | null | undefined }) {
  const neighborhood = kind === "neighborhood";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        neighborhood
          ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/25"
          : "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/25"
      }`}
    >
      {neighborhood ? "Nabe" : "City"}
    </span>
  );
}

function GroupAvatar({ group, size = "md" }: { group: AdminGroupListItem; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  if (group.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={group.avatar_url}
        alt=""
        className={`${dims} shrink-0 rounded-2xl object-cover ring-1 ring-zinc-800`}
      />
    );
  }
  return <Avatar id={group.id} person={{ full_name: group.title, username: null }} size={size} />;
}

export function GroupsClient() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [hubId, setHubId] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);

  const [groups, setGroups] = useState<AdminGroupListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seededHubs, setSeededHubs] = useState<SeededHubListItem[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [groupModalMode, setGroupModalMode] = useState<"create" | "edit" | null>(null);
  const [editingGroup, setEditingGroup] = useState<AdminGroupListItem | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategories, setFormCategories] = useState<string[]>(["other"]);
  const [formVisibility, setFormVisibility] = useState<GroupVisibility>("public");
  const [formHubId, setFormHubId] = useState("");
  const [formHubQuery, setFormHubQuery] = useState("");
  const [formAvatarFile, setFormAvatarFile] = useState<File | null>(null);
  const [formAvatarPreview, setFormAvatarPreview] = useState<string | null>(null);
  const [formClearAvatar, setFormClearAvatar] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const currentFilterHub = seededHubs.find((hub) => hub.id === hubId) ?? null;

  const load = useCallback(() => {
    const append = page > 1;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort,
    });
    if (search.trim()) params.set("search", search.trim());
    if (hubId) params.set("hubId", hubId);
    if (includeArchived) params.set("includeArchived", "1");

    fetch(`/api/admin/groups?${params.toString()}`)
      .then(async (res) => {
        const body = await readApiJson<{
          error?: string;
          groups?: AdminGroupListItem[];
          total?: number;
        }>(res);
        if (!res.ok) throw new Error(body.error || "Failed to load groups");
        setTotal(body.total ?? 0);
        setGroups((prev) => {
          const incoming = body.groups ?? [];
          if (page === 1) return incoming;
          const ids = new Set(prev.map((group) => group.id));
          return [...prev, ...incoming.filter((group) => !ids.has(group.id))];
        });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to load groups";
        setError(
          message === "Failed to fetch"
            ? "Could not reach the groups API. Restart SterlingAdmin and refresh."
            : message,
        );
      })
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, [search, hubId, includeArchived, sort, page, refreshNonce]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/seeded-hubs")
      .then(async (res) => {
        const body = await readApiJson<{ error?: string; hubs?: SeededHubListItem[] }>(res);
        if (!res.ok) throw new Error(body.error || "Failed to load hubs");
        setSeededHubs(body.hubs ?? []);
      })
      .catch(() => {});
  }, []);

  const hasMore = groups.length < total;
  const hasFilters = Boolean(search.trim() || hubId || includeArchived);

  const formVisibleHubs = useMemo(() => {
    const q = formHubQuery.trim().toLowerCase();
    return q
      ? seededHubs.filter((hub) => `${hub.title} ${hub.location_hint ?? ""}`.toLowerCase().includes(q))
      : seededHubs;
  }, [seededHubs, formHubQuery]);

  function resetGroupForm() {
    setFormTitle("");
    setFormDescription("");
    setFormCategories(["other"]);
    setFormVisibility("public");
    setFormHubId("");
    setFormHubQuery("");
    setFormAvatarFile(null);
    setFormAvatarPreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setFormClearAvatar(false);
  }

  function openCreateGroup() {
    resetGroupForm();
    setEditingGroup(null);
    setGroupModalMode("create");
  }

  function openEditGroup(group: AdminGroupListItem) {
    setEditingGroup(group);
    setFormTitle(group.title);
    setFormDescription(group.description ?? "");
    setFormCategories(group.categories.length ? group.categories : ["other"]);
    setFormVisibility((group.visibility as GroupVisibility) || "public");
    setFormHubId(group.discussion_id);
    setFormHubQuery("");
    setFormAvatarFile(null);
    setFormAvatarPreview(group.avatar_url);
    setFormClearAvatar(false);
    setGroupModalMode("edit");
  }

  function closeGroupModal() {
    setGroupModalMode(null);
    setEditingGroup(null);
  }

  function toggleFormCategory(id: string) {
    setFormCategories((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((c) => c !== id);
        return next.length ? next : ["other"];
      }
      if (prev.length >= 4) return prev;
      return [...prev.filter((c) => c !== "other"), id];
    });
  }

  function handleFormAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFormAvatarFile(file);
    setFormClearAvatar(false);
    setFormAvatarPreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function saveGroup() {
    const title = formTitle.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    if (groupModalMode === "create" && !formHubId) {
      toast.error("Pick a hub for this group.");
      return;
    }

    const formData = new FormData();
    if (groupModalMode === "create") formData.set("hubId", formHubId);
    else if (formHubId) formData.set("hubId", formHubId);
    formData.set("title", title);
    formData.set("description", formDescription.trim());
    formData.set("visibility", formVisibility);
    for (const category of formCategories) formData.append("categories", category);
    if (formAvatarFile) formData.set("avatar", formAvatarFile);
    if (formClearAvatar) formData.set("clearAvatar", "1");

    setSavingGroup(true);
    try {
      const url = groupModalMode === "create" ? "/api/admin/groups" : `/api/admin/groups/${editingGroup?.id}`;
      const res = await fetch(url, { method: groupModalMode === "create" ? "POST" : "PATCH", body: formData });
      const json = await readApiJson<{ group?: AdminGroupListItem; error?: string }>(res);
      if (!res.ok || !json.group) throw new Error(json.error || "Failed to save group");

      const created = groupModalMode === "create";
      toast.success(created ? `Created "${json.group.title}"` : `Saved "${json.group.title}"`);
      closeGroupModal();
      if (created) {
        router.push(`/dashboard/groups/${json.group.id}`);
        return;
      }
      setPage(1);
      setRefreshNonce((n) => n + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save group";
      toast.error(message);
    } finally {
      setSavingGroup(false);
    }
  }

  return (
    <div className="-m-4 flex h-[calc(100dvh-4.75rem)] min-h-0 flex-col overflow-hidden sm:-m-6 sm:h-[calc(100dvh-5rem)] lg:-m-8">
      {error && (
        <div className="shrink-0 border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 sm:px-5">
          {error}
        </div>
      )}

      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Content</p>
            <h1 className="mt-1 text-lg font-semibold text-zinc-50">Groups</h1>
            <p className="mt-0.5 max-w-2xl text-xs text-zinc-500">
              Browse groups, then open one to seed it with prop accounts — add prop members and publish content.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <Metric label="Groups" value={loading && page === 1 ? "…" : String(total)} />
              <Metric label="Hubs" value={String(seededHubs.length)} />
            </div>
            <button
              type="button"
              onClick={openCreateGroup}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              <Sparkles className="h-3.5 w-3.5" />
              New Sterling group
            </button>
            <Link
              href="/dashboard/seed-hubs"
              className="rounded-xl border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Convert pins
            </Link>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-zinc-800 px-4 py-2.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                ref={searchRef}
                className={`${inputCls} h-9 pl-9 text-xs`}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter by group or hub name"
                autoComplete="off"
              />
            </div>
            <select
              className={`${inputCls} h-9 w-auto max-w-[11rem] py-1.5 text-xs`}
              value={hubId}
              onChange={(e) => {
                setHubId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All hubs</option>
              {seededHubs.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hub.title}
                </option>
              ))}
            </select>
            <select
              className={`${inputCls} h-9 w-auto py-1.5 text-xs`}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setIncludeArchived((v) => !v);
                setPage(1);
              }}
              className={`h-9 rounded-xl px-3 text-xs font-semibold ring-1 transition ${
                includeArchived
                  ? "bg-zinc-100 text-zinc-900 ring-zinc-200"
                  : "bg-zinc-900 text-zinc-400 ring-zinc-800 hover:text-zinc-200"
              }`}
            >
              Archived
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setHubId("");
                  setIncludeArchived(false);
                  setPage(1);
                  searchRef.current?.focus();
                }}
                className="h-9 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            {loading && page === 1
              ? "Loading groups…"
              : `${groups.length.toLocaleString()} of ${total.toLocaleString()} shown`}
            {currentFilterHub ? ` · in ${currentFilterHub.title}` : ""}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && page === 1 ? (
            <div className="space-y-0">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 border-b border-zinc-800/80 px-4 py-3">
                  <div className="h-10 w-10 rounded-2xl bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 rounded bg-zinc-800" />
                    <div className="h-3 w-1/5 rounded bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div>
                <p className="text-base font-medium text-zinc-200">
                  {hasFilters ? "No groups match" : "No groups yet"}
                </p>
                <p className="mt-1 max-w-sm text-sm text-zinc-500">
                  {hasFilters
                    ? "Try a shorter name, another hub, or include archived groups."
                    : "Groups appear after people start them in a seeded hub, or after you convert user pins."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="divide-y divide-zinc-800/80 md:hidden">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-900/70"
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/groups/${group.id}`)}
                      className="flex flex-1 items-start gap-3 text-left"
                    >
                      <GroupAvatar group={group} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold text-zinc-100">{group.title}</span>
                          {group.archived_at && <ArchivedPill />}
                          {group.is_system_owned && <SterlingPill />}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                          {group.hub?.title ?? "Unknown hub"} · {groupCategoryLabel(group.category)}
                        </span>
                        <span className="mt-1 block text-[11px] tabular-nums text-zinc-600">
                          {group.member_count} members · {group.post_count} posts
                        </span>
                      </span>
                    </button>
                    {group.is_system_owned && (
                      <button
                        type="button"
                        onClick={() => openEditGroup(group)}
                        className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-emerald-300"
                        aria-label={`Edit ${group.title}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <table className="hidden min-w-full text-left text-sm md:table">
                <thead className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-2">Group</th>
                    <th className="px-3 py-2">Hub</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2 text-right">Members</th>
                    <th className="px-3 py-2 text-right">Posts</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {groups.map((group) => (
                    <tr
                      key={group.id}
                      onClick={() => router.push(`/dashboard/groups/${group.id}`)}
                      className="cursor-pointer hover:bg-zinc-900/70"
                    >
                      <td className="max-w-[16rem] px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <GroupAvatar group={group} size="sm" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate font-semibold text-zinc-100">{group.title}</p>
                              {group.archived_at && <ArchivedPill />}
                              {group.is_system_owned && <SterlingPill />}
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                              {groupCategoryLabel(group.category)} · {formatRelativeTime(group.created_at)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[11rem] px-3 py-2.5">
                        {group.hub ? (
                          <Link
                            href={`/dashboard/discussions/${group.hub.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate font-medium text-zinc-200 hover:text-emerald-300"
                          >
                            {group.hub.title}
                          </Link>
                        ) : (
                          <span className="text-zinc-500">Unknown hub</span>
                        )}
                        {group.hub?.location_hint && (
                          <p className="truncate text-[11px] text-zinc-500">{group.hub.location_hint}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400">
                        <p className="truncate text-xs">{personLabel(group.creator)}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{group.member_count}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{group.post_count}</td>
                      <td className="px-3 py-2.5 text-right">
                        {group.is_system_owned && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditGroup(group);
                            }}
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-emerald-300"
                            aria-label={`Edit ${group.title}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {hasMore && (
                <div className="flex justify-center border-t border-zinc-800 py-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (loadingMore || loading) return;
                      setPage((p) => p + 1);
                    }}
                    disabled={loadingMore}
                    className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    {loadingMore
                      ? "Loading…"
                      : `Load more (${groups.length.toLocaleString()} of ${total.toLocaleString()})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={groupModalMode !== null} onOpenChange={(open) => !open && closeGroupModal()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{groupModalMode === "edit" ? "Edit Sterling group" : "New Sterling group"}</DialogTitle>
            <DialogDescription>
              Owned by the Sterling system account, not a real user. Always eligible for public discovery.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                {formAvatarPreview && !formClearAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={formAvatarPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-600">
                    No photo
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="cursor-pointer text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                  {formAvatarFile ? "Change photo" : "Upload photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleFormAvatarChange} />
                </label>
                {(formAvatarPreview || formAvatarFile) && !formClearAvatar && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormAvatarFile(null);
                      setFormAvatarPreview(null);
                      setFormClearAvatar(true);
                    }}
                    className="text-left text-xs font-semibold text-zinc-500 hover:text-rose-300"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Title
              </label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                maxLength={40}
                className={inputCls}
                placeholder="Group name"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Description
              </label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                maxLength={240}
                className={`${inputCls} min-h-[64px] resize-y`}
                placeholder="What's this group about?"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Categories (up to 4)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(GROUP_CATEGORY_LABELS).map(([id, label]) => {
                  const active = formCategories.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleFormCategory(id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        active
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                          : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Visibility
              </label>
              <select
                value={formVisibility}
                onChange={(e) => setFormVisibility(e.target.value as GroupVisibility)}
                className={inputCls}
              >
                {GROUP_VISIBILITY_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {GROUP_VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Hub
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  value={formHubQuery}
                  onChange={(e) => setFormHubQuery(e.target.value)}
                  placeholder="Search hubs"
                  className={`${inputCls} pl-9`}
                />
              </div>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-1.5">
                {formVisibleHubs.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-zinc-500">No hubs match.</p>
                ) : (
                  formVisibleHubs.map((hub) => {
                    const active = hub.id === formHubId;
                    return (
                      <button
                        key={hub.id}
                        type="button"
                        onClick={() => setFormHubId(hub.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                          active ? "bg-emerald-500/10 text-emerald-200" : "text-zinc-300 hover:bg-zinc-900"
                        }`}
                      >
                        <span className="truncate">{hub.title}</span>
                        <span className="shrink-0 text-zinc-600">{hub.group_count} groups</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={closeGroupModal}
              disabled={savingGroup}
              className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveGroup()}
              disabled={savingGroup}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              {savingGroup ? "Saving…" : groupModalMode === "edit" ? "Save changes" : "Create group"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-zinc-100">{value}</p>
    </div>
  );
}

function ArchivedPill() {
  return (
    <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-zinc-700">
      Archived
    </span>
  );
}

function SterlingPill() {
  return (
    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200 ring-1 ring-emerald-500/25">
      Sterling
    </span>
  );
}
