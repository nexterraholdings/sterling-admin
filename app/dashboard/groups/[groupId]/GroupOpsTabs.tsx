"use client";

import { useState } from "react";
import { GroupContentWorkspace } from "@/app/dashboard/users/seeding-content/GroupContentWorkspace";
import { GroupAnalytics } from "./GroupAnalytics";
import { GroupSettings } from "./GroupSettings";
import { MembersPanel, type GroupOpsSection } from "./MembersPanel";

const TABS = [
  { id: "content", label: "Content" },
  { id: "members", label: "Members" },
  { id: "settings", label: "Settings" },
  { id: "analytics", label: "Analytics" },
] as const;

const MEMBER_VIEWS: { id: GroupOpsSection; label: string }[] = [
  { id: "members", label: "Roster" },
  { id: "props", label: "Prop accounts" },
  { id: "organize", label: "Organize" },
];

type TabId = (typeof TABS)[number]["id"];

export function GroupOpsTabs({ groupId }: { groupId: string }) {
  const [tab, setTab] = useState<TabId>("content");
  const [memberView, setMemberView] = useState<GroupOpsSection>("members");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-2xl border border-zinc-800 bg-zinc-900 p-1" role="tablist">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold transition sm:flex-none ${
                active ? "bg-zinc-950 text-zinc-50 shadow-sm" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "content" ? <GroupContentWorkspace groupId={groupId} /> : null}
      {tab === "members" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {MEMBER_VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMemberView(item.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  memberView === item.id ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30" : "text-zinc-400 ring-1 ring-zinc-800"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <MembersPanel groupId={groupId} section={memberView} />
        </div>
      ) : null}
      {tab === "settings" ? <GroupSettings groupId={groupId} /> : null}
      {tab === "analytics" ? <GroupAnalytics groupId={groupId} /> : null}
    </div>
  );
}
