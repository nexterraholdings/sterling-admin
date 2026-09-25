"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, ChevronLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ConversationDirectory } from "@/app/dashboard/conversations/ConversationDirectory";
import { RunConversationDialog } from "@/app/dashboard/conversations/RunConversationDialog";
import {
  clearQueuedLines,
  copyPersonality,
  pauseAllGroups,
  previewConversationLine,
  queueGroupPost,
  removeSentLine,
  refreshConversations,
  retryFailedLines,
  runConversationsOnce,
  saveGroupConversation,
  savePropPersonality,
  sendQueuedLineNow,
  setActiveHours,
  setConversationEnabled,
  setDailyCallBudget,
  setGroupAutomatic,
  skipQueuedLine,
} from "@/app/dashboard/conversations/actions";
import { withinActiveHours } from "@/lib/conversations/time";
import { TOPIC_DIRECTIONS } from "@/lib/conversations/types";
import type {
  ConversationActiveRun,
  ConversationDashboard,
  ConversationGroup,
  ConversationPersona,
  ConversationSettings,
  ManualRunRequest,
} from "@/lib/conversations/types";

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 disabled:opacity-50";

const PAGE_SIZE = 12;

const HOUR_PRESETS = [
  { label: "Daytime", start: 8, end: 22 },
  { label: "Evening", start: 17, end: 23 },
  { label: "All day", start: 0, end: 24 },
];

