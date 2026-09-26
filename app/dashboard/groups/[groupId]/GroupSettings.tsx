"use client";

import { useCallback, useEffect, useState } from "react";
import { readApiJson } from "@/app/dashboard/users/seeding-content/shared";
import type { AdminGroupListItem, GroupVisibility } from "@/lib/groups/types";
import {
  GROUP_CATEGORY_LABELS,
  GROUP_GUIDELINES_MAX_CHARS,
  GROUP_VISIBILITY_LABELS,
  GROUP_VISIBILITY_VALUES,
  groupCategoryLabel,
} from "@/lib/groups/types";

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15 disabled:opacity-50";

export function GroupSettings({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<AdminGroupListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [visibility, setVisibility] = useState<GroupVisibility>("public");
  const [guidelines, setGuidelines] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}`);
      const payload = await readApiJson<{ group?: AdminGroupListItem; error?: string }>(res);
      if (!res.ok || !payload.group) throw new Error(payload.error ?? "Failed to load group");
      setGroup(payload.group);
      setTitle(payload.group.title);
      setDescription(payload.group.description ?? "");
      setCategory(payload.group.category || "other");
      setVisibility((GROUP_VISIBILITY_VALUES.includes(payload.group.visibility as GroupVisibility) ? payload.group.visibility : "public") as GroupVisibility);
      setGuidelines(payload.group.guidelines ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load group");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!group?.is_system_owned) return;
    setSaving(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("categories", category);
      formData.append("visibility", visibility);
      formData.append("guidelines", guidelines);
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}`, { method: "PATCH", body: formData });
      const payload = await readApiJson<{ group?: AdminGroupListItem; error?: string }>(res);
      if (!res.ok || !payload.group) throw new Error(payload.error ?? "Failed to save settings");
      setGroup(payload.group);
      setMessage("Settings saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading settings…</p>;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!group) return null;

  const editable = group.is_system_owned;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-50">Settings</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {editable ? "Name, access, category, and the guidelines people see before they join." : "Only Sterling-owned groups can be edited here."}
          </p>
        </div>
        {editable ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !title.trim()}
            className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        ) : null}
      </div>
      {message ? <p className="mt-3 text-xs text-zinc-400">{message}</p> : null}
      <div className="mt-4 grid gap-3">
        <label className="text-xs text-zinc-400">
          Name
          {editable ? (
            <input className={`${inputCls} mt-1`} maxLength={40} value={title} onChange={(event) => setTitle(event.target.value)} />
          ) : (
            <p className="mt-1 text-sm text-zinc-100">{group.title}</p>
          )}
        </label>
        <label className="text-xs text-zinc-400">
          Description
          {editable ? (
            <textarea className={`${inputCls} mt-1 min-h-20 resize-y`} value={description} onChange={(event) => setDescription(event.target.value)} />
          ) : (
            <p className="mt-1 text-sm text-zinc-100">{group.description || "No description."}</p>
          )}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">
            Category
            {editable ? (
              <select className={`${inputCls} mt-1`} value={category} onChange={(event) => setCategory(event.target.value)}>
                {Object.entries(GROUP_CATEGORY_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-sm text-zinc-100">{groupCategoryLabel(group.category)}</p>
            )}
          </label>
          <label className="text-xs text-zinc-400">
            Who can join
            {editable ? (
              <select
                className={`${inputCls} mt-1`}
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as GroupVisibility)}
              >
                {GROUP_VISIBILITY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {GROUP_VISIBILITY_LABELS[value]}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-sm text-zinc-100">{GROUP_VISIBILITY_LABELS[visibility]}</p>
            )}
          </label>
        </div>
        <label className="text-xs text-zinc-400">
          Guidelines
          {editable ? (
            <textarea
              className={`${inputCls} mt-1 min-h-28 resize-y`}
              maxLength={GROUP_GUIDELINES_MAX_CHARS}
              value={guidelines}
              placeholder="Be kind. Keep it local."
              onChange={(event) => setGuidelines(event.target.value)}
            />
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-100">{group.guidelines || "No guidelines."}</p>
          )}
        </label>
      </div>
    </section>
  );
}
