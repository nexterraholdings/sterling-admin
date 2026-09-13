"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, personLabel } from "@/app/dashboard/discussions/discussionUi";
import { GroupContentWorkspace } from "@/app/dashboard/users/seeding-content/GroupContentWorkspace";
import { readApiJson } from "@/app/dashboard/users/seeding-content/shared";
import type { AdminGroupListItem } from "@/lib/groups/types";
import { groupCategoryLabel } from "@/lib/groups/types";
import { MembersPanel } from "./MembersPanel";

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

  const loadGroup = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}`);
      const payload = await readApiJson<{ group?: AdminGroupListItem; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load group");
      setGroup(payload.group ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load group");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

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

      <MembersPanel groupId={groupId} />
      <GroupContentWorkspace groupId={groupId} />
    </div>
  );
}
