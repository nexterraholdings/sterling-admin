import { Suspense } from "react";
import { LeadsInboxView } from "./LeadsInboxView";

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Commercial</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-50 sm:text-3xl">Leads</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Every buyer or renter who expressed interest across all brokerage listings, in one inbox. Move a lead
            through new → contacted → closed as your brokerages follow up.
          </p>
        </div>
      </div>

      <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-zinc-900" />}>
        <LeadsInboxView />
      </Suspense>
    </div>
  );
}
