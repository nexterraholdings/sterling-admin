"use client";

import { useState } from "react";
import { GroupContentWorkspace } from "@/app/dashboard/users/seeding-content/GroupContentWorkspace";
import { MembersPanel, type GroupOpsSection } from "./MembersPanel";

const TABS: { id: GroupOpsSection | "posts"; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "props", label: "Prop accounts" },
  { id: "posts", label: "Posts" },
  { id: "organize", label: "Organize" },
];

export function GroupOpsTabs({ groupId }: { groupId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("members");

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

      {tab === "posts" ? (
        <GroupContentWorkspace groupId={groupId} />
      ) : (
        <MembersPanel groupId={groupId} section={tab} />
      )}
    </div>
  );
}
