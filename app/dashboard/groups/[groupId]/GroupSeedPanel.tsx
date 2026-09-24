"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, personLabel } from "@/app/dashboard/discussions/discussionUi";
import { readApiJson } from "@/app/dashboard/users/seeding-content/shared";
import type { AdminGroupListItem } from "@/lib/groups/types";
import { GROUP_GUIDELINES_MAX_CHARS, groupCategoryLabel } from "@/lib/groups/types";
import { GroupOpsTabs } from "./GroupOpsTabs";

function SterlingPill() {
  return (
    <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200 ring-1 ring-blue-500/25">
      Sterling
    </span>
  );
}

export function GroupSeedPanel({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<AdminGroupListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftGuidelines, setDraftGuidelines] = useState("");
  const [savingGuidelines, setSavingGuidelines] = useState(false);
  const [guidelinesMessage, setGuidelinesMessage] = useState<string | null>(null);

  const loadGroup = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}`);
      const payload = await readApiJson<{ group?: AdminGroupListItem; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load group");
      const next = payload.group ?? null;
      setGroup(next);
      setDraftGuidelines(next?.guidelines ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load group");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  async function saveGuidelines() {
    if (!group?.is_system_owned) return;
    setSavingGuidelines(true);
    setGuidelinesMessage(null);
    try {
      const formData = new FormData();
      formData.append("guidelines", draftGuidelines);
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}`, {
        method: "PATCH",
        body: formData,
      });
      const payload = await readApiJson<{ group?: AdminGroupListItem; error?: string }>(res);
      if (!res.ok || !payload.group) throw new Error(payload.error ?? "Failed to save guidelines");
      setGroup(payload.group);
      setDraftGuidelines(payload.group.guidelines ?? "");
      setGuidelinesMessage("Guidelines saved.");
    } catch (e) {
      setGuidelinesMessage(e instanceof Error ? e.message : "Failed to save guidelines");
    } finally {
      setSavingGuidelines(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Link href="/dashboard/groups" className="hover:text-zinc-200">
          Groups
        </Link>
        <span>/</span>
        <span className="text-blue-300">{loading ? "..." : group?.title ?? "Group"}</span>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!loading && group && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-start gap-3">
            {group.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
            ) : (
              <Avatar id={group.id} person={{ full_name: group.title, username: null }} size="md" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-base font-semibold text-zinc-50">{group.title}</span>
                {group.is_system_owned && <SterlingPill />}
              </div>
              {group.description && (
                <p className="mt-0.5 text-sm text-zinc-400">{group.description}</p>
              )}
              <p className="mt-1 text-xs text-zinc-500">
                {groupCategoryLabel(group.category)} · {group.visibility} · {group.member_count} member
                {group.member_count === 1 ? "" : "s"} · {group.post_count} post{group.post_count === 1 ? "" : "s"}
                {group.hub && (
                  <>
                    {" "}
                    · in{" "}
                    <Link href={`/dashboard/discussions/${group.hub.id}`} className="text-blue-300 hover:text-blue-200">
                      {group.hub.title}
                    </Link>
                  </>
                )}
              </p>
              {!group.is_system_owned && (
                <p className="mt-1 text-xs text-zinc-500">Created by {personLabel(group.creator)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && group && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Guidelines</p>
              <p className="mt-1 text-sm text-zinc-400">Shown in the app before people join.</p>
            </div>
            {group.is_system_owned ? (
              <button
                type="button"
                onClick={() => void saveGuidelines()}
                disabled={savingGuidelines}
                className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {savingGuidelines ? "Saving…" : "Save guidelines"}
              </button>
            ) : null}
          </div>
          {guidelinesMessage && (
            <p className="mt-2 text-xs text-zinc-400">{guidelinesMessage}</p>
          )}
          {group.is_system_owned ? (
            <textarea
              value={draftGuidelines}
              maxLength={GROUP_GUIDELINES_MAX_CHARS}
              onChange={(e) => setDraftGuidelines(e.target.value)}
              className="mt-3 min-h-[120px] w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
              placeholder="Be kind. Keep it local."
            />
          ) : group.guidelines ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{group.guidelines}</p>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No guidelines. Only the group owner can edit these in the app.</p>
          )}
        </div>
      )}

      <GroupOpsTabs groupId={groupId} />
    </div>
  );
}
