"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchUserStreakSnapshot,
  searchUsers,
  simulateMissedStreakYesterday,
  type UserSearchResult,
  type UserStreakSnapshot,
} from "./actions";
import { addUtcDays, utcDayKey } from "@/lib/testing/streakSimulation";
import {
  buildStreakRestoreDevLink,
  STREAK_RESTORE_DEV_SCENARIOS,
} from "@/lib/testing/streakRestoreDevLink";

function userLabel(user: UserSearchResult | null): string {
  if (!user) return "No user selected";
  if (user.username) return `@${user.username}`;
  return user.full_name ?? user.email ?? user.id;
}

function StreakWeekPreview({ visitDates }: { visitDates: string[] }) {
  const today = utcDayKey();
  const visitSet = new Set(visitDates.map((d) => d.slice(0, 10)));
  const cells = Array.from({ length: 7 }, (_, index) => {
    const key = addUtcDays(today, index - 6);
    return { key, visited: visitSet.has(key), isToday: key === today, isYesterday: key === addUtcDays(today, -1) };
  });

  return (
    <div className="flex items-center gap-2">
      {cells.map((cell) => (
        <div key={cell.key} className="flex flex-col items-center gap-1">
          <div
            className={`h-3 w-3 rounded-full ${
              cell.visited
                ? "bg-orange-400"
                : cell.isYesterday
                  ? "bg-rose-500/80 ring-2 ring-rose-400/40"
                  : "bg-zinc-700"
            }`}
            title={`${cell.key}${cell.isYesterday ? " (yesterday — missed)" : ""}`}
          />
          <span className="text-[10px] text-zinc-500">{cell.key.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export function TestingView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserSearchResult | null>(null);
  const [priorStreakDays, setPriorStreakDays] = useState(7);
  const [snapshot, setSnapshot] = useState<UserStreakSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedScenarioId, setCopiedScenarioId] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      searchUsers(term)
        .then(setResults)
        .catch((err) => setError(err instanceof Error ? err.message : "Search failed"))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const loadSnapshot = useCallback(async (userId: string) => {
    setLoadingSnapshot(true);
    setError(null);
    try {
      const next = await fetchUserStreakSnapshot(userId);
      setSnapshot(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load streak");
      setSnapshot(null);
    } finally {
      setLoadingSnapshot(false);
    }
  }, []);

  useEffect(() => {
    if (selected) {
      void loadSnapshot(selected.id);
    } else {
      setSnapshot(null);
    }
  }, [selected, loadSnapshot]);

  async function handleSimulate() {
    if (!selected) return;
    setSimulating(true);
    setError(null);
    setMessage(null);
    try {
      const next = await simulateMissedStreakYesterday({
        targetUserId: selected.id,
        priorStreakDays,
      });
      setSnapshot(next);
      setMessage(
        `Ready for mobile QA. Sign in as ${userLabel(selected)}, open the Map tab, expand the location card, and tap yesterday’s empty streak dot (or pull to refresh if already open).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setSimulating(false);
    }
  }

  async function handleCopyDevLink(
    scenarioId: string,
    params: (typeof STREAK_RESTORE_DEV_SCENARIOS)[number]["params"],
  ) {
    const link = buildStreakRestoreDevLink(params, priorStreakDays);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedScenarioId(scenarioId);
      setMessage(
        `Copied dev link. On a __DEV__ SterlingMobile build, open Safari/Notes and tap: ${link}`,
      );
      setError(null);
      window.setTimeout(
        () => setCopiedScenarioId((current) => (current === scenarioId ? null : current)),
        2500,
      );
    } catch {
      setError(`Copy failed. Link: ${link}`);
    }
  }

  const today = utcDayKey();
  const yesterday = addUtcDays(today, -1);

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

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3">
          <span className="mt-0.5 shrink-0 text-sky-300">🧪</span>
          <p className="text-sm leading-6 text-sky-200">
            QA utilities against production Supabase. Streak simulation writes{" "}
            <code className="text-sky-100">user_app_streaks</code>,{" "}
            <code className="text-sky-100">user_app_visit_days</code>, and profile counters for the selected account.
          </p>
        </div>

        <h3 className="text-lg font-semibold text-zinc-50">Streak — missed yesterday</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Sets UTC state to: visited today, <strong className="text-zinc-200">skipped {yesterday}</strong>, and a{" "}
          {priorStreakDays}-day run ending the day before yesterday. Matches SterlingMobile restore eligibility
          (current streak = 1, broken streak = {priorStreakDays}).
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Find user</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, or username…"
              className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-800"
            />
            {searching ? <p className="mt-2 text-xs text-zinc-500">Searching…</p> : null}
            {results.length > 0 ? (
              <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-800">
                {results.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelected(user);
                      setQuery(user.username ? `@${user.username}` : user.full_name ?? user.email ?? user.id);
                      setResults([]);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-zinc-800 ${
                      selected?.id === user.id ? "bg-zinc-800/80" : ""
                    }`}
                  >
                    <span className="text-zinc-200">{user.full_name ?? user.email ?? user.id}</span>
                    <span className="text-zinc-500">{user.username ? `@${user.username}` : user.email}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {selected ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="text-sm font-semibold text-zinc-200">{userLabel(selected)}</p>
              <p className="mt-1 text-xs text-zinc-500">{selected.email}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Prior streak length
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={priorStreakDays}
                onChange={(e) => setPriorStreakDays(Math.max(1, Math.min(30, Number(e.target.value) || 7)))}
                className="mt-2 w-28 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"
              />
            </div>
            <button
              type="button"
              disabled={!selected || simulating}
              onClick={() => void handleSimulate()}
              className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {simulating ? "Applying…" : "Simulate missed yesterday"}
            </button>
            {selected ? (
              <button
                type="button"
                disabled={loadingSnapshot}
                onClick={() => void loadSnapshot(selected.id)}
                className="rounded-full border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
              >
                Refresh
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {message}
            </div>
          ) : null}

          {loadingSnapshot ? (
            <p className="text-sm text-zinc-500">Loading streak snapshot…</p>
          ) : snapshot ? (
            <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Current streak" value={String(snapshot.streakCurrent)} />
                <Metric label="Longest streak" value={String(snapshot.streakLongest)} />
                <Metric label="Last visit (UTC)" value={snapshot.lastVisitDate ?? "—"} />
                <Metric
                  label="Restore eligible"
                  value={snapshot.restoreEligible ? `Yes (${snapshot.brokenStreak} day run)` : "No"}
                  accent={snapshot.restoreEligible ? "emerald" : "zinc"}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Rolling week (UTC)</p>
                <StreakWeekPreview visitDates={snapshot.visitDates} />
              </div>
              <p className="text-xs text-zinc-500">
                Visit dates: {snapshot.visitDates.length ? snapshot.visitDates.join(", ") : "none"}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-violet-500/20 bg-violet-500/10 px-4 py-3">
          <span className="mt-0.5 shrink-0 text-violet-300">📱</span>
          <p className="text-sm leading-6 text-violet-200">
            UI preview uses a <code className="text-violet-100">shmobile://</code> dev deep link. It opens the
            restore sheet with mock data on <strong className="text-violet-100">__DEV__</strong> builds only — no Supabase
            writes, no streak RPCs.
          </p>
        </div>

        <h3 className="text-lg font-semibold text-zinc-50">Streak restore UI preview (no DB)</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Copy a link, send it to your test device (Slack, Notes, etc.), and tap it while SterlingMobile is running in
          a dev build. Uses the <strong className="text-zinc-200">prior streak length</strong> field above for the
          broken-streak copy ({priorStreakDays} days → {priorStreakDays + 1} after restore).
        </p>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {STREAK_RESTORE_DEV_SCENARIOS.map((scenario) => {
            const link = buildStreakRestoreDevLink(scenario.params, priorStreakDays);
            return (
              <div
                key={scenario.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{scenario.label}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{scenario.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyDevLink(scenario.id, scenario.params)}
                    className="shrink-0 rounded-full border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/25"
                  >
                    {copiedScenarioId === scenario.id ? "Copied" : "Copy link"}
                  </button>
                </div>
                <code className="mt-3 block overflow-x-auto rounded-xl bg-zinc-900 px-3 py-2 text-[11px] text-zinc-400">
                  {link}
                </code>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  accent = "zinc",
}: {
  label: string;
  value: string;
  accent?: "zinc" | "emerald";
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${accent === "emerald" ? "text-emerald-300" : "text-zinc-100"}`}>
        {value}
      </p>
    </div>
  );
}
