"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, RefreshCw } from "lucide-react";
import { EmptyState, FilterChip, formatRelativeTime, MetricPill } from "@/components/admin/ui";
import { decideItemAction, deleteWatchAction, pullNowAction, refreshKnowledge, saveWatchAction } from "./actions";
import { DEFAULT_FEEDS, KNOWLEDGE_FEEDS } from "@/lib/knowledge/types";
import type {
  KnowledgeApproval,
  KnowledgeDashboard,
  KnowledgeFeed,
  KnowledgeHubOption,
  KnowledgeItem,
  KnowledgeSource,
  KnowledgeStatus,
  KnowledgeWatch,
  KnowledgeWatchInput,
} from "@/lib/knowledge/types";

const FEED_INFO: Record<KnowledgeFeed, { label: string; hint: string }> = {
  news: { label: "News", hint: "Local headlines from Google News, or GDELT when Google has nothing. Free." },
  weather: { label: "Weather", hint: "Tomorrow's forecast from Open-Meteo, plus US weather alerts. Free." },
  sports: { label: "Sports", hint: "Upcoming games and final scores for the teams you list, from TheSportsDB. Free." },
  events: { label: "Events", hint: "Concerts, games, and shows within 20 miles from Ticketmaster. Free key." },
  x: { label: "X", hint: "Recent X posts through xAI. Paid, and only runs once XAI_API_KEY has credits." },
};

const SOURCE_LABELS: Record<KnowledgeSource, string> = {
  x: "X post",
  web: "Article",
  news: "News",
  weather: "Forecast",
  sports: "Sports",
  events: "Event",
};

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 disabled:opacity-50";

const EVERY_OPTIONS = [
  { minutes: 60, label: "Every hour" },
  { minutes: 180, label: "Every 3 hours" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 720, label: "Twice a day" },
  { minutes: 1440, label: "Once a day" },
];

type InboxFilter = "new" | "approved" | "rejected" | "all";

