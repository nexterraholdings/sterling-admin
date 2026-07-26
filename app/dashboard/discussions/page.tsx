"use client";

import { useEffect, useState } from "react";
import { Tabs } from "@/components/dashboard/Tabs";
import { DiscussionsListView } from "./DiscussionsListView";

type PageView = "browse" | "flagged";

export default function DiscussionsPage() {
  const [pageView, setPageView] = useState<PageView>("browse");
  const [flaggedTotal, setFlaggedTotal] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/discussions?page=1&pageSize=1&minReports=1")
      .then(async (res) => {
        const body = await res.json();
        if (res.ok && typeof body.total === "number") setFlaggedTotal(body.total);
      })
      .catch(() => {});
  }, [pageView]);

  const flaggedLabel =
    flaggedTotal != null && flaggedTotal > 0 ? `Needs review (${flaggedTotal})` : "Needs review";

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Community</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-50 sm:text-3xl">Area hubs</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Location-pinned hubs from the mobile app. Use cards to scan quickly, then open a hub for
            stewardship timelines, hub moderation, and analytics.
          </p>
          <div className="mt-6 max-w-md">
            <Tabs
              tabs={[
                { id: "browse", label: "All hubs", color: "emerald" },
                { id: "flagged", label: flaggedLabel, color: "rose" },
              ]}
              defaultTab="browse"
              variant="segmented"
              onChange={(id) => setPageView(id as PageView)}
            />
          </div>
        </div>
      </div>

      <DiscussionsListView flaggedOnly={pageView === "flagged"} key={pageView} />
    </div>
  );
}
