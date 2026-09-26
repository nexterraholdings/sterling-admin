"use client";

import { useEffect, useState } from "react";
import { readApiJson } from "@/app/dashboard/users/seeding-content/shared";
import type { AdminGroupContentItem, AdminGroupListItem, AdminGroupMember } from "@/lib/groups/types";

type Snapshot = {
  members: number;
  propMembers: number;
  posts: number;
  replies: number;
  likes: number;
  days: Array<{ label: string; count: number }>;
  voices: Array<{ name: string; count: number }>;
};

function dayKey(value: string) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function flatten(items: AdminGroupContentItem[]): AdminGroupContentItem[] {
  return items.flatMap((item) => [item, ...flatten(item.replies ?? [])]);
}

function buildSnapshot(group: AdminGroupListItem, members: AdminGroupMember[], items: AdminGroupContentItem[]): Snapshot {
  const lines = flatten(items);
  const posts = lines.filter((item) => !item.parent_id);
  const replies = lines.filter((item) => item.parent_id);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const label = date.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" });
    return { key, label, count: 0 };
  });
  for (const item of lines) {
    const key = dayKey(item.created_at);
    const day = days.find((entry) => entry.key === key);
    if (day) day.count += 1;
  }
  const byAuthor = new Map<string, number>();
  for (const item of lines) {
    const name = item.author?.full_name?.trim() || (item.author?.username ? `@${item.author.username}` : "Unknown");
    byAuthor.set(name, (byAuthor.get(name) ?? 0) + 1);
  }
  return {
    members: group.member_count,
    propMembers: members.filter((member) => member.is_prop_account).length,
    posts: posts.length,
    replies: replies.length,
    likes: lines.reduce((sum, item) => sum + Number(item.likes_count ?? 0), 0),
    days: days.map(({ label, count }) => ({ label, count })),
    voices: [...byAuthor.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
  };
}

export function GroupAnalytics({ groupId }: { groupId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [groupRes, memberRes, contentRes] = await Promise.all([
          fetch(`/api/admin/groups/${encodeURIComponent(groupId)}`),
          fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/members`),
          fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/content`),
        ]);
        const groupPayload = await readApiJson<{ group?: AdminGroupListItem; error?: string }>(groupRes);
        const memberPayload = await readApiJson<{ members?: AdminGroupMember[]; error?: string }>(memberRes);
        const contentPayload = await readApiJson<{ items?: AdminGroupContentItem[]; error?: string }>(contentRes);
        if (!groupRes.ok || !groupPayload.group) throw new Error(groupPayload.error ?? "Failed to load group");
        if (!memberRes.ok) throw new Error(memberPayload.error ?? "Failed to load members");
        if (!contentRes.ok) throw new Error(contentPayload.error ?? "Failed to load content");
        if (!cancelled) {
          setSnapshot(buildSnapshot(groupPayload.group, memberPayload.members ?? [], contentPayload.items ?? []));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load analytics");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!snapshot) return <p className="text-sm text-zinc-500">Loading analytics…</p>;

  const peak = Math.max(1, ...snapshot.days.map((day) => day.count));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Members" value={snapshot.members} />
        <Stat label="Prop accounts" value={snapshot.propMembers} />
        <Stat label="Posts" value={snapshot.posts} />
        <Stat label="Replies" value={snapshot.replies} />
        <Stat label="Likes" value={snapshot.likes} />
      </div>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-50">Last 7 days</h2>
        <p className="mt-1 text-xs text-zinc-500">Posts and replies, America/New_York.</p>
        <div className="mt-4 flex h-36 items-end gap-2">
          {snapshot.days.map((day) => (
            <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-[11px] tabular-nums text-zinc-400">{day.count}</span>
              <div className="flex h-24 w-full items-end rounded-lg bg-zinc-950">
                <div className="w-full rounded-lg bg-emerald-400" style={{ height: `${Math.max(6, (day.count / peak) * 100)}%` }} />
              </div>
              <span className="text-[11px] text-zinc-500">{day.label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-50">Most active</h2>
        {snapshot.voices.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No posts yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {snapshot.voices.map((voice) => (
              <li key={voice.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-zinc-100">{voice.name}</span>
                <span className="tabular-nums text-zinc-400">{voice.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
    </div>
  );
}