function hourLabel(hour: number) {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function formatWhen(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ConversationsClient({ initial }: { initial: ConversationDashboard }) {
  const [data, setData] = useState(initial);
  const [budget, setBudget] = useState(String(initial.settings.dailyCallBudget));
  const [startHour, setStartHour] = useState(String(initial.settings.activeStartHour));
  const [endHour, setEndHour] = useState(String(initial.settings.activeEndHour));
  const [groupQuery, setGroupQuery] = useState("");
  const [groupPage, setGroupPage] = useState(1);
  const [selection, setSelection] = useState<{ kind: "group" | "account"; id: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [autopilotOpen, setAutopilotOpen] = useState(false);

  useEffect(() => {
    if (data.activeRuns.length === 0) return;
    const timer = window.setInterval(() => {
      void refreshConversations()
        .then((next) => setData(next))
        .catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [data.activeRuns.length]);

  const activeGroups = useMemo(() => data.groups.filter((group) => group.enabled), [data.groups]);
  const railGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    return [...data.groups]
      .filter((group) => !q || `${group.title} ${group.hubTitle ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.title.localeCompare(b.title));
  }, [data.groups, groupQuery]);
  const groupPageCount = Math.max(1, Math.ceil(railGroups.length / PAGE_SIZE));
  const groupPageSafe = Math.min(groupPage, groupPageCount);
  const visibleGroups = railGroups.slice((groupPageSafe - 1) * PAGE_SIZE, groupPageSafe * PAGE_SIZE);

  const selectedGroup = selection?.kind === "group" ? data.groups.find((group) => group.id === selection.id) ?? null : null;
  const selectedAccount = selection?.kind === "account" ? data.personas.find((persona) => persona.userId === selection.id) ?? null : null;

  const cap = data.settings.dailyCallBudget;
  const used = data.usage.calls;
  const remaining = Math.max(0, cap - used);
  const usagePct = cap === 0 ? (used > 0 ? 100 : 0) : Math.min(100, Math.round((used / cap) * 100));

  function applyDashboard(next: ConversationDashboard) {
    setData(next);
    setBudget(String(next.settings.dailyCallBudget));
    setStartHour(String(next.settings.activeStartHour));
    setEndHour(String(next.settings.activeEndHour));
  }

  async function startRun(input: ManualRunRequest) {
    setBusy("run");
    try {
      const { dashboard, tick } = await runConversationsOnce(input);
      applyDashboard(dashboard);
      const queued = tick.notes.find((note) => note.startsWith("Queued"));
      if (tick.skipped === "budget") toast.message("Daily call cap reached.");
      else if (tick.published > 0) toast.success(queued ? `Published ${tick.published}. ${queued}` : `Published ${tick.published}.`);
      else toast.message(queued ?? tick.notes[0] ?? "Nothing was due.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Run failed");
    } finally {
      setBusy(null);
    }
  }

  async function run(key: string, work: () => Promise<ConversationDashboard>) {
    setBusy(key);
    try {
      applyDashboard(await work());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            aria-expanded={autopilotOpen}
            aria-label={autopilotOpen ? "Minimize autopilot" : "Expand autopilot"}
            onClick={() => setAutopilotOpen((open) => !open)}
            className="min-w-0 flex-1 text-left"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Autopilot</span>
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 text-zinc-400 transition ${autopilotOpen ? "rotate-180" : ""}`}
              />
            </span>
            <span className="mt-2 block text-lg font-semibold text-zinc-50">Automatic conversations</span>
            <span className="mt-1 block max-w-xl text-sm text-zinc-400">
              {data.settings.enabled
                ? "On. Prop accounts in the selected groups open posts and reply to each other."
                : "Off. Queued lines stay unsent until you turn it back on."}
            </span>
            {autopilotOpen ? null : (
              <span className="mt-2 block text-xs text-zinc-500">
                {used} / {cap} calls today · {remaining} left
              </span>
            )}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={data.settings.enabled}
            aria-label="Automatic conversations"
            disabled={busy !== null}
            onClick={() => void run("switch", () => setConversationEnabled(!data.settings.enabled))}
            className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${
              data.settings.enabled ? "bg-cyan-400" : "bg-zinc-700"
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-zinc-950 transition ${
                data.settings.enabled ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>

        {autopilotOpen ? (
        <>
        <div className="mt-4 max-w-md">
          <div className="mb-1 flex justify-between text-xs text-zinc-400">
            <span>
              {used} / {cap} calls today
            </span>
            <span>{remaining} left</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${usagePct}%` }} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {data.usage.promptTokens.toLocaleString()} prompt tokens · {data.usage.completionTokens.toLocaleString()}{" "}
            completion tokens · resets midnight America/New_York
          </p>
        </div>

        <form
          className="mt-5 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run("budget", () => setDailyCallBudget(Number(budget)));
          }}
        >
          <label className="text-sm text-zinc-400">
            Most Groq calls in a day
            <input
              className={`${inputCls} mt-1 w-28`}
              type="number"
              min={0}
              max={1000}
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
          >
            Save limit
          </button>
        </form>

        <div className="mt-4">
          <p className="text-sm text-zinc-400">Hours it is allowed to send</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
          {HOUR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={busy !== null}
              onClick={() => void run(`hours:${preset.label}`, () => setActiveHours(preset.start, preset.end))}
              className={`rounded-xl border px-3 py-2 text-sm disabled:opacity-50 ${
                Number(startHour) === preset.start && Number(endHour) === preset.end
                  ? "border-cyan-400/40 text-cyan-100"
                  : "border-zinc-700 text-zinc-300"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <label className="text-sm text-zinc-400">
            From
            <select
              className={`${inputCls} mt-1 w-28`}
              value={startHour}
              onChange={(event) => setStartHour(event.target.value)}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {hourLabel(hour)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            Until
            <select className={`${inputCls} mt-1 w-28`} value={endHour} onChange={(event) => setEndHour(event.target.value)}>
              {Array.from({ length: 24 }, (_, index) => {
                const hour = index + 1;
                return (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("hours", () => setActiveHours(Number(startHour), Number(endHour)))}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
          >
            Save hours
          </button>
          <button
            type="button"
            disabled={busy !== null || activeGroups.length === 0}
            onClick={() => void run("pause-all", () => pauseAllGroups())}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
          >
            Pause all
          </button>
          <button
            type="button"
            disabled={busy !== null || !data.log.some((entry) => entry.status === "failed")}
            onClick={() => void run("retry", () => retryFailedLines())}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
          >
            Retry failed
          </button>
          </div>
        </div>
        <RunConversationDialog
          groups={data.groups}
          personas={data.personas}
          autopilotOn={data.settings.enabled}
          callsLeft={remaining}
          busy={busy !== null}
          onRun={(input) => void startRun(input)}
        />
        </>
        ) : null}
      </section>

      {data.activeRuns.length > 0 ? (
        <ActiveRuns
          runs={data.activeRuns}
          personas={data.personas}
          settings={data.settings}
          used={used}
          cap={cap}
          busy={busy !== null}
          onRefresh={() => void run("refresh", () => refreshConversations())}
          onSendNow={(jobId) => void run(`send:${jobId}`, () => sendQueuedLineNow(jobId))}
          onSkip={(jobId) => void run(`skip:${jobId}`, () => skipQueuedLine(jobId))}
          onSetAutomatic={(groupId, automatic, postsPerDay) =>
            void run(`auto:${groupId}`, () => setGroupAutomatic(groupId, automatic, postsPerDay))
          }
        />
      ) : null}

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="px-1 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan-300/70">
                Groups · {railGroups.length}
              </p>
              <div className="w-full max-w-xs">
                <input
                  className={inputCls}
                  placeholder="Search groups"
                  value={groupQuery}
                  onChange={(event) => {
                    setGroupQuery(event.target.value);
                    setGroupPage(1);
                  }}
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
              {visibleGroups.map((group) => {
                const selected = selection?.kind === "group" && selection.id === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelection({ kind: "group", id: group.id })}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ${
                      selected
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${group.enabled ? "bg-cyan-400" : "bg-zinc-600"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-100">{group.title}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        {group.hubTitle ? `${group.hubTitle} · ` : ""}
                        {group.propMemberCount} {group.propMemberCount === 1 ? "account" : "accounts"}
                        {group.enabled ? " · on" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
              {railGroups.length === 0 ? <p className="px-1 py-3 text-sm text-zinc-500">No groups match.</p> : null}
            </div>
            <CardPager
              page={groupPageSafe}
              pageCount={groupPageCount}
              total={railGroups.length}
              onPage={setGroupPage}
            />
          </section>
          <ConversationDirectory
            personas={data.personas}
            folders={data.folders}
            selectedAccountId={selection?.kind === "account" ? selection.id : null}
            onSelectAccount={(userId) => setSelection({ kind: "account", id: userId })}
            onPersonas={(personas) => setData((current) => ({ ...current, personas }))}
            onFolders={(folders) => setData((current) => ({ ...current, folders }))}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {selectedGroup ? (
            <ActiveGroupCard
              key={`${selectedGroup.id}:${selectedGroup.topic}:${selectedGroup.postsPerDay}:${selectedGroup.repliesPerPost}:${selectedGroup.enabled}`}
              group={selectedGroup}
              disabled={busy !== null}
              onSave={(next) => run(`group:${selectedGroup.id}`, () => saveGroupConversation(next))}
              onPause={() =>
                run(`pause:${selectedGroup.id}`, () =>
                  saveGroupConversation({
                    groupId: selectedGroup.id,
                    enabled: false,
                    topic: selectedGroup.topic,
                    postsPerDay: selectedGroup.postsPerDay,
                    repliesPerPost: selectedGroup.repliesPerPost,
                  }),
                )
              }
              onQueuePost={(userId) => run(`queue:${selectedGroup.id}`, () => queueGroupPost(selectedGroup.id, userId))}
              onPreview={async (userId) => {
                setBusy(`preview:${selectedGroup.id}`);
                try {
                  const result = await previewConversationLine(selectedGroup.id, userId);
                  applyDashboard(result.dashboard);
                  if (result.error) toast.error(result.error);
                  return result.text;
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Preview failed");
                  return null;
                } finally {
                  setBusy(null);
                }
              }}
            />
          ) : null}
          {selectedAccount ? (
            <PersonaRow
              key={`${selectedAccount.userId}:${selectedAccount.personality}`}
              persona={selectedAccount}
              disabled={busy !== null}
              onSave={(personality) =>
                run(`persona:${selectedAccount.userId}`, () => savePropPersonality(selectedAccount.userId, personality))
              }
              onCopy={() =>
                (async () => {
                  setBusy(`copy:${selectedAccount.userId}`);
                  try {
                    const result = await copyPersonality(selectedAccount.userId);
                    applyDashboard(result.dashboard);
                    toast.success(`Copied to ${result.copied}.`);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not copy");
                  } finally {
                    setBusy(null);
                  }
                })()
              }
            />
          ) : null}
          {!selectedGroup && !selectedAccount ? (
            <p className="rounded-3xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-sm text-zinc-500">
              Pick a group or a prop account.
            </p>
          ) : null}

          <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-50">Queue</h3>
            <button
              type="button"
              disabled={busy !== null || data.queue.length === 0}
              onClick={() => void run("clear", () => clearQueuedLines())}
              className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-50"
            >
              Clear queue
            </button>
          </div>
          {data.queue.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Nothing is waiting to send.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {data.queue.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 px-3 py-2">
                  <p className="text-sm text-zinc-200">
                    <span className="text-zinc-500">{formatWhen(item.runAt)} · </span>
                    {item.groupTitle} · {item.authorName} · {item.kind === "reply" ? "Reply" : "Post"}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void run(`send:${item.id}`, () => sendQueuedLineNow(item.id))}
                      className="rounded-xl border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50"
                    >
                      Send now
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void run(`skip:${item.id}`, () => skipQueuedLine(item.id))}
                      className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-50"
                    >
                      Skip
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-50">Today’s lines</h2>
        {data.log.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Nothing sent yet today.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {data.log.map((entry) => (
              <li key={entry.id} className="rounded-2xl border border-zinc-800 px-3 py-2">
                <p className="text-xs text-zinc-500">
                  {entry.groupTitle} · {entry.authorName} · {entry.kind === "reply" ? "Reply" : "Post"}
                  {entry.finishedAt ? ` · ${formatWhen(entry.finishedAt)}` : ""}
                  {entry.status === "failed" ? " · Failed" : ""}
                </p>
                <p className="mt-1 text-sm text-zinc-100">{entry.body || entry.error || "No text"}</p>
                {entry.commentId ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run(`remove:${entry.id}`, () => removeSentLine(entry.id))}
                    className="mt-2 rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
        </div>
      </div>
    </div>
  );
}

function ActiveRuns({
  runs,
  personas,
  settings,
  used,
  cap,
  busy,
  onRefresh,
  onSendNow,
  onSkip,
  onSetAutomatic,
}: {
  runs: ConversationActiveRun[];
  personas: ConversationPersona[];
  settings: ConversationSettings;
  used: number;
  cap: number;
  busy: boolean;
  onRefresh: () => void;
  onSendNow: (jobId: string) => void;
  onSkip: (jobId: string) => void;
  onSetAutomatic: (groupId: string, automatic: boolean, postsPerDay: number) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openRun = runs.find((run) => run.groupId === openId) ?? null;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cyan-300/80">In progress</p>
          <p className="mt-1 text-sm text-zinc-500">
            {runs.length} {runs.length === 1 ? "run" : "runs"} · open one for the full view
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onRefresh}
          className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {runs.map((run) => {
          const issueCount = runIssueCount(run, settings, used, cap);
          const pct = run.total === 0 ? 0 : Math.round((run.sent / run.total) * 100);
          return (
            <button
              key={run.groupId}
              type="button"
              onClick={() => setOpenId(run.groupId)}
              className="flex w-80 shrink-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 text-left transition hover:border-cyan-400/40"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${run.waiting + run.running > 0 ? "bg-cyan-400" : "bg-zinc-600"}`} />
                  <span className="truncate text-sm font-medium text-zinc-50">{run.groupTitle}</span>
                </span>
                {issueCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-100">
                    {issueCount} {issueCount === 1 ? "issue" : "issues"}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-zinc-500">Clear</span>
                )}
              </span>
              <span className="mt-5 flex items-end justify-between gap-3">
                <span className="text-3xl font-semibold tabular-nums leading-none text-zinc-50">
                  {run.sent}
                  <span className="text-base font-normal text-zinc-500">/{run.total}</span>
                </span>
                <span className="text-right text-xs text-zinc-400">
                  {run.autoContinue ? (
                    <span className="mb-1 inline-block rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-cyan-100">
                      Automatic
                    </span>
                  ) : null}
                  <span className="block">{run.pace}</span>
                  <span className="mt-1 block text-zinc-500">{run.nextAt ? formatWhen(run.nextAt) : "Nothing waiting"}</span>
                </span>
              </span>
              <span className="mt-4 block h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <span className="block h-full rounded-full bg-cyan-400" style={{ width: `${pct}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      {openRun ? (
        <RunScreen
          run={openRun}
          personas={personas}
          settings={settings}
          used={used}
          cap={cap}
          busy={busy}
          onRefresh={onRefresh}
          onSendNow={onSendNow}
          onSkip={onSkip}
          onSetAutomatic={onSetAutomatic}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </section>
  );
}

function runIssueCount(run: ConversationActiveRun, settings: ConversationSettings, used: number, cap: number) {
  return runIssues(run, settings, used, cap).length;
}

function runIssues(run: ConversationActiveRun, settings: ConversationSettings, used: number, cap: number) {
  const waiting = run.waiting + run.running > 0;
  const overdue = run.lines.filter(
    (line) => line.status === "pending" && new Date(line.runAt).getTime() < Date.now() - 10 * 60_000,
  ).length;
  return [
    ...(overdue > 0 && settings.enabled && used < cap
      ? [
          `${overdue} ${overdue === 1 ? "line is" : "lines are"} overdue. The scheduler has not picked ${overdue === 1 ? "it" : "them"} up, so use Send now or check that the latest admin is deployed.`,
        ]
      : []),
    ...(!settings.enabled && waiting ? ["Automatic conversations is off, so waiting lines stay unsent."] : []),
    ...(used >= cap && waiting ? ["The daily call cap is used up."] : []),
    ...(!withinActiveHours(settings.activeStartHour, settings.activeEndHour) && waiting
      ? ["Outside the hours it is allowed to send."]
      : []),
    ...new Set(run.lines.map((line) => line.error).filter((error): error is string => Boolean(error))),
  ];
}

type LineFilter = "all" | "pending" | "done" | "failed";

const LINE_FILTERS: Array<{ id: LineFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Waiting" },
  { id: "done", label: "Sent" },
  { id: "failed", label: "Failed" },
];

function splitRunTopic(topic: string): { subject: string; tone: string | null; note: string | null } {
  const direction = TOPIC_DIRECTIONS.find((item) => topic.includes(item.line));
  if (!direction) return { subject: topic.trim() || "Whatever the group is about", tone: null, note: null };
  const [before, after] = topic.split(direction.line);
  const note = after.replace(/^[.\s]+/, "").trim() || null;
  const subject = before.trim().startsWith("Stay on what this group")
    ? "Whatever the group is about"
    : before.replace(/[.\s]+$/, "").trim() || "Whatever the group is about";
  return { subject, tone: direction.label, note };
}

function minutesUntil(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutes <= 0 && minutes > -3) return "sending in the next check";
  if (minutes <= 0) return `${-minutes} min late, sending in the next check`;
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
}

function RunScreen({
  run,
  personas,
  settings,
  used,
  cap,
  busy,
  onRefresh,
  onSendNow,
  onSkip,
  onSetAutomatic,
  onClose,
}: {
  run: ConversationActiveRun;
  personas: ConversationPersona[];
  settings: ConversationSettings;
  used: number;
  cap: number;
  busy: boolean;
  onRefresh: () => void;
  onSendNow: (jobId: string) => void;
  onSkip: (jobId: string) => void;
  onSetAutomatic: (groupId: string, automatic: boolean, postsPerDay: number) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<LineFilter>("all");
  const [postsPerDay, setPostsPerDay] = useState(String(Math.max(1, run.postsPerDay || 4)));
  const postsPerDayValue = Math.min(20, Math.max(1, Number(postsPerDay) || 1));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const personaById = useMemo(() => new Map(personas.map((persona) => [persona.userId, persona])), [personas]);
  const issues = runIssues(run, settings, used, cap);
  const topic = splitRunTopic(run.topic);
  const inHours = withinActiveHours(settings.activeStartHour, settings.activeEndHour);
  const hasWork = run.waiting + run.running > 0;
  const status =
    issues.length > 0 || run.failed > 0
      ? { label: "Needs attention", dot: "bg-amber-300", text: "text-amber-100", ring: "border-amber-300/40" }
      : hasWork
        ? { label: "Running", dot: "bg-cyan-400", text: "text-cyan-100", ring: "border-cyan-400/40" }
        : { label: "Finished", dot: "bg-emerald-400", text: "text-emerald-100", ring: "border-emerald-400/40" };

  const pctOf = (count: number) => (run.total === 0 ? 0 : (count / run.total) * 100);
  const counts: Record<LineFilter, number> = {
    all: run.lines.length,
    pending: run.lines.filter((line) => line.status === "pending" || line.status === "running").length,
    done: run.sent,
    failed: run.failed,
  };
  const visibleLines = run.lines.filter((line) => {
    if (filter === "all") return true;
    if (filter === "pending") return line.status === "pending" || line.status === "running";
    return line.status === filter;
  });
  const capPct = cap === 0 ? 100 : Math.min(100, Math.round((used / cap) * 100));

  if (!mounted) return null;

  return createPortal(
    <div
      className="dashboard-tech fixed inset-0 z-[60] isolate bg-[#06090e] text-zinc-50"
      style={{ backgroundColor: "#06090e" }}
      role="dialog"
      aria-modal="true"
      aria-label={run.groupTitle}
    >
      <main className="flex h-full flex-col bg-[#06090e]">
        <header className="flex shrink-0 items-center gap-4 border-b border-zinc-800 bg-[#06090e] px-4 py-3 sm:px-8">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-cyan-400/40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Run in progress</p>
            <h2 className="truncate text-base font-semibold text-zinc-50 sm:text-lg">{run.groupTitle}</h2>
          </div>
          <span className={`hidden items-center gap-2 rounded-full border px-3 py-1 text-xs sm:flex ${status.ring} ${status.text}`}>
            <span className={`h-2 w-2 rounded-full ${status.dot} ${hasWork && issues.length === 0 ? "animate-pulse" : ""}`} />
            {status.label}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-cyan-400/40 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-6">
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Sent" value={String(run.sent)} sub={`of ${run.total} lines`} accent="text-cyan-100" />
                <StatTile
                  label="Waiting"
                  value={String(run.waiting + run.running)}
                  sub={run.running > 0 ? `${run.running} sending now` : "scheduled"}
                />
                <StatTile
                  label="Failed"
                  value={String(run.failed)}
                  sub={run.failed > 0 ? "see the list below" : "none so far"}
                  accent={run.failed > 0 ? "text-amber-100" : undefined}
                />
                <StatTile
                  label="Next line"
                  value={run.nextAt ? formatWhen(run.nextAt).split(", ").pop() ?? "" : "None"}
                  sub={run.nextAt ? minutesUntil(run.nextAt) : "nothing scheduled"}
                />
              </div>
              <div className="mt-5">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full bg-cyan-400" style={{ width: `${pctOf(run.sent)}%` }} />
                  <div className="h-full bg-cyan-200/70" style={{ width: `${pctOf(run.running)}%` }} />
                  <div className="h-full bg-amber-300" style={{ width: `${pctOf(run.failed)}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                  <Legend dot="bg-cyan-400" label={`Sent ${run.sent}`} />
                  {run.running > 0 ? <Legend dot="bg-cyan-200/70" label={`Sending ${run.running}`} /> : null}
                  {run.failed > 0 ? <Legend dot="bg-amber-300" label={`Failed ${run.failed}`} /> : null}
                  <Legend dot="bg-zinc-700" label={`Waiting ${run.waiting}`} />
                </div>
              </div>
            </section>

            {issues.length > 0 ? (
              <section className="rounded-3xl border border-amber-300/30 bg-amber-300/[0.06] p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-200" aria-hidden />
                  <h3 className="text-sm font-semibold text-amber-50">Needs attention</h3>
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {issues.map((issue) => (
                    <li key={issue} className="text-sm text-amber-100/90">
                      {issue}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-zinc-50">Conversation</h3>
                  <div className="flex rounded-xl border border-zinc-800 p-0.5">
                    {LINE_FILTERS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setFilter(item.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs transition ${
                          filter === item.id ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {item.label}
                        <span className="ml-1.5 tabular-nums text-zinc-500">{counts[item.id]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {visibleLines.length === 0 ? (
                  <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
                    Nothing here.
                  </p>
                ) : (
                  <ol className="mt-4 flex flex-col gap-3">
                    {visibleLines.map((line) => {
                      const persona = personaById.get(line.authorId);
                      const waiting = line.status === "pending";
                      return (
                        <li
                          key={line.id}
                          className={`flex gap-3 rounded-2xl border px-4 py-3 ${
                            line.status === "failed" ? "border-amber-300/30" : "border-zinc-800"
                          } ${line.kind === "reply" ? "sm:ml-8" : ""}`}
                        >
                          <PersonaAvatar name={line.authorName} avatarUrl={persona?.avatarUrl ?? null} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-medium text-zinc-100">{line.authorName}</span>
                              <span className="rounded-md border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                                {line.kind === "reply" ? "Reply" : "Post"}
                              </span>
                              <LineBadge status={line.status} />
                              <span className="ml-auto text-xs text-zinc-500">
                                {formatWhen(line.runAt)}
                                {waiting ? ` · ${minutesUntil(line.runAt)}` : ""}
                              </span>
                            </div>
                            {line.body ? (
                              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-zinc-100">{line.body}</p>
                            ) : (
                              <p className="mt-1.5 text-sm italic text-zinc-500">
                                {line.status === "failed" ? "Nothing was published." : "Written when it sends."}
                              </p>
                            )}
                            {line.error ? <p className="mt-1.5 text-xs text-amber-200/90">{line.error}</p> : null}
                            {waiting ? (
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => onSendNow(line.id)}
                                  className="rounded-xl border border-cyan-400/30 px-3 py-1.5 text-xs text-cyan-100 disabled:opacity-50"
                                >
                                  Send now
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => onSkip(line.id)}
                                  className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 disabled:opacity-50"
                                >
                                  Skip
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <aside className="flex flex-col gap-6">
                <section
                  className={`rounded-3xl border p-5 ${run.autoContinue ? "border-cyan-400/40 bg-zinc-900" : "border-zinc-800 bg-zinc-900"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-zinc-50">Automatic</h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        {run.autoContinue
                          ? `Keeps going every day at ${run.postsPerDay} ${run.postsPerDay === 1 ? "post" : "posts"} a day.`
                          : "Stops when the lines from this run are sent."}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={run.autoContinue}
                      aria-label="Make this conversation automatic"
                      disabled={busy}
                      onClick={() => onSetAutomatic(run.groupId, !run.autoContinue, postsPerDayValue)}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
                        run.autoContinue ? "bg-cyan-400" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-zinc-950 transition ${run.autoContinue ? "left-6" : "left-1"}`}
                      />
                    </button>
                  </div>
                  {run.autoContinue ? (
                    <form
                      className="mt-4 flex items-end gap-2 border-t border-zinc-800 pt-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onSetAutomatic(run.groupId, true, postsPerDayValue);
                      }}
                    >
                      <label className="flex-1 text-xs text-zinc-400">
                        New posts per day
                        <input
                          type="number"
                          min={1}
                          max={20}
                          className={`${inputCls} mt-1`}
                          value={postsPerDay}
                          onChange={(event) => setPostsPerDay(event.target.value)}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={busy || postsPerDayValue === run.postsPerDay}
                        className="rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </form>
                  ) : null}
                  {run.autoContinue && !settings.enabled ? (
                    <p className="mt-3 text-xs text-amber-200">Automatic conversations is off, so nothing new starts until it is on.</p>
                  ) : null}
                </section>

                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <h3 className="text-sm font-semibold text-zinc-50">Run setup</h3>
                  <dl className="mt-4 flex flex-col gap-4">
                    <Setting label="Subject" value={topic.subject} />
                    {topic.tone ? (
                      <div>
                        <dt className="text-xs text-zinc-500">Tone</dt>
                        <dd className="mt-1">
                          <span className="rounded-full border border-cyan-400/30 px-2.5 py-0.5 text-xs text-cyan-100">{topic.tone}</span>
                        </dd>
                      </div>
                    ) : null}
                    {topic.note ? <Setting label="Extra detail" value={topic.note} /> : null}
                    <Setting label="Pace" value={run.pace} />
                    <Setting
                      label="Messages"
                      value={`${run.posts} new ${run.posts === 1 ? "post" : "posts"}, ${run.repliesPerPost} ${run.repliesPerPost === 1 ? "reply" : "replies"} each`}
                    />
                  </dl>
                </section>

                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-50">Accounts</h3>
                    <span className="text-xs text-zinc-500">{run.accountIds.length}</span>
                  </div>
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {run.accountIds.map((userId, index) => {
                      const persona = personaById.get(userId);
                      const name = persona?.name ?? run.accountNames[index] ?? "Prop account";
                      const lines = run.lines.filter((line) => line.authorId === userId);
                      return (
                        <li key={userId} className="flex items-center gap-3">
                          <PersonaAvatar name={name} avatarUrl={persona?.avatarUrl ?? null} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-zinc-100">{name}</span>
                            {persona?.username ? <span className="block truncate text-xs text-zinc-500">@{persona.username}</span> : null}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                            {lines.filter((line) => line.status === "done").length}/{lines.length}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <h3 className="text-sm font-semibold text-zinc-50">Sending conditions</h3>
                  <ul className="mt-4 flex flex-col gap-3 text-sm">
                    <Condition ok={settings.enabled} label="Automatic conversations" value={settings.enabled ? "On" : "Off"} />
                    <Condition
                      ok={inHours}
                      label="Allowed hours"
                      value={`${hourLabel(settings.activeStartHour)} – ${hourLabel(settings.activeEndHour)}`}
                    />
                    <li>
                      <Condition ok={used < cap} label="Groq calls today" value={`${used} / ${cap}`} bare />
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <div className={`h-full rounded-full ${used < cap ? "bg-cyan-400" : "bg-amber-300"}`} style={{ width: `${capPct}%` }} />
                      </div>
                    </li>
                  </ul>
                </section>
              </aside>
            </div>
          </div>
        </div>
      </main>
    </div>,
    document.body,
  );
}

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ?? "text-zinc-50"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function Condition({ ok, label, value, bare = false }: { ok: boolean; label: string; value: string; bare?: boolean }) {
  const body = (
    <span className="flex items-center gap-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-300"}`} />
      <span className="flex-1 text-zinc-300">{label}</span>
      <span className={ok ? "text-zinc-100" : "text-amber-100"}>{value}</span>
    </span>
  );
  return bare ? body : <li>{body}</li>;
}

function LineBadge({ status }: { status: ConversationActiveRun["lines"][number]["status"] }) {
  const styles: Record<typeof status, string> = {
    done: "border-cyan-400/30 text-cyan-100",
    running: "border-cyan-200/30 text-cyan-50",
    pending: "border-zinc-700 text-zinc-400",
    failed: "border-amber-300/40 text-amber-100",
    skipped: "border-zinc-800 text-zinc-500",
  };
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${styles[status]}`}>
      {lineStatus(status)}
    </span>
  );
}

function PersonaAvatar({ name, avatarUrl, size = "md" }: { name: string; avatarUrl: string | null; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-8 w-8 text-[10px]" : "h-9 w-9 text-[11px]";
  return avatarUrl ? (
    <img src={avatarUrl} alt="" className={`${box} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${box} flex shrink-0 items-center justify-center rounded-full bg-zinc-800 font-semibold text-cyan-100`}>
      {initials(name)}
    </span>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-zinc-100">{value}</dd>
    </div>
  );
}

function lineStatus(status: ConversationActiveRun["lines"][number]["status"]) {
  if (status === "done") return "Sent";
  if (status === "running") return "Sending";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return "Waiting";
}

function CardPager({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(total, page * PAGE_SIZE);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-zinc-500">
        {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-xs text-zinc-500">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function initials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "?";
}

function ActiveGroupCard({
  group,
  disabled,
  onSave,
  onPause,
  onPreview,
  onQueuePost,
}: {
  group: ConversationGroup;
  disabled: boolean;
  onSave: (next: {
    groupId: string;
    enabled: boolean;
    topic: string;
    postsPerDay: number;
    repliesPerPost: number;
  }) => Promise<void>;
  onPause: () => Promise<void>;
  onPreview: (userId: string) => Promise<string | null>;
  onQueuePost: (userId: string) => Promise<void>;
}) {
  const [topic, setTopic] = useState(group.topic);
  const [postsPerDay, setPostsPerDay] = useState(String(group.postsPerDay));
  const [repliesPerPost, setRepliesPerPost] = useState(String(group.repliesPerPost));
  const [userId, setUserId] = useState(group.members[0]?.userId ?? "");
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form
      className="rounded-2xl border border-zinc-800 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          groupId: group.id,
          enabled: true,
          topic,
          postsPerDay: Number(postsPerDay),
          repliesPerPost: Number(repliesPerPost),
        });
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-100">{group.title}</p>
          <p className="text-xs text-zinc-500">
            {group.hubTitle ? `${group.hubTitle} · ` : ""}
            {group.propMemberCount} prop {group.propMemberCount === 1 ? "account" : "accounts"}
            {!group.enabled && group.propMemberCount < 2 ? " · needs two" : ""}
          </p>
        </div>
        {group.enabled ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void onPause()}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-50"
          >
            Pause
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_5rem_5rem_auto]">
        <input className={inputCls} placeholder="Topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
        <input
          className={inputCls}
          type="number"
          min={0}
          max={20}
          aria-label="Posts per day"
          value={postsPerDay}
          onChange={(event) => setPostsPerDay(event.target.value)}
        />
        <input
          className={inputCls}
          type="number"
          min={0}
          max={6}
          aria-label="Replies per post"
          value={repliesPerPost}
          onChange={(event) => setRepliesPerPost(event.target.value)}
        />
        <button
          type="submit"
          disabled={disabled || (!group.enabled && group.propMemberCount < 2)}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
        >
          {group.enabled ? "Save" : "Turn on"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1 text-sm text-zinc-400">
          Preview as
          <select className={`${inputCls} mt-1`} value={userId} onChange={(event) => setUserId(event.target.value)}>
            {group.members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
                {member.username ? ` (@${member.username})` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || !userId}
          onClick={() =>
            void (async () => {
              const text = await onPreview(userId);
              if (text) setPreview(text);
            })()
          }
          className="rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={disabled || !userId}
          onClick={() => void onQueuePost(userId)}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
        >
          Queue post
        </button>
      </div>
      {preview ? <p className="mt-3 rounded-2xl border border-zinc-800 px-3 py-2 text-sm text-zinc-100">{preview}</p> : null}
    </form>
  );
}

function PersonaRow({
  persona,
  disabled,
  onSave,
  onCopy,
}: {
  persona: ConversationPersona;
  disabled: boolean;
  onSave: (personality: string) => Promise<void>;
  onCopy: () => Promise<void>;
}) {
  const [personality, setPersonality] = useState(persona.personality);

  return (
    <form
      className="grid gap-3 rounded-2xl border border-zinc-800 p-3 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(personality);
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {persona.avatarUrl ? (
          <img src={persona.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-cyan-100">
            {initials(persona.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{persona.name}</p>
          <p className="truncate text-xs text-zinc-500">{persona.username ? `@${persona.username}` : "No username"}</p>
        </div>
      </div>
      <textarea
        className={`${inputCls} min-h-20 resize-y`}
        placeholder="Casual, local, a little skeptical"
        maxLength={500}
        value={personality}
        onChange={(event) => setPersonality(event.target.value)}
      />
      <div className="flex flex-col gap-2">
        <button type="submit" disabled={disabled} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50">
          Save
        </button>
        <button
          type="button"
          disabled={disabled || !personality.trim()}
          onClick={() => void onCopy()}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
        >
          Copy to group
        </button>
      </div>
    </form>
  );
}
