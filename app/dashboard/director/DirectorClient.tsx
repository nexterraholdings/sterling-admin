"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { EmptyState, FilterChip, formatRelativeTime, MetricPill } from "@/components/admin/ui";
import type { DirectorDashboard, DirectorMode, DirectorPlan } from "@/lib/conversations/director";
import {
  cancelJoinAction,
  decidePlanAction,
  planGroupNowAction,
  refreshDirector,
  saveCastingSettingsAction,
  saveDirectorSettingsAction,
  setGroupPlannerAction,
} from "./actions";

const MODES: Array<{ id: DirectorMode; label: string; hint: string }> = [
  { id: "off", label: "Off", hint: "No plans. Director groups stay quiet except replies to their own posts." },
  { id: "review", label: "Review", hint: "The director proposes, you approve each plan before anything is queued." },
  { id: "auto", label: "Automatic", hint: "Plans are queued as soon as they pass the checks. You can still read every plan here." },
];

const EVERY_OPTIONS = [2, 3, 4, 6, 8, 12, 24];

type PlanFilter = "proposed" | "applied" | "all";

const STATUS_STYLE: Record<DirectorPlan["status"], string> = {
  proposed: "border-amber-400/30 text-amber-100",
  approved: "border-cyan-400/30 text-cyan-100",
  applied: "border-emerald-400/30 text-emerald-100",
  rejected: "border-zinc-700 text-zinc-400",
  failed: "border-rose-400/30 text-rose-100",
};

