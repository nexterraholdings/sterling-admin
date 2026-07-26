"use client";

import { useState } from "react";
import { Tabs } from "@/components/dashboard/Tabs";
import { UserManagementView } from "./UsersView";
import { CheatsView } from "./CheatsView";

type PageView = "users" | "cheats";

export default function UsersPage() {
  const [pageView, setPageView] = useState<PageView>("users");

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Operations</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-50">
          {pageView === "users" ? "User management" : "Engagement boosting"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          {pageView === "users"
            ? "Browse profiles and auth.users, spot orphans, and delete auth, profile, or both."
            : "Directly boost engagement metrics for testing or demo purposes."}
        </p>
        <div className="mt-5 border-t border-zinc-800 pt-5">
          <Tabs
            tabs={[
              { id: "users", label: "Users", color: "emerald" },
              { id: "cheats", label: "Cheats", color: "amber" },
            ]}
            defaultTab="users"
            variant="segmented"
            onChange={(id) => setPageView(id as PageView)}
          />
        </div>
      </div>

      {pageView === "users" && <UserManagementView />}
      {pageView === "cheats" && <CheatsView />}
    </div>
  );
}
