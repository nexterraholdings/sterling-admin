"use client";

import Link from "next/link";
import { BarChart } from "@/components/ui/BarChart";
import { LocationGuardrailsToggle } from "@/components/dashboard/LocationGuardrailsToggle";
import type { OverviewSnapshot } from "@/app/dashboard/lib/overview";

const emptyOverviewSnapshot: OverviewSnapshot = {
  plantedHubs: 0,
  hubsOnStore: 0,
  hubsHidden: 0,
  busiestHubs: [],
  groupCount: 0,
  recentGroups: [],
  users: 0,
  newUsersThisWeek: 0,
  posts: 0,
  postsThisWeek: [],
};

function Stat({ label, value, hint, href }: { label: string; value: string; hint: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 transition hover:border-zinc-700 hover:bg-zinc-900/80"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </Link>
  );
}

function formatWhen(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DashboardOverviewClient({
  snapshot,
  canToggleGuardrails,
}: {
  snapshot: OverviewSnapshot;
  canToggleGuardrails: boolean;
}) {
  const data: OverviewSnapshot = {
    ...emptyOverviewSnapshot,
    ...(snapshot ?? {}),
    busiestHubs: snapshot?.busiestHubs ?? [],
    recentGroups: snapshot?.recentGroups ?? [],
    postsThisWeek: snapshot?.postsThisWeek ?? [],
  };
  const postsThisWeek = data.postsThisWeek.reduce((sum, point) => sum + point.value, 0);

  return (
    <div className="space-y-6">
      {canToggleGuardrails ? <LocationGuardrailsToggle /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Planted hubs"
          value={data.plantedHubs.toLocaleString()}
          hint={`${data.hubsOnStore.toLocaleString()} on store · ${data.hubsHidden.toLocaleString()} hidden`}
          href="/dashboard/discussions"
        />
        <Stat
          label="Groups"
          value={data.groupCount.toLocaleString()}
          hint="Open groups across hubs"
          href="/dashboard/groups"
        />
        <Stat
          label="People"
          value={data.users.toLocaleString()}
          hint={`+${data.newUsersThisWeek.toLocaleString()} this week`}
          href="/dashboard/analytics"
        />
        <Stat
          label="Posts"
          value={data.posts.toLocaleString()}
          hint={`${postsThisWeek.toLocaleString()} in the last 7 days`}
          href="/dashboard/analytics"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-50">Busiest hubs</h2>
            <Link href="/dashboard/discussions" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
              Hubs
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-zinc-800">
            {data.busiestHubs.length === 0 ? (
              <li className="py-8 text-center text-sm text-zinc-500">No planted hubs yet.</li>
            ) : (
              data.busiestHubs.map((hub) => (
                <li key={hub.id}>
                  <Link href={`/dashboard/discussions/${hub.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-emerald-100">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-100">{hub.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-zinc-500">
                        {hub.place || "No place"} · {hub.groups} group{hub.groups === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm tabular-nums text-zinc-200">{hub.comments.toLocaleString()}</span>
                      <span className={`text-[10px] font-semibold ${hub.onStore ? "text-sky-300" : "text-zinc-500"}`}>
                        {hub.onStore ? "On store" : "Hidden"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-50">Newest groups</h2>
            <Link href="/dashboard/groups" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
              Groups
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-zinc-800">
            {data.recentGroups.length === 0 ? (
              <li className="py-8 text-center text-sm text-zinc-500">No groups yet.</li>
            ) : (
              data.recentGroups.map((group) => (
                <li key={group.id}>
                  <Link href={`/dashboard/groups/${group.id}`} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-100">{group.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-zinc-500">{group.hubTitle || "No hub"}</span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">{formatWhen(group.createdAt)}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-50">Posts this week</h2>
            <p className="mt-1 text-xs text-zinc-500">{postsThisWeek.toLocaleString()} top-level posts over the last 7 days</p>
          </div>
          <Link href="/dashboard/analytics" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            Analytics
          </Link>
        </div>
        <div className="mt-5">
          <BarChart data={data.postsThisWeek} height={140} color="rgb(16 185 129 / 0.85)" />
        </div>
      </section>
    </div>
  );
}
