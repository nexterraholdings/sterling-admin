"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminGroupListItem, GroupVisibility } from "@/lib/groups/types";
import { GROUP_CATEGORY_LABELS, GROUP_VISIBILITY_LABELS, GROUP_VISIBILITY_VALUES, groupCategoryLabel } from "@/lib/groups/types";
import type { SeededHubListItem } from "@/lib/seeded-hubs/types";
import { inputCls, readApiJson, SeedingBreadcrumb } from "../shared";

function SterlingPill() {
  return (
    <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200 ring-1 ring-blue-500/25">
      Sterling
    </span>
  );
}

export function GroupsBrowser({ hubId }: { hubId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [hub, setHub] = useState<SeededHubListItem | null>(null);
  const [hubLoading, setHubLoading] = useState(true);
  const [groups, setGroups] = useState<AdminGroupListItem[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategories, setFormCategories] = useState<string[]>(["other"]);
  const [formVisibility, setFormVisibility] = useState<GroupVisibility>("public");
  const [formAvatarFile, setFormAvatarFile] = useState<File | null>(null);
  const [formAvatarPreview, setFormAvatarPreview] = useState<string | null>(null);

  const loadHub = useCallback(async () => {
    setHubLoading(true);
    try {
      const res = await fetch(`/api/admin/seeded-hubs/${encodeURIComponent(hubId)}`);
      const payload = await readApiJson<{ hub?: SeededHubListItem; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load hub");
      setHub(payload.hub ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hub");
    } finally {
      setHubLoading(false);
    }
  }, [hubId]);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await fetch(`/api/admin/groups?hubId=${encodeURIComponent(hubId)}&pageSize=100`);
      const payload = await readApiJson<{ groups?: AdminGroupListItem[]; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load groups");
      setGroups(payload.groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load groups");
    } finally {
      setGroupsLoading(false);
    }
  }, [hubId]);

  useEffect(() => {
    loadHub();
    loadGroups();
  }, [loadHub, loadGroups]);

  function resetCreateForm() {
    setFormTitle("");
    setFormDescription("");
    setFormCategories(["other"]);
    setFormVisibility("public");
    setFormAvatarFile(null);
    setFormAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function toggleCreateForm() {
    if (showCreateForm) resetCreateForm();
    setShowCreateForm((v) => !v);
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
    setFormAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function handleCreateGroup() {
    const title = formTitle.trim();
    if (!title) {
      setError("Title is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("hubId", hubId);
      formData.set("title", title);
      formData.set("description", formDescription.trim());
      formData.set("visibility", formVisibility);
      for (const category of formCategories) formData.append("categories", category);
      if (formAvatarFile) formData.set("avatar", formAvatarFile);

      const res = await fetch("/api/admin/groups", { method: "POST", body: formData });
      const payload = await readApiJson<{ group?: AdminGroupListItem; error?: string }>(res);
      if (!res.ok || !payload.group) throw new Error(payload.error ?? "Failed to create group");

      // Jump straight into the new group so it can be seeded with prop-account content.
      router.push(`/dashboard/users/seeding-content/${hubId}/${payload.group.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <SeedingBreadcrumb hub={hub ? { id: hub.id, title: hub.title } : { id: hubId, title: "..." }} />

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-200">Groups in this hub</div>
        <Button
          size="sm"
          variant="secondary"
          className="border-zinc-700 text-zinc-100"
          onClick={toggleCreateForm}
        >
          {showCreateForm ? "Cancel" : "+ New Sterling group"}
        </Button>
      </div>

      {showCreateForm && (
        <div className="grid gap-3 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 p-4 md:grid-cols-[80px_1fr]">
          <div className="flex flex-col items-center gap-2">
            <div className="h-16 w-16 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900">
              {formAvatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={formAvatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-600">
                  No photo
                </div>
              )}
            </div>
            <label className="cursor-pointer text-[11px] font-semibold text-blue-300 hover:text-blue-200">
              {formAvatarFile ? "Change" : "Upload"}
              <input type="file" accept="image/*" className="hidden" onChange={handleFormAvatarChange} />
            </label>
          </div>
          <div className="grid gap-2">
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              maxLength={40}
              placeholder="Group name"
              className={inputCls}
            />
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              maxLength={240}
              placeholder="What's this group about?"
              className={`${inputCls} min-h-[52px] resize-y`}
            />
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
                        ? "border-blue-500/50 bg-blue-500/10 text-blue-200"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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
            <Button
              className="bg-blue-500 text-zinc-950 hover:bg-blue-400"
              onClick={handleCreateGroup}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create group"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {groupsLoading || hubLoading ? (
          <div className="p-6 text-center text-sm text-zinc-500">Loading groups...</div>
        ) : groups.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">This hub has no groups yet.</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => router.push(`/dashboard/users/seeding-content/${hubId}/${group.id}`)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-blue-500/40 hover:bg-zinc-900/70"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="truncate text-sm font-semibold text-zinc-100">{group.title}</div>
                    {group.is_system_owned && <SterlingPill />}
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {groupCategoryLabel(group.category)} · {group.member_count} member
                    {group.member_count === 1 ? "" : "s"}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 border-zinc-700 text-zinc-300">
                  {group.post_count} post{group.post_count === 1 ? "" : "s"}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