const INBOX_FILTERS: Array<{ id: InboxFilter; label: string }> = [
  { id: "new", label: "Waiting" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function everyLabel(minutes: number): string {
  return EVERY_OPTIONS.find((option) => option.minutes === minutes)?.label ?? `Every ${Math.round(minutes / 60)} hours`;
}

function isFresh(item: KnowledgeItem, now: number): boolean {
  return new Date(item.expiresAt).getTime() > now;
}

function emptyWatch(hubs: KnowledgeHubOption[]): KnowledgeWatchInput {
  return {
    hubId: hubs[0]?.id ?? "",
    label: "",
    feeds: [...DEFAULT_FEEDS],
    searchTerms: "",
    xHandles: [],
    teams: [],
    everyMinutes: 180,
    approval: "review",
    enabled: true,
  };
}

function inputOf(watch: KnowledgeWatch): KnowledgeWatchInput {
  return {
    hubId: watch.hubId,
    label: watch.label,
    feeds: watch.feeds,
    searchTerms: watch.searchTerms,
    xHandles: watch.xHandles,
    teams: watch.teams,
    everyMinutes: watch.everyMinutes,
    approval: watch.approval,
    enabled: watch.enabled,
  };
}

export function KnowledgeClient({ initial }: { initial: KnowledgeDashboard }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; input: KnowledgeWatchInput } | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("new");
  const [hubFilter, setHubFilter] = useState("");

  async function run(key: string, work: () => Promise<KnowledgeDashboard>, success?: string) {
    setBusy(key);
    try {
      setData(await work());
      if (success) toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function pullNow(watch: KnowledgeWatch) {
    setBusy(`pull:${watch.id}`);
    try {
      const { dashboard, outcome } = await pullNowAction(watch.id);
      setData(dashboard);
      if (!outcome.ok) toast.error(outcome.error ?? "Pull failed");
      else if (outcome.kept === 0) toast.success(`Nothing new for ${outcome.hubTitle}. ${outcome.found} found, all too old or already in.`);
      else toast.success(`Added ${outcome.kept} ${outcome.kept === 1 ? "item" : "items"} for ${outcome.hubTitle}.`);
      if (outcome.ok && outcome.error) toast.warning(outcome.error);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pull failed");
    } finally {
      setBusy(null);
    }
  }

  const stats = useMemo(() => {
    const since = data.loadedAt - DAY_MS;
    const waiting = data.items.filter((item) => item.status === "new").length;
    const ready = data.items.filter((item) => item.status === "approved" && isFresh(item, data.loadedAt)).length;
    const pulls = data.pulls.filter((pull) => new Date(pull.createdAt).getTime() >= since);
    const judged = data.items.filter((item) => item.verdict && item.status !== "new" && item.decidedBy && item.decidedBy !== "auto");
    const agreed = judged.filter((item) => (item.verdict === "approve") === (item.status === "approved")).length;
    return {
      waiting,
      ready,
      pulls: pulls.length,
      failed: pulls.filter((pull) => !pull.ok).length,
      xPosts: pulls.reduce((sum, pull) => sum + pull.xPostsFetched, 0),
      judged: judged.length,
      agreed,
    };
  }, [data]);

  const visibleItems = useMemo(
    () =>
      data.items.filter(
        (item) => (filter === "all" || item.status === filter) && (!hubFilter || item.hubId === hubFilter),
      ),
    [data.items, filter, hubFilter],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Knowledge hub</p>
            <h1 className="mt-2 text-lg font-semibold text-zinc-50">What the props can talk about</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Watches pull local news, weather, games, and events for a hub, each with a link to where it came from. News and events go
              through the checks; forecasts and schedules are built straight from the data. Once a hub has a watch, its opening posts are
              written from one approved item. With nothing approved, that hub stays quiet.
            </p>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("refresh", refreshKnowledge)}
            aria-label="Refresh"
            className="rounded-xl border border-zinc-700 p-2 text-zinc-300 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} aria-hidden />
          </button>
        </div>

        {!data.schemaReady ? (
          <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            The knowledge tables are not set up yet. Run supabase/sql/knowledge_hub.sql and supabase/sql/prop_region_runs.sql in the Supabase SQL editor.
          </p>
        ) : null}
        {!data.xaiConfigured && data.watches.some((watch) => watch.feeds.includes("x")) ? (
          <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            XAI_API_KEY is not set on this deployment, so the X source is skipped. The other sources still run.
          </p>
        ) : null}
        {!data.ticketmasterConfigured && data.watches.some((watch) => watch.feeds.includes("events")) ? (
          <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            TICKETMASTER_API_KEY is not set on this deployment, so events cannot be pulled yet. Get a free key at developer.ticketmaster.com.
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <MetricPill label="Waiting for review" value={String(stats.waiting)} />
          <MetricPill label="Approved and fresh" value={String(stats.ready)} />
          <MetricPill label="Pulls, last 24h" value={stats.failed ? `${stats.pulls} (${stats.failed} failed)` : String(stats.pulls)} />
          <MetricPill label="X posts read, 24h" value={String(stats.xPosts)} />
          <MetricPill
            label="Checks agreed with you"
            value={stats.judged ? `${stats.agreed} of ${stats.judged}` : "No decisions yet"}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-50">Watches</h2>
            <p className="mt-1 text-xs text-zinc-500">
              New watches start in review: the checks suggest, you decide. Switch a watch to automatic once the checks agree with you.
            </p>
          </div>
          {editing?.id === null ? null : (
            <button
              type="button"
              disabled={busy !== null || !data.schemaReady || data.hubs.length === 0}
              onClick={() => setEditing({ id: null, input: emptyWatch(data.hubs) })}
              className="shrink-0 rounded-xl border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50"
            >
              New watch
            </button>
          )}
        </div>

        {editing?.id === null ? (
          <WatchForm
            hubs={data.hubs}
            initial={editing.input}
            busy={busy !== null}
            onCancel={() => setEditing(null)}
            onSave={(input) =>
              void run("watch:new", () => saveWatchAction(null, input), "Watch added.").then((ok) => ok && setEditing(null))
            }
          />
        ) : null}

        {data.watches.length === 0 && editing?.id !== null ? (
          <div className="mt-4">
            <EmptyState
              title="No watches yet"
              hint={data.hubs.length === 0 ? "Start a conversation run in a hub first. Hubs with prop groups show up here." : "Add a watch to start pulling for a hub."}
            />
          </div>
        ) : null}

        <ul className="mt-4 flex flex-col gap-3">
          {data.watches.map((watch) =>
            editing?.id === watch.id ? (
              <li key={watch.id}>
                <WatchForm
                  hubs={data.hubs}
                  initial={editing.input}
                  busy={busy !== null}
                  onCancel={() => setEditing(null)}
                  onSave={(input) =>
                    void run(`watch:${watch.id}`, () => saveWatchAction(watch.id, input), "Watch saved.").then((ok) => ok && setEditing(null))
                  }
                />
              </li>
            ) : (
              <WatchRow
                key={watch.id}
                watch={watch}
                busy={busy}
                onEdit={() => setEditing({ id: watch.id, input: inputOf(watch) })}
                onPull={() => void pullNow(watch)}
                onToggle={(patch) => void run(`watch:${watch.id}`, () => saveWatchAction(watch.id, { ...inputOf(watch), ...patch }))}
                onDelete={() => void run(`watch:${watch.id}`, () => deleteWatchAction(watch.id), "Watch deleted.")}
              />
            ),
          )}
        </ul>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-50">Inbox</h2>
            <p className="mt-1 text-xs text-zinc-500">Approved items stay usable for about a day after they were posted.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {INBOX_FILTERS.map((item) => (
              <FilterChip key={item.id} active={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label}
              </FilterChip>
            ))}
            <select value={hubFilter} onChange={(event) => setHubFilter(event.target.value)} className={`${inputCls} w-44`}>
              <option value="">All hubs</option>
              {data.hubs.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hub.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={filter === "new" ? "Nothing waiting" : "No items here"} />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {visibleItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                now={data.loadedAt}
                busy={busy === `item:${item.id}`}
                disabled={busy !== null}
                onDecide={(status) => void run(`item:${item.id}`, () => decideItemAction(item.id, status))}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-50">Recent pulls</h2>
        {data.pulls.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No pulls yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800 text-sm">
            {data.pulls.map((pull) => (
              <li key={pull.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-zinc-200">
                  {pull.hubTitle}
                  <span className="ml-2 text-zinc-500">{formatRelativeTime(pull.createdAt)}</span>
                </span>
                <span className={pull.ok ? "text-zinc-400" : "text-rose-300"}>
                  {pull.ok
                    ? `${pull.itemsFound} found · ${pull.itemsKept} kept · ${pull.xPostsFetched} X posts read`
                    : pull.error ?? "Failed"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WatchRow({
  watch,
  busy,
  onEdit,
  onPull,
  onToggle,
  onDelete,
}: {
  watch: KnowledgeWatch;
  busy: string | null;
  onEdit: () => void;
  onPull: () => void;
  onToggle: (patch: Partial<KnowledgeWatchInput>) => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pulling = busy === `pull:${watch.id}`;
  const disabled = busy !== null;
  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-50">
            {watch.label || watch.hubTitle}
            {watch.label ? <span className="ml-2 font-normal text-zinc-500">{watch.hubTitle}</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {watch.place || "No place name"} · {everyLabel(watch.everyMinutes)} ·{" "}
            {watch.lastPulledAt ? `pulled ${formatRelativeTime(watch.lastPulledAt)}` : "not pulled yet"}
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {watch.feeds.map((feed) => (
              <span key={feed} className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                {FEED_INFO[feed].label}
              </span>
            ))}
          </p>
          {watch.searchTerms ? <p className="mt-2 text-sm text-zinc-300">{watch.searchTerms}</p> : null}
          {watch.feeds.includes("sports") && watch.teams.length > 0 ? (
            <p className="mt-1 text-xs text-zinc-400">{watch.teams.join(" · ")}</p>
          ) : null}
          {watch.feeds.includes("x") && watch.xHandles.length > 0 ? (
            <p className="mt-1 text-xs text-cyan-200/80">{watch.xHandles.map((handle) => `@${handle}`).join("  ")}</p>
          ) : null}
          {watch.lastError ? <p className="mt-2 text-xs text-rose-300">{watch.lastError}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-zinc-700 p-0.5 text-xs">
            {(["review", "auto"] as KnowledgeApproval[]).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={disabled || watch.approval === mode}
                onClick={() => onToggle({ approval: mode })}
                className={`rounded-lg px-2.5 py-1 ${watch.approval === mode ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-400"} disabled:cursor-default`}
              >
                {mode === "review" ? "Review" : "Automatic"}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={watch.enabled}
            aria-label="Watch on"
            disabled={disabled}
            onClick={() => onToggle({ enabled: !watch.enabled })}
            className={`relative h-7 w-12 shrink-0 rounded-full disabled:opacity-50 ${watch.enabled ? "bg-cyan-400" : "bg-zinc-700"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-zinc-950 ${watch.enabled ? "left-6" : "left-1"}`} />
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onPull}
          className="rounded-xl border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50"
        >
          {pulling ? "Pulling… this can take a minute" : "Pull now"}
        </button>
        <button type="button" disabled={disabled} onClick={onEdit} className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-50">
          Edit
        </button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={onDelete}
              className="rounded-xl border border-rose-400/40 px-3 py-1.5 text-sm text-rose-200 disabled:opacity-50"
            >
              Delete watch
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-xl px-3 py-1.5 text-sm text-zinc-400">
              Keep
            </button>
          </>
        ) : (
          <button type="button" disabled={disabled} onClick={() => setConfirmDelete(true)} className="rounded-xl px-3 py-1.5 text-sm text-zinc-500 disabled:opacity-50">
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

function WatchForm({
  hubs,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  hubs: KnowledgeHubOption[];
  initial: KnowledgeWatchInput;
  busy: boolean;
  onSave: (input: KnowledgeWatchInput) => void;
  onCancel: () => void;
}) {
  const [hubId, setHubId] = useState(initial.hubId);
  const [label, setLabel] = useState(initial.label);
  const [feeds, setFeeds] = useState<KnowledgeFeed[]>(initial.feeds);
  const [searchTerms, setSearchTerms] = useState(initial.searchTerms);
  const [handles, setHandles] = useState(initial.xHandles.map((handle) => `@${handle}`).join(" "));
  const [teams, setTeams] = useState(initial.teams.join(", "));
  const [everyMinutes, setEveryMinutes] = useState(initial.everyMinutes);
  const [approval, setApproval] = useState<KnowledgeApproval>(initial.approval);
  const place = hubs.find((hub) => hub.id === hubId)?.place;
  const toggleFeed = (feed: KnowledgeFeed) =>
    setFeeds((current) => (current.includes(feed) ? current.filter((entry) => entry !== feed) : KNOWLEDGE_FEEDS.filter((entry) => entry === feed || current.includes(entry))));

  return (
    <form
      className="mt-4 grid gap-3 rounded-2xl border border-cyan-400/20 bg-zinc-950/60 p-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          hubId,
          label,
          feeds,
          searchTerms,
          xHandles: handles.split(/[\s,]+/).filter(Boolean),
          teams: teams.split(/[,\n]+/).map((team) => team.trim()).filter(Boolean),
          everyMinutes,
          approval,
          enabled: initial.enabled,
        });
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-400">Hub</span>
        <select value={hubId} disabled={busy} onChange={(event) => setHubId(event.target.value)} className={inputCls}>
          {hubs.map((hub) => (
            <option key={hub.id} value={hub.id}>
              {hub.title}
              {hub.place ? ` · ${hub.place}` : ""}
            </option>
          ))}
        </select>
        {place ? <span className="mt-1 block text-xs text-zinc-500">Searches for things in {place}.</span> : null}
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-400">Name (optional)</span>
        <input value={label} disabled={busy} onChange={(event) => setLabel(event.target.value)} placeholder="Food and openings" className={inputCls} />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 block text-xs text-zinc-400">Sources</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KNOWLEDGE_FEEDS.map((feed) => (
            <label
              key={feed}
              className={`flex cursor-pointer gap-2 rounded-xl border px-3 py-2 ${feeds.includes(feed) ? "border-cyan-400/40 bg-cyan-400/5" : "border-zinc-800"}`}
            >
              <input type="checkbox" checked={feeds.includes(feed)} disabled={busy} onChange={() => toggleFeed(feed)} className="mt-0.5 accent-cyan-400" />
              <span>
                <span className="block text-sm text-zinc-100">{FEED_INFO[feed].label}</span>
                <span className="block text-xs text-zinc-500">{FEED_INFO[feed].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {feeds.includes("news") || feeds.includes("x") ? (
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-zinc-400">Search words (optional)</span>
          <textarea
            value={searchTerms}
            disabled={busy}
            onChange={(event) => setSearchTerms(event.target.value)}
            rows={2}
            placeholder={`Leave blank to search for "${place?.split(",")[0] || "the city name"}". Example: Williamsburg OR Greenpoint`}
            className={`${inputCls} resize-y`}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            News searches these words instead of the city name. For cities outside the US, words in the local language work best.
          </span>
        </label>
      ) : null}
      {feeds.includes("sports") ? (
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-zinc-400">Teams (up to 4, comma separated)</span>
          <input
            value={teams}
            disabled={busy}
            onChange={(event) => setTeams(event.target.value)}
            placeholder="New York Knicks, Brooklyn Nets, New York Yankees"
            className={inputCls}
          />
        </label>
      ) : null}
      {feeds.includes("x") ? (
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-zinc-400">X accounts to read first (up to 20)</span>
          <input
            value={handles}
            disabled={busy}
            onChange={(event) => setHandles(event.target.value)}
            placeholder="@nycgov @NYCTSubway @eater_ny"
            className={inputCls}
          />
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-400">How often</span>
        <select value={everyMinutes} disabled={busy} onChange={(event) => setEveryMinutes(Number(event.target.value))} className={inputCls}>
          {EVERY_OPTIONS.map((option) => (
            <option key={option.minutes} value={option.minutes}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span className="mb-1 block text-xs text-zinc-400">Approval</span>
        <div className="flex rounded-xl border border-zinc-800 p-0.5 text-sm">
          {(["review", "auto"] as KnowledgeApproval[]).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={busy}
              onClick={() => setApproval(mode)}
              className={`flex-1 rounded-lg px-3 py-1.5 ${approval === mode ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-400"}`}
            >
              {mode === "review" ? "Review" : "Automatic"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={busy || !hubId || feeds.length === 0} className="rounded-xl border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50">
          Save watch
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl px-3 py-1.5 text-sm text-zinc-400">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ItemRow({
  item,
  now,
  busy,
  disabled,
  onDecide,
}: {
  item: KnowledgeItem;
  now: number;
  busy: boolean;
  disabled: boolean;
  onDecide: (status: KnowledgeStatus) => void;
}) {
  const fresh = isFresh(item, now);
  const statusTone =
    item.status === "approved" ? "text-emerald-300" : item.status === "rejected" ? "text-rose-300" : "text-amber-200";
  return (
    <li className={`flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 ${busy ? "opacity-60" : ""}`}>
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="hidden h-20 w-20 shrink-0 rounded-xl object-cover sm:block"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-50">{item.claim}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-200/80 hover:text-cyan-100">
            {item.author && item.source !== "weather" ? item.author : SOURCE_LABELS[item.source]}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          <span>{item.hubTitle}</span>
          <span>{item.postedAt ? `posted ${formatRelativeTime(item.postedAt)}` : `found ${formatRelativeTime(item.fetchedAt)}`}</span>
          {!fresh ? <span className="text-zinc-600">expired</span> : null}
          {item.usedCount > 0 ? <span>used in {item.usedCount} {item.usedCount === 1 ? "post" : "posts"}</span> : null}
        </p>
        <p className="mt-2 text-xs">
          <span className={statusTone}>
            {item.status === "new" ? "Waiting" : item.status === "approved" ? "Approved" : "Rejected"}
            {item.decidedBy ? ` by ${item.decidedBy === "auto" ? "the checks" : item.decidedBy}` : ""}
          </span>
          {item.verdict ? (
            <span className="ml-2 text-zinc-500">
              Checks suggest {item.verdict === "approve" ? "approve" : "reject"}
              {item.reason ? `: ${item.reason}` : ""}
            </span>
          ) : item.reason ? (
            <span className="ml-2 text-zinc-500">{item.reason}</span>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        {item.status !== "approved" ? (
          <button
            type="button"
            disabled={disabled || !fresh}
            onClick={() => onDecide("approved")}
            className="rounded-xl border border-emerald-400/30 px-3 py-1.5 text-sm text-emerald-200 disabled:opacity-40"
          >
            Approve
          </button>
        ) : null}
        {item.status !== "rejected" ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDecide("rejected")}
            className="rounded-xl border border-rose-400/30 px-3 py-1.5 text-sm text-rose-200 disabled:opacity-40"
          >
            Reject
          </button>
        ) : null}
      </div>
    </li>
  );
}
