"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { SeededHubListItem } from "@/lib/seeded-hubs/types";
import { readApiJson, SeedingBreadcrumb } from "./shared";

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15";

export function HubsBrowser() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [hubs, setHubs] = useState<SeededHubListItem[]>([]);
  const [hubsLoading, setHubsLoading] = useState(true);
  const [hubSearch, setHubSearch] = useState("");
  const [hubSort, setHubSort] = useState<"popularity" | "name">("popularity");

  const loadHubs = useCallback(async (search: string) => {
    setHubsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/seeded-hubs?${params.toString()}`);
      const payload = await readApiJson<{ hubs?: SeededHubListItem[]; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load seeded hubs");
      setHubs(payload.hubs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load seeded hubs");
    } finally {
      setHubsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHubs("");
  }, [loadHubs]);

  const sortedHubs = useMemo(() => {
    const list = [...hubs];
    if (hubSort === "popularity") {
      list.sort((a, b) => b.group_count - a.group_count || a.title.localeCompare(b.title));
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [hubs, hubSort]);

  return (
    <>
      <SeedingBreadcrumb />

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <input
          value={hubSearch}
          onChange={(e) => setHubSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") loadHubs(hubSearch);
          }}
          placeholder="Search seeded hubs by name or location..."
          className={inputCls}
        />
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
          <span>Sort by</span>
          <button
            type="button"
            onClick={() => setHubSort("popularity")}
            className={`rounded-full border px-2.5 py-1 transition ${
              hubSort === "popularity"
                ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            Most groups
          </button>
          <button
            type="button"
            onClick={() => setHubSort("name")}
            className={`rounded-full border px-2.5 py-1 transition ${
              hubSort === "name"
                ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            Name (A–Z)
          </button>
        </div>
        {hubsLoading ? (
          <div className="p-6 text-center text-sm text-zinc-500">Loading hubs...</div>
        ) : hubs.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">No seeded hubs found.</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {sortedHubs.map((hub) => (
              <button
                key={hub.id}
                type="button"
                onClick={() => router.push(`/dashboard/users/seeding-content/${hub.id}`)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-blue-500/40 hover:bg-zinc-900/70"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-100">{hub.title}</div>
                  <div className="truncate text-xs text-zinc-500">{hub.location_hint ?? "No location"}</div>
                </div>
                <Badge variant="outline" className="shrink-0 border-zinc-700 text-zinc-300">
                  {hub.group_count} group{hub.group_count === 1 ? "" : "s"}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
