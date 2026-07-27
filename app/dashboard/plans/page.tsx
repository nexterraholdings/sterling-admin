import { PlansView } from "./PlansView";

export default function PlansPage() {
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Command</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-50 sm:text-3xl">Plans</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            RevenueCat subscriptions sync into Supabase for quotas and admin reporting. Manual Plus grants
            below remain for out-of-band brokerages until Premium billing ties to communities automatically.
          </p>
        </div>
      </div>

      <PlansView />
    </div>
  );
}
