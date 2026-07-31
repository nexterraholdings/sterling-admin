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

  const today = utcDayKey();
  const yesterday = addUtcDays(today, -1);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3">
          <span className="mt-0.5 shrink-0 text-sky-300">🧪</span>
          <p className="text-sm leading-6 text-sky-200">
            QA utilities against production Supabase. Streak simulation writes real <code className="text-sky-100">user_visits</code> rows
            and profile counters for the selected account.
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