function timeOf(iso: unknown): string {
  const value = typeof iso === "string" ? new Date(iso) : null;
  if (!value || Number.isNaN(value.getTime())) return "";
  return value.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function describe(action: Record<string, unknown>): { label: string; detail: string; when: string } {
  const who = String(action.propName ?? "");
  switch (action.type) {
    case "start_post":
      return {
        label: `${who} posts`,
        detail: [action.brief ? String(action.brief) : "", action.fact ? `From: ${String(action.fact)}` : "No fact"].filter(Boolean).join(" · "),
        when: timeOf(action.at),
      };
    case "reply":
      return { label: `${who} replies`, detail: `${String(action.brief ?? "")} · To: "${String(action.comment ?? "")}"`, when: timeOf(action.at) };
    case "like":
      return { label: `${who} likes`, detail: `"${String(action.comment ?? "")}"`, when: timeOf(action.at) };
    case "note":
      return { label: "Note", detail: String(action.text ?? ""), when: "" };
    case "create_group":
      return {
        label: `New group: ${String(action.title ?? "")}`,
        detail: [String(action.description ?? ""), action.ownerName ? `Owner ${String(action.ownerName)}` : "", Array.isArray(action.memberNames) ? `Members ${action.memberNames.join(", ")}` : ""]
          .filter(Boolean)
          .join(" · "),
        when: "",
      };
    default:
      return { label: String(action.type ?? "Action"), detail: JSON.stringify(action).slice(0, 200), when: "" };
  }
}

export function DirectorClient({ initial }: { initial: DirectorDashboard }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<PlanFilter>("proposed");
  const [journalGroup, setJournalGroup] = useState("");

  async function run(key: string, work: () => Promise<DirectorDashboard>, success?: string) {
    setBusy(key);
    try {
      setData(await work());
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  const groupTitle = useMemo(() => new Map(data.groups.map((group) => [group.groupId, group.title])), [data.groups]);
  const directed = data.groups.filter((group) => group.planner === "director");
  const waiting = data.plans.filter((plan) => plan.status === "proposed").length;
  const visiblePlans = data.plans.filter((plan) => filter === "all" || plan.status === filter);
  const visibleJournal = data.journal.filter((entry) => !journalGroup || entry.groupId === journalGroup);
  const ready = data.settings.ready;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Director</p>
            <h1 className="mt-2 text-lg font-semibold text-zinc-50">One brain planning the props</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              For groups you hand over, the director reads the recent chat, each prop&apos;s persona and memories, and the approved facts,
              then decides who posts, replies, or likes over the next few hours. Code checks every action against the caps, active hours,
              and membership before anything is queued. Props only reply to and like other props until the AI badge ships.
            </p>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("refresh", refreshDirector)}
            aria-label="Refresh"
            className="rounded-xl border border-zinc-700 p-2 text-zinc-300 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} aria-hidden />
          </button>
        </div>

        {!ready ? (
          <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            The director tables are not set up yet. Run supabase/sql/prop_director.sql in the Supabase SQL editor.
          </p>
        ) : null}
        {!data.geminiReady ? (
          <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            GEMINI_API_KEY is not set on this deployment, so the director falls back to Groq.
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricPill label="Mode" value={MODES.find((mode) => mode.id === data.settings.mode)?.label ?? data.settings.mode} />
          <MetricPill label="Plans every" value={`${data.settings.everyHours} hours`} />
          <MetricPill label="Groups directed" value={`${directed.length} of ${data.groups.length}`} />
          <MetricPill label="Waiting for review" value={String(waiting)} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {MODES.map((mode) => (
            <FilterChip
              key={mode.id}
              active={data.settings.mode === mode.id}
              onClick={() => void run(`mode:${mode.id}`, () => saveDirectorSettingsAction({ mode: mode.id }), `Director ${mode.label.toLowerCase()}.`)}
            >
              {mode.label}
            </FilterChip>
          ))}
          <select
            value={data.settings.everyHours}
            disabled={busy !== null || !ready}
            onChange={(event) => void run("every", () => saveDirectorSettingsAction({ everyHours: Number(event.target.value) }))}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
          >
            {EVERY_OPTIONS.map((hours) => (
              <option key={hours} value={hours}>
                Plan every {hours} hours
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-zinc-500">{MODES.find((mode) => mode.id === data.settings.mode)?.hint}</p>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-50">Groups</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Directed groups stop getting random start posts and thread joins. Replies to their own posts still get scheduled as before.
        </p>
        {data.groups.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No conversation groups yet" hint="Start a conversation run first, then hand the group to the director here." />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-zinc-800">
            {data.groups.map((group) => (
              <li key={group.groupId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-100">{group.title}</p>
                  <p className="text-xs text-zinc-500">
                    {[group.hubTitle, `${group.props} props`, group.enabled ? "running" : "off"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {group.planner === "director" ? (
                    <button
                      type="button"
                      disabled={busy !== null || !ready || !group.enabled}
                      onClick={() => void run(`plan:${group.groupId}`, () => planGroupNowAction(group.groupId), "Plan ready.")}
                      className="rounded-xl border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50"
                    >
                      {busy === `plan:${group.groupId}` ? "Planning…" : "Plan now"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy !== null || !ready}
                    onClick={() =>
                      void run(
                        `planner:${group.groupId}`,
                        () => setGroupPlannerAction(group.groupId, group.planner === "director" ? "random" : "director"),
                      )
                    }
                    className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-50"
                  >
                    {group.planner === "director" ? "Back to random" : "Hand to director"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CastingSection data={data} busy={busy} run={run} />

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-50">Plans</h2>
          <div className="flex gap-2">
            {(["proposed", "applied", "all"] as PlanFilter[]).map((id) => (
              <FilterChip key={id} active={filter === id} onClick={() => setFilter(id)}>
                {id === "proposed" ? "Waiting" : id === "applied" ? "Queued" : "All"}
              </FilterChip>
            ))}
          </div>
        </div>
        {visiblePlans.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No plans here" hint="The director runs every 30 minutes and plans each directed group when it is due." />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {visiblePlans.map((plan) => (
              <li key={plan.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100">
                      {plan.kind === "new_group" ? "New group proposal" : plan.groupTitle}
                      <span className={`ml-2 rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[plan.status]}`}>{plan.status}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatRelativeTime(plan.createdAt)}
                      {plan.model ? ` · ${plan.model}` : ""}
                    </p>
                  </div>
                  {plan.status === "proposed" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void run(`decide:${plan.id}`, () => decidePlanAction(plan.id, true), "Plan queued.")}
                        className="rounded-xl border border-emerald-400/30 px-3 py-1.5 text-sm text-emerald-100 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void run(`decide:${plan.id}`, () => decidePlanAction(plan.id, false))}
                        className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
                {plan.reasoning ? <p className="mt-2 text-sm text-zinc-300">{plan.reasoning}</p> : null}
                {plan.error ? <p className="mt-2 text-sm text-rose-200">{plan.error}</p> : null}
                {plan.actions.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {plan.actions.map((action, index) => {
                      const item = describe(action as Record<string, unknown>);
                      return (
                        <li key={index} className="text-sm">
                          <span className="text-zinc-100">{item.label}</span>
                          {item.when ? <span className="ml-2 font-mono text-xs text-zinc-500">{item.when}</span> : null}
                          {item.detail ? <p className="text-xs text-zinc-400">{item.detail}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : !plan.error ? (
                  <p className="mt-2 text-xs text-zinc-500">Nothing to do this time.</p>
                ) : null}
                {plan.dropped.length > 0 ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-zinc-500">{plan.dropped.length} dropped by the checks</summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {plan.dropped.map((item, index) => (
                        <li key={index} className="text-xs text-zinc-400">
                          <span className="text-amber-200">{item.reason}</span> <span className="font-mono text-zinc-600">{item.action}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-50">Journal</h2>
            <p className="mt-1 text-xs text-zinc-500">What the director noted about each group, plus a daily lesson from what got likes and replies.</p>
          </div>
          <select
            value={journalGroup}
            onChange={(event) => setJournalGroup(event.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
          >
            <option value="">All groups</option>
            {directed.map((group) => (
              <option key={group.groupId} value={group.groupId}>
                {group.title}
              </option>
            ))}
          </select>
        </div>
        {visibleJournal.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No notes yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {visibleJournal.map((entry, index) => (
              <li key={`${entry.createdAt}:${index}`} className="text-sm text-zinc-300">
                <span className="mr-2 text-xs text-zinc-500">
                  {groupTitle.get(entry.groupId) ?? "Group"} · {formatRelativeTime(entry.createdAt)}
                </span>
                {entry.note}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CastingSection({
  data,
  busy,
  run,
}: {
  data: DirectorDashboard;
  busy: string | null;
  run: (key: string, work: () => Promise<DirectorDashboard>, success?: string) => Promise<void>;
}) {
  const casting = data.casting;
  const pending = data.joins.filter((join) => join.status === "pending");
  const recent = data.joins.filter((join) => join.status !== "pending").slice(0, 12);
  const select = "rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 disabled:opacity-50";
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-50">Joining groups</h2>
          <p className="mt-1 max-w-2xl text-xs text-zinc-500">
            Once a day per city, props are matched to public groups near home that fit their interests and age, then join a few at a time at
            spread-out hours. Teen personas never join groups with real members. A group with 3 props turns on for the director by itself,
            and its city gets a news and weather watch in review.
          </p>
        </div>
        <FilterChip
          active={casting.enabled}
          onClick={() =>
            void run("casting", () => saveCastingSettingsAction({ enabled: !casting.enabled }), casting.enabled ? "Joining paused." : "Joining on.")
          }
        >
          {casting.enabled ? "On" : "Off"}
        </FilterChip>
      </div>
      {!casting.ready ? (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          Run supabase/sql/prop_casting.sql in the Supabase SQL editor to turn this on.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={casting.maxJoinsPerDay}
            disabled={busy !== null}
            onChange={(event) => void run("casting", () => saveCastingSettingsAction({ maxJoinsPerDay: Number(event.target.value) }))}
            className={select}
          >
            {[0, 1, 2, 3, 5, 8, 12].map((value) => (
              <option key={value} value={value}>
                {value} joins a day
              </option>
            ))}
          </select>
          <select
            value={casting.maxPropShare}
            disabled={busy !== null}
            onChange={(event) => void run("casting", () => saveCastingSettingsAction({ maxPropShare: Number(event.target.value) }))}
            className={select}
          >
            {[0.2, 0.3, 0.4, 0.5].map((value) => (
              <option key={value} value={value}>
                Props at most {Math.round(value * 100)}% of a group with real members
              </option>
            ))}
          </select>
          <select
            value={casting.maxGroupsPerProp}
            disabled={busy !== null}
            onChange={(event) => void run("casting", () => saveCastingSettingsAction({ maxGroupsPerProp: Number(event.target.value) }))}
            className={select}
          >
            {[2, 4, 6, 8, 12].map((value) => (
              <option key={value} value={value}>
                Up to {value} groups per prop
              </option>
            ))}
          </select>
        </div>
      )}
      {pending.length > 0 ? (
        <ul className="mt-4 flex flex-col divide-y divide-zinc-800">
          {pending.map((join) => (
            <li key={join.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0 text-sm">
                <span className="text-zinc-100">{join.propName}</span>
                <span className="text-zinc-500"> joins </span>
                <span className="text-zinc-100">{join.groupTitle}</span>
                <span className="ml-2 font-mono text-xs text-zinc-500">{timeOf(join.runAt)}</span>
                {join.reason ? <p className="text-xs text-zinc-400">{join.reason}</p> : null}
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run(`join:${join.id}`, () => cancelJoinAction(join.id))}
                className="rounded-xl border border-zinc-700 px-3 py-1 text-xs text-zinc-300 disabled:opacity-50"
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      ) : casting.ready ? (
        <p className="mt-4 text-xs text-zinc-500">No joins queued.</p>
      ) : null}
      {recent.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-zinc-500">Recent joins</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {recent.map((join) => (
              <li key={join.id} className="text-xs text-zinc-400">
                {join.propName} � {join.groupTitle} � {join.status}
                {join.error ? <span className="text-amber-200"> � {join.error}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
