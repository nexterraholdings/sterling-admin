import { TestingView } from "./TestingView";

export default function TestingPage() {
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-400">Command</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-50 sm:text-3xl">Testing</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Internal QA helpers for SterlingMobile flows. Changes write to the live database — use test accounts only.
          </p>
        </div>
      </div>

      <TestingView />
    </div>
  );
}
