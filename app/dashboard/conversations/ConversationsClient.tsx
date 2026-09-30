"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ConversationDirectory } from "@/app/dashboard/conversations/ConversationDirectory";
import { RunConversationDialog, WeekFields } from "@/app/dashboard/conversations/RunConversationDialog";
import {
  addAccountsToGroup,
  clearQueuedLines,
  copyPersonality,
  pauseAllGroups,
  removeSentLine,
  refreshConversations,
  retryFailedLines,
  startRegionRun,
  savePropVoice,
  saveRegionAbbrev,
  saveRegionGrammar,
  saveRegionLocaleAction,
  savePropHomeAction,
  saveRegionObjectiveAction,
  saveRegionRules,
  saveRegionSwear,
  saveRegionWeek,
  addRegionPostsToday,
  setRegionAccountIncluded,
  setRegionAutomatic,
  setRegionGroupIncluded,
  setRegionRunPaused,
  sendQueuedLineNow,
  setActiveHours,
  setConversationEnabled,
  setDailyCallBudget,
  skipQueuedLine,
  updateSentLine,
} from "@/app/dashboard/conversations/actions";
import { hourIn, nyDateKey, withinActiveHours } from "@/lib/conversations/time";
import { abbrevHint, abbrevLabel, editableRunRules, forbidsHyphens, grammarHint, grammarLabel, serializeRunRules, SWEAR_RATES, withNoHyphenRule, type SwearRate } from "@/lib/conversations/rules";
import { describeWeek, postsInWindow } from "@/lib/conversations/week";
import { TOPIC_DIRECTIONS } from "@/lib/conversations/types";
import { samePropVoice, voiceIsSet, type PropVoice } from "@/lib/prop-voice";
import { PropVoiceFields } from "@/app/dashboard/users/prop-accounts/PropVoiceFields";
import type {
  ConversationActiveRun,
  ConversationDashboard,
  ConversationGroup,
  ConversationPersona,
  ConversationSettings,
  RegionRun,
  RegionRunAccount,
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
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [budget, setBudget] = useState(String(initial.settings.dailyCallBudget));
  const [startHour, setStartHour] = useState(String(initial.settings.activeStartHour));
  const [endHour, setEndHour] = useState(String(initial.settings.activeEndHour));
  const [groupQuery, setGroupQuery] = useState("");
  const [groupPage, setGroupPage] = useState(1);
  const [selection, setSelection] = useState<{ kind: "group" | "account"; id: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [autopilotOpen, setAutopilotOpen] = useState(false);
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);
  const ignoreGroupClick = useRef(false);

  const runLive = data.settings.enabled || data.regionRuns.some((run) => run.interacting);

  useEffect(() => {
    if (!runLive) return;
    const timer = window.setInterval(() => {
      void refreshConversations()
        .then((next) => setData(next))
        .catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [runLive]);

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

  async function createRun(input: { hubId: string; objective: string; groupIds: string[] }) {
    setBusy("run");
    try {
      applyDashboard(await startRegionRun(input));
      toast.success("Run started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Run failed");
    } finally {
      setBusy(null);
    }
  }

  function accountIdsFromDrop(event: DragEvent<HTMLElement>) {
    const raw = event.dataTransfer.getData("application/x-prop-accounts");
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return [...new Set(parsed.map((id) => String(id).trim()).filter(Boolean))];
    } catch {
      return [];
    }
  }

  function allowGroupDrop(event: DragEvent<HTMLElement>, groupId: string) {
    if (!Array.from(event.dataTransfer.types).includes("application/x-prop-accounts")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropGroupId((current) => (current === groupId ? current : groupId));
  }

  async function dropAccountsOnGroup(event: DragEvent<HTMLElement>, group: ConversationGroup) {
    event.preventDefault();
    event.stopPropagation();
    ignoreGroupClick.current = true;
    window.setTimeout(() => {
      ignoreGroupClick.current = false;
    }, 0);
    setDropGroupId(null);
    const ids = accountIdsFromDrop(event);
    if (ids.length === 0 || busy !== null) return;
    const memberIds = new Set(group.members.map((member) => member.userId));
    const adding = ids.filter((id) => !memberIds.has(id));
    if (adding.length === 0) {
      toast.message(ids.length === 1 ? "Already in this group." : "Those accounts are already in this group.");
      return;
    }
    const names = adding.map((id) => data.personas.find((persona) => persona.userId === id)?.name ?? "Prop account");
    await run(`add:${group.id}`, async () => {
      const next = await addAccountsToGroup(group.id, adding);
      toast.success(
        adding.length === 1 ? `Added ${names[0]} to ${group.title}.` : `Added ${adding.length} accounts to ${group.title}.`,
      );
      return next;
    });
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
          <div className="flex shrink-0 items-center gap-3">
            <RunConversationDialog groups={data.groups} busy={busy !== null} onCreate={(input) => void createRun(input)} />
          <button
            type="button"
            role="switch"
            aria-checked={data.settings.enabled}
            aria-label="Automatic conversations"
            disabled={busy !== null}
            onClick={() => void run("switch", () => setConversationEnabled(!data.settings.enabled))}
            className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${
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
          <p className="text-sm text-zinc-400">Hours it is allowed to send, in each region&apos;s local time</p>
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
        </>
        ) : null}
      </section>

      <ActiveRuns
          regions={data.regionRuns}
          personas={data.personas}
          settings={data.settings}
          used={used}
          cap={cap}
          busy={busy !== null}
          onRefresh={() => void run("refresh", () => refreshConversations())}
          onSendNow={(jobId) => void run(`send:${jobId}`, () => sendQueuedLineNow(jobId))}
          onSkip={(jobId) => void run(`skip:${jobId}`, () => skipQueuedLine(jobId))}
          onEditLine={(jobId, body) => void run(`edit:${jobId}`, () => updateSentLine(jobId, body))}
          onDeleteLine={(jobId) => void run(`delete:${jobId}`, () => removeSentLine(jobId))}
          onSetAutomatic={(groupIds, automatic, postsPerDay) =>
            void run("auto:region", () => setRegionAutomatic(groupIds, automatic, postsPerDay))
          }
          onSaveRules={(groupIds, rules) => void run("rules:region", () => saveRegionRules(groupIds, rules))}
          onSaveSwear={(groupIds, swear, swearRate) =>
            void run("swear:region", () => saveRegionSwear(groupIds, swear, swearRate))
          }
          onSaveGrammar={(groupIds, grammar) => void run("grammar:region", () => saveRegionGrammar(groupIds, grammar))}
          onSaveAbbrev={(groupIds, abbrev) => void run("abbrev:region", () => saveRegionAbbrev(groupIds, abbrev))}
          onSaveWeek={(groupIds, input) => void run("week:region", () => saveRegionWeek(groupIds, input))}
          onAddToday={(groupIds) =>
            void run("add-today", async () => {
              const next = await addRegionPostsToday(groupIds);
              toast.success(
                groupIds.length === 1 ? "Added a post for today." : `Added a post for today in ${groupIds.length} groups.`,
              );
              return next;
            })
          }
          onSaveObjective={(hubId, objective) => void run(`objective:${hubId}`, () => saveRegionObjectiveAction(hubId, objective))}
          onSaveLocale={(hubId, locale) => void run(`locale:${hubId}`, () => saveRegionLocaleAction(hubId, locale))}
          onToggleGroup={(groupId, included) => void run(`group:${groupId}`, () => setRegionGroupIncluded(groupId, included))}
          onToggleAccount={(hubId, userId, included) =>
            void run(`account:${userId}`, () => setRegionAccountIncluded(hubId, userId, included))
          }
          onSaveVoice={(userId, voice) => void run(`persona:${userId}`, () => savePropVoice(userId, voice))}
          onSaveHome={(userId, input) => void run(`home:${userId}`, () => savePropHomeAction(userId, input))}
          onPause={(hubId, paused) => void run(`pause:${hubId}`, () => setRegionRunPaused(hubId, paused))}
          groups={data.groups}
          onAddAccounts={(groupId, userIds) =>
            void run(`add:${groupId}`, async () => {
              const next = await addAccountsToGroup(groupId, userIds);
              const title = data.groups.find((group) => group.id === groupId)?.title ?? "the group";
              toast.success(userIds.length === 1 ? `Added 1 account to ${title}.` : `Added ${userIds.length} accounts to ${title}.`);
              return next;
            })
          }
        />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="px-1">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cyan-300/70">
                  Groups · {railGroups.length}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Drop a prop account on a group to add it.</p>
              </div>
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
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
              {visibleGroups.map((group) => {
                const dropping = dropGroupId === group.id;
                return (
                  <div
                    key={group.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (ignoreGroupClick.current) return;
                      router.push(`/dashboard/groups/${group.id}`);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      router.push(`/dashboard/groups/${group.id}`);
                    }}
                    onDragOver={(event) => allowGroupDrop(event, group.id)}
                    onDragLeave={(event) => {
                      const next = event.relatedTarget;
                      if (next instanceof Node && event.currentTarget.contains(next)) return;
                      setDropGroupId((current) => (current === group.id ? null : current));
                    }}
                    onDrop={(event) => void dropAccountsOnGroup(event, group)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 text-left ${
                      dropping
                        ? "border-cyan-400 bg-cyan-400/15"
                        : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${group.enabled ? "bg-cyan-400" : "bg-zinc-600"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-100">{group.title}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        {dropping
                          ? "Release to add"
                          : `${group.hubTitle ? `${group.hubTitle} · ` : ""}${group.propMemberCount} ${group.propMemberCount === 1 ? "account" : "accounts"}${group.enabled ? " · on" : ""}`}
                      </span>
                    </span>
                  </div>
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
          {selectedAccount ? (
            <PersonaRow
              key={`${selectedAccount.userId}:${selectedAccount.personality}:${selectedAccount.swear}:${selectedAccount.swearRate}:${selectedAccount.grammar}:${selectedAccount.abbrev}:${selectedAccount.behavior}:${selectedAccount.traits.age ?? ""}:${selectedAccount.traits.temperament}:${selectedAccount.traits.talk}:${selectedAccount.traits.life}:${selectedAccount.traits.interests}`}
              persona={selectedAccount}
              disabled={busy !== null}
              onSave={(voice) =>
                run(`persona:${selectedAccount.userId}`, () => savePropVoice(selectedAccount.userId, voice))
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
          {!selectedAccount ? (
            <p className="rounded-3xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-sm text-zinc-500">
              Open a group for its content, members, settings, and analytics. Pick a prop account to set how it behaves.
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
  regions,
  personas,
  settings,
  used,
  cap,
  busy,
  onRefresh,
  onSendNow,
  onSkip,
  onEditLine,
  onDeleteLine,
  onSetAutomatic,
  onSaveRules,
  onSaveSwear,
  onSaveGrammar,
  onSaveAbbrev,
  onSaveWeek,
  onAddToday,
  onSaveObjective,
  onSaveLocale,
  onToggleGroup,
  onToggleAccount,
  onSaveVoice,
  onSaveHome,
  onPause,
  groups,
  onAddAccounts,
}: {
  regions: RegionRun[];
  personas: ConversationPersona[];
  settings: ConversationSettings;
  used: number;
  cap: number;
  busy: boolean;
  onRefresh: () => void;
  onSendNow: (jobId: string) => void;
  onSkip: (jobId: string) => void;
  onEditLine: (jobId: string, body: string) => void;
  onDeleteLine: (jobId: string) => void;
  onSetAutomatic: (groupIds: string[], automatic: boolean, postsPerDay: number) => void;
  onSaveRules: (groupIds: string[], rules: string[]) => void;
  onSaveSwear: (groupIds: string[], swear: boolean, swearRate: SwearRate) => void;
  onSaveGrammar: (groupIds: string[], grammar: number) => void;
  onSaveAbbrev: (groupIds: string[], abbrev: number) => void;
  onSaveWeek: (groupIds: string[], input: { days: number; startHour: number; endHour: number; everyMinutes: number; callsPerDay: number }) => void;
  onAddToday: (groupIds: string[]) => void;
  onSaveObjective: (hubId: string, objective: string) => void;
  onSaveLocale: (hubId: string, locale: { timeZone: string; language: string }) => void;
  onToggleGroup: (groupId: string, included: boolean) => void;
  onToggleAccount: (hubId: string, userId: string, included: boolean) => void;
  onSaveVoice: (userId: string, voice: PropVoice) => void;
  onSaveHome: (userId: string, input: { hubId: string | null; languages: string[] }) => void;
  onPause: (hubId: string, paused: boolean) => void;
  groups: ConversationGroup[];
  onAddAccounts: (groupId: string, userIds: string[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const homeOptions = regions
    .filter((region) => region.hubId)
    .map((region) => ({ hubId: region.hubId, label: region.place || region.title }));
  const openRun = regions.find((run) => run.hubId === openId) ?? null;
  const interacting = regions.filter((run) => run.interacting).length;
  const quiet = regions.length - interacting;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cyan-300/80">Runs</p>
          <p className="mt-1 text-sm text-zinc-500">
            {settings.enabled ? "Live" : "Paused"}
            {regions.length > 0 ? ` · ${interacting} interacting · ${quiet} quiet` : " · no regions with groups yet"}
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
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:overflow-x-auto sm:pb-1">
        {regions.length === 0 ? <p className="px-1 py-3 text-sm text-zinc-500">Add prop accounts to a group to put its region in a run.</p> : null}
        {regions.map((region) => {
          const included = region.groups.filter((group) => group.included);
          const issueCount = runIssueCount(region.snapshot, settings, used, cap, region.timeZone);
          const objective = region.objective.trim() || "No objective yet";
          return (
            <button
              key={region.hubId || "none"}
              type="button"
              onClick={() => setOpenId(region.hubId)}
              className="flex w-full shrink-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 text-left transition hover:border-cyan-400/40 sm:w-80"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${region.interacting ? "bg-cyan-400" : "bg-zinc-600"}`} />
                  <span className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">{region.title}</span>
                </span>
                {region.paused ? (
                  <span className="shrink-0 rounded-full border border-zinc-600 px-2 py-0.5 text-[11px] text-zinc-300">Paused</span>
                ) : region.interacting ? (
                  <span className="shrink-0 rounded-full border border-cyan-400/40 px-2 py-0.5 text-[11px] text-cyan-100">
                    Interacting
                  </span>
                ) : issueCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-100">
                    {issueCount} {issueCount === 1 ? "issue" : "issues"}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-zinc-500">Quiet</span>
                )}
              </span>
              <span className="mt-3 line-clamp-3 text-sm font-medium text-zinc-50">{objective}</span>
              <span className="mt-3 line-clamp-2 text-xs text-zinc-400">
                {included.length > 0 ? included.map((group) => group.title).join(" · ") : "No groups included"}
              </span>
              <span className="mt-3 text-xs text-zinc-500">
                {included.length} {included.length === 1 ? "group" : "groups"} · {region.accounts.length}{" "}
                {region.accounts.length === 1 ? "account" : "accounts"}
              </span>
            </button>
          );
        })}
      </div>
      {openRun ? (
        <RunScreen
          region={openRun}
          personas={personas}
          settings={settings}
          used={used}
          cap={cap}
          busy={busy}
          onRefresh={onRefresh}
          onSendNow={onSendNow}
          onSkip={onSkip}
          onEditLine={onEditLine}
          onDeleteLine={onDeleteLine}
          onSetAutomatic={onSetAutomatic}
          onSaveRules={onSaveRules}
          onSaveSwear={onSaveSwear}
          onSaveGrammar={onSaveGrammar}
          onSaveAbbrev={onSaveAbbrev}
          onSaveWeek={onSaveWeek}
          onAddToday={onAddToday}
          onSaveObjective={onSaveObjective}
          onSaveLocale={onSaveLocale}
          onToggleGroup={onToggleGroup}
          onToggleAccount={onToggleAccount}
          onSaveVoice={onSaveVoice}
          onSaveHome={onSaveHome}
          homeOptions={homeOptions}
          onPause={onPause}
          groups={groups}
          onAddAccounts={onAddAccounts}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </section>
  );
}

function runIssueCount(run: ConversationActiveRun, settings: ConversationSettings, used: number, cap: number, zone: string) {
  return runIssues(run, settings, used, cap, zone).length;
}

function runIssues(run: ConversationActiveRun, settings: ConversationSettings, used: number, cap: number, zone: string) {
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
    ...(!withinActiveHours(settings.activeStartHour, settings.activeEndHour, hourIn(zone)) && waiting
      ? ["Outside the hours it is allowed to send."]
      : []),
    ...new Set(run.lines.map((line) => line.error).filter((error): error is string => Boolean(error))),
  ];
}

type LineFilter = "all" | "today" | "pending" | "done" | "failed";

const LINE_FILTERS: Array<{ id: LineFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "pending", label: "Waiting" },
  { id: "done", label: "Sent" },
  { id: "failed", label: "Failed" },
];

function isNyToday(iso: string): boolean {
  return nyDateKey(new Date(iso)) === nyDateKey();
}

function isWaitingLine(status: ConversationActiveRun["lines"][number]["status"]): boolean {
  return status === "pending" || status === "running";
}

function waitingDayLabel(iso: string): string {
  if (isNyToday(iso)) return "Today";
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

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

type RunTab = "overview" | "groups" | "accounts" | "conversations" | "analytics" | "settings";

const RUN_TABS: Array<{ id: RunTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "groups", label: "Groups" },
  { id: "accounts", label: "Accounts" },
  { id: "conversations", label: "Conversations" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

function nyHour(iso: string): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" })
    .formatToParts(new Date(iso))
    .find((item) => item.type === "hour");
  const hour = Number(part?.value ?? "0");
  return Number.isFinite(hour) ? hour : 0;
}

function shortHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12a";
  if (hour === 12) return "12p";
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
}

function buildRunAnalytics(region: RegionRun) {
  const lines = region.snapshot.lines.filter((line) => line.status !== "skipped");
  const sentLines = lines.filter((line) => line.status === "done");
  const included = region.accounts.filter((account) => account.included);
  const jumped = included.filter((account) => account.moment?.decision === "jumped_in").length;
  const stayed = included.filter((account) => account.moment?.decision === "stayed_out").length;
  const byGroup = new Map<string, { title: string; sent: number; waiting: number; waitingLater: number; failed: number }>();
  for (const group of region.groups) {
    if (!group.included) continue;
    byGroup.set(group.title, { title: group.title, sent: 0, waiting: 0, waitingLater: 0, failed: 0 });
  }
  for (const line of lines) {
    const title = line.groupTitle || "Group";
    const row = byGroup.get(title) ?? { title, sent: 0, waiting: 0, waitingLater: 0, failed: 0 };
    if (line.status === "done") row.sent += 1;
    else if (line.status === "failed") row.failed += 1;
    else if (line.status === "pending" || line.status === "running") {
      if (isNyToday(line.runAt)) row.waiting += 1;
      else row.waitingLater += 1;
    }
    byGroup.set(title, row);
  }
  const byAccount = new Map<string, { id: string; name: string; sent: number }>();
  for (const line of sentLines) {
    const row = byAccount.get(line.authorId) ?? { id: line.authorId, name: line.authorName, sent: 0 };
    row.sent += 1;
    byAccount.set(line.authorId, row);
  }
  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const line of sentLines) hourCounts[nyHour(line.runAt)] += 1;
  const activeHours = hourCounts.map((sent, hour) => ({ hour, sent })).filter((item) => item.sent > 0);
  const first = activeHours[0]?.hour ?? 0;
  const last = activeHours.at(-1)?.hour ?? first;
  const hours =
    activeHours.length === 0
      ? []
      : hourCounts.slice(first, last + 1).map((sent, index) => ({ hour: first + index, label: shortHour(first + index), sent }));
  return {
    sent: sentLines.length,
    posts: sentLines.filter((line) => line.kind === "start_post").length,
    replies: sentLines.filter((line) => line.kind === "reply").length,
    failed: lines.filter((line) => line.status === "failed").length,
    waiting: lines.filter((line) => (line.status === "pending" || line.status === "running") && isNyToday(line.runAt)).length,
    waitingLater: lines.filter((line) => (line.status === "pending" || line.status === "running") && !isNyToday(line.runAt)).length,
    jumped,
    stayed,
    undecided: included.length - jumped - stayed,
    included: included.length,
    groups: [...byGroup.values()].sort((a, b) => b.sent - a.sent || a.title.localeCompare(b.title)),
    speakers: [...byAccount.values()].sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name)).slice(0, 8),
    hours,
  };
}

function RunScreen({
  region,
  personas,
  settings,
  used,
  cap,
  busy,
  onRefresh,
  onSendNow,
  onSkip,
  onEditLine,
  onDeleteLine,
  onSetAutomatic,
  onSaveRules,
  onSaveSwear,
  onSaveGrammar,
  onSaveAbbrev,
  onSaveWeek,
  onAddToday,
  onSaveObjective,
  onSaveLocale,
  onToggleGroup,
  onToggleAccount,
  onSaveVoice,
  onSaveHome,
  homeOptions,
  onPause,
  groups,
  onAddAccounts,
  onClose,
}: {
  region: RegionRun;
  personas: ConversationPersona[];
  settings: ConversationSettings;
  used: number;
  cap: number;
  busy: boolean;
  onRefresh: () => void;
  onSendNow: (jobId: string) => void;
  onSkip: (jobId: string) => void;
  onEditLine: (jobId: string, body: string) => void;
  onDeleteLine: (jobId: string) => void;
  onSetAutomatic: (groupIds: string[], automatic: boolean, postsPerDay: number) => void;
  onSaveRules: (groupIds: string[], rules: string[]) => void;
  onSaveSwear: (groupIds: string[], swear: boolean, swearRate: SwearRate) => void;
  onSaveGrammar: (groupIds: string[], grammar: number) => void;
  onSaveAbbrev: (groupIds: string[], abbrev: number) => void;
  onSaveWeek: (groupIds: string[], input: { days: number; startHour: number; endHour: number; everyMinutes: number; callsPerDay: number }) => void;
  onAddToday: (groupIds: string[]) => void;
  onSaveObjective: (hubId: string, objective: string) => void;
  onSaveLocale: (hubId: string, locale: { timeZone: string; language: string }) => void;
  onToggleGroup: (groupId: string, included: boolean) => void;
  onToggleAccount: (hubId: string, userId: string, included: boolean) => void;
  onSaveVoice: (userId: string, voice: PropVoice) => void;
  onSaveHome: (userId: string, input: { hubId: string | null; languages: string[] }) => void;
  homeOptions: Array<{ hubId: string; label: string }>;
  onPause: (hubId: string, paused: boolean) => void;
  groups: ConversationGroup[];
  onAddAccounts: (groupId: string, userIds: string[]) => void;
  onClose: () => void;
}) {
  const run = region.snapshot;
  const includedIds = region.groups.filter((group) => group.included).map((group) => group.groupId);
  const [filter, setFilter] = useState<LineFilter>("all");
  const [rules, setRules] = useState(() => editableRunRules(run.rules));
  const [noHyphens, setNoHyphens] = useState(() => forbidsHyphens(run.rules));
  const [advanced, setAdvanced] = useState(false);
  const [swear, setSwear] = useState(run.swear);
  const [swearRate, setSwearRate] = useState<SwearRate>(run.swearRate);
  const [grammar, setGrammar] = useState(run.grammar);
  const [abbrev, setAbbrev] = useState(run.abbrev);
  const [weekOn, setWeekOn] = useState(run.weekDays > 0);
  const [weekDays, setWeekDays] = useState(run.weekDays > 0 ? run.weekDays : 127);
  const [weekStart, setWeekStart] = useState(run.weekStartHour);
  const [weekEnd, setWeekEnd] = useState(run.weekEndHour);
  const [weekEveryHours, setWeekEveryHours] = useState(Math.max(1, Math.round(run.weekEveryMinutes / 60)));
  const [callsPerDay, setCallsPerDay] = useState(run.callsPerDay);
  const savedRules = run.rules.join("\n");
  const [postsPerDay, setPostsPerDay] = useState(String(Math.max(1, run.postsPerDay || 4)));
  const postsPerDayValue = Math.min(20, Math.max(1, Number(postsPerDay) || 1));
  const [mounted, setMounted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [objective, setObjective] = useState(region.objective);
  const [timeZone, setTimeZone] = useState(region.timeZone);
  const [language, setLanguage] = useState(region.language);
  const [openVoiceId, setOpenVoiceId] = useState<string | null>(null);
  const [tab, setTab] = useState<RunTab>("overview");
  const [rosterGroupId, setRosterGroupId] = useState("");
  const [rosterFocus, setRosterFocus] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"one" | "bulk" | null>(null);
  const [addQuery, setAddQuery] = useState("");
  const [bulkIds, setBulkIds] = useState<string[]>([]);

  useEffect(() => {
    setObjective(region.objective);
  }, [region.hubId, region.objective]);

  useEffect(() => {
    setTimeZone(region.timeZone);
    setLanguage(region.language);
  }, [region.hubId, region.timeZone, region.language]);

  useEffect(() => {
    setTab("overview");
    setRosterGroupId("");
    setRosterFocus(null);
    setAddMode(null);
    setAddQuery("");
    setBulkIds([]);
  }, [region.hubId]);

  useEffect(() => {
    const parsed = savedRules.length > 0 ? savedRules.split("\n") : [];
    setRules(editableRunRules(parsed));
    setNoHyphens(forbidsHyphens(parsed));
  }, [run.groupId, savedRules]);

  useEffect(() => {
    setSwear(run.swear);
    setSwearRate(run.swearRate);
  }, [run.groupId, run.swear, run.swearRate]);

  useEffect(() => {
    setGrammar(run.grammar);
  }, [run.groupId, run.grammar]);

  useEffect(() => {
    setAbbrev(run.abbrev);
  }, [run.groupId, run.abbrev]);

  useEffect(() => {
    setWeekOn(run.weekDays > 0);
    setWeekDays(run.weekDays > 0 ? run.weekDays : 127);
    setWeekStart(run.weekStartHour);
    setWeekEnd(run.weekEndHour);
    setWeekEveryHours(Math.max(1, Math.round(run.weekEveryMinutes / 60)));
    setCallsPerDay(run.callsPerDay);
  }, [run.groupId, run.weekDays, run.weekStartHour, run.weekEndHour, run.weekEveryMinutes, run.callsPerDay]);

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
      if (event.key !== "Escape") return;
      if (editingId) {
        setEditingId(null);
        setConfirmDelete(false);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, onClose]);

  const personaById = useMemo(() => new Map(personas.map((persona) => [persona.userId, persona])), [personas]);
  const issues = runIssues(run, settings, used, cap, region.timeZone);
  const topic = splitRunTopic(run.topic);
  const inHours = withinActiveHours(settings.activeStartHour, settings.activeEndHour, hourIn(region.timeZone));
  const hasWork = run.waiting + run.running > 0;
  const status =
    issues.length > 0 || run.failed > 0
      ? { label: "Needs attention", dot: "bg-amber-300", text: "text-amber-100", ring: "border-amber-300/40" }
      : hasWork
        ? { label: "Running", dot: "bg-cyan-400", text: "text-cyan-100", ring: "border-cyan-400/40" }
        : { label: "Done", dot: "bg-emerald-400", text: "text-emerald-100", ring: "border-emerald-400/40" };

  const counts: Record<LineFilter, number> = {
    all: run.lines.length,
    today: run.lines.filter((line) => isWaitingLine(line.status) && isNyToday(line.runAt)).length,
    pending: run.lines.filter((line) => isWaitingLine(line.status)).length,
    done: run.sent,
    failed: run.failed,
  };
  const visibleLines = run.lines.filter((line) => {
    if (filter === "all") return true;
    if (filter === "today") return isWaitingLine(line.status) && isNyToday(line.runAt);
    if (filter === "pending") return isWaitingLine(line.status);
    return line.status === filter;
  });
  const includedGroupOptions = region.groups.filter((group) => group.included);
  const rosterGroup =
    groups.find((group) => group.id === rosterGroupId) ??
    groups.find((group) => group.id === includedGroupOptions[0]?.groupId) ??
    null;
  const rosterMembers = rosterGroup?.members ?? [];
  const rosterMemberIds = new Set(rosterMembers.map((member) => member.userId));
  const addQueryText = addQuery.trim().toLowerCase();
  const addCandidates = personas.filter((persona) => {
    if (rosterMemberIds.has(persona.userId)) return false;
    if (!addQueryText) return true;
    return persona.name.toLowerCase().includes(addQueryText) || (persona.username ?? "").toLowerCase().includes(addQueryText);
  });
  const conversationLines = visibleLines.filter((line) => {
    if (!rosterFocus) return true;
    if (line.authorId !== rosterFocus) return false;
    return !rosterGroup || line.groupTitle === rosterGroup.title;
  });
  const orderedConversationLines =
    filter === "pending" || filter === "today"
      ? [...conversationLines].sort((a, b) => a.runAt.localeCompare(b.runAt))
      : conversationLines;

  useEffect(() => {
    if (!rosterFocus) return;
    document.getElementById(`run-roster-${rosterFocus}`)?.scrollIntoView({ block: "nearest" });
  }, [rosterFocus]);
  const includedAccounts = region.accounts.filter((account) => account.included);
  const conversationSnippets = [...run.lines]
    .filter((line) => line.body.trim() && line.status !== "skipped")
    .sort((a, b) => b.runAt.localeCompare(a.runAt))
    .slice(0, 4);
  const liveLines = [...run.lines]
    .filter((line) => line.status !== "skipped")
    .sort((a, b) => {
      const rank = (status: typeof a.status) => (status === "running" ? 0 : status === "pending" ? 1 : status === "failed" ? 2 : 3);
      const diff = rank(a.status) - rank(b.status);
      if (diff !== 0) return diff;
      return a.status === "pending" || a.status === "running" ? a.runAt.localeCompare(b.runAt) : b.runAt.localeCompare(a.runAt);
    })
    .slice(0, 12);
  const overviewAnalytics = buildRunAnalytics(region);
  const overviewHourMax = Math.max(1, ...overviewAnalytics.hours.map((hour) => hour.sent));
  const capPct = cap === 0 ? 100 : Math.min(100, Math.round((used / cap) * 100));

  if (!mounted) return null;

  return createPortal(
    <div
      className="dashboard-tech fixed inset-0 z-[60] isolate bg-[#06090e] text-zinc-50"
      style={{ backgroundColor: "#06090e" }}
      role="dialog"
      aria-modal="true"
      aria-label={region.objective.trim() || "No objective yet"}
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
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
              {region.title} · {region.paused ? "Paused" : region.interacting ? "Interacting" : "Quiet"}
            </p>
            <h2 className="truncate text-base font-semibold text-zinc-50 sm:text-lg">{region.objective.trim() || "No objective yet"}</h2>
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

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav aria-label="Run sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-800 bg-[#06090e] px-3 py-2 md:w-56 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-4">
            {RUN_TABS.map((item) => {
              const selected = tab === item.id;
              const count =
                item.id === "groups"
                  ? region.groups.filter((group) => group.included).length
                  : item.id === "accounts"
                    ? region.accounts.filter((account) => account.included).length
                    : item.id === "conversations"
                      ? run.lines.length
                      : item.id === "analytics"
                        ? run.sent
                        : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => setTab(item.id)}
                  className={`flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm md:w-full ${
                    selected ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                  }`}
                >
                  <span>{item.label}</span>
                  {count != null ? <span className="text-xs tabular-nums text-zinc-500">{count}</span> : null}
                </button>
              );
            })}
          </nav>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-8">
          <div className={`mx-auto flex flex-col gap-6 ${tab === "overview" || tab === "conversations" ? "max-w-6xl" : "max-w-5xl"}`}>
            {tab === "overview" ? (
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
              <div>
                <h3 className="text-sm font-semibold text-zinc-50">{region.paused ? "Paused" : "Running"}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {region.paused ? "Nothing new goes out until you resume." : "This run can post and reply."}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || !region.hubId}
                onClick={() => onPause(region.hubId, !region.paused)}
                className={`rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  region.paused ? "bg-cyan-400 text-zinc-950" : "border border-zinc-600 text-zinc-100"
                }`}
              >
                {region.paused ? "Resume" : "Pause"}
              </button>
            </section>
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-zinc-50">Analytics</h3>
                <button type="button" onClick={() => setTab("analytics")} className="text-xs text-cyan-200">
                  Open
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-zinc-500">Sent</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{overviewAnalytics.sent}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {overviewAnalytics.posts} posts · {overviewAnalytics.replies} replies
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Waiting today</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{overviewAnalytics.waiting}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {overviewAnalytics.waitingLater > 0
                      ? `${overviewAnalytics.waitingLater} later this week`
                      : "scheduled or sending"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Failed</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{overviewAnalytics.failed}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{overviewAnalytics.failed > 0 ? "see Conversations" : "none so far"}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Jumped in</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{overviewAnalytics.jumped}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {overviewAnalytics.included === 0 ? "no accounts included" : `of ${overviewAnalytics.included} included`}
                  </p>
                </div>
              </div>
              {overviewAnalytics.hours.length > 0 ? (
                <div className="mt-4 flex h-8 items-end gap-0.5" aria-hidden>
                  {overviewAnalytics.hours.map((hour) => (
                    <div key={hour.hour} className="flex h-full min-w-0 flex-1 items-end">
                      <div
                        className={`w-full rounded-sm ${hour.sent === 0 ? "bg-zinc-800" : "bg-cyan-400"}`}
                        style={{ height: `${hour.sent === 0 ? 12 : Math.max(20, (hour.sent / overviewHourMax) * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-xs text-zinc-500">Nothing sent yet today.</p>
              )}
            </section>
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-50">Live activity</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {run.running > 0
                      ? `${run.running} sending now`
                      : run.waiting > 0
                        ? `${counts.today} waiting today${run.waiting > counts.today ? ` · ${run.waiting - counts.today} later` : ""}`
                        : run.sent > 0
                          ? `${run.sent} sent`
                          : "Quiet right now"}
                  </p>
                </div>
                <button type="button" onClick={() => setTab("conversations")} className="text-xs text-cyan-200">
                  Open
                </button>
              </div>
              {liveLines.length === 0 ? (
                <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
                  Nothing happening yet.
                </p>
              ) : (
                <ol className="mt-4 flex flex-col gap-3">
                  {liveLines.map((line) => {
                    const persona = personaById.get(line.authorId);
                    const waiting = line.status === "pending";
                    return (
                      <li
                        key={line.id}
                        className={`flex gap-3 rounded-2xl border px-3 py-3 ${
                          line.status === "failed" ? "border-amber-300/30" : "border-zinc-800"
                        } ${line.kind === "reply" ? "ml-4" : ""}`}
                      >
                        <PersonaAvatar name={line.authorName} avatarUrl={persona?.avatarUrl ?? null} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-medium text-zinc-100">{line.authorName}</span>
                            {line.groupTitle ? <span className="truncate text-xs text-zinc-500">{line.groupTitle}</span> : null}
                            <span className="rounded-md border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                              {line.kind === "reply" ? "Reply" : "Post"}
                            </span>
                            <LineBadge status={line.status} />
                            <span className="ml-auto text-xs text-zinc-500">
                              {formatWhen(line.runAt)}
                              {waiting ? ` · ${minutesUntil(line.runAt)}` : ""}
                            </span>
                          </div>
                          {line.body.trim() ? (
                            <p className="mt-1.5 text-sm leading-6 text-zinc-300">{line.body}</p>
                          ) : (
                            <p className="mt-1.5 text-sm italic text-zinc-500">Waiting to be written.</p>
                          )}
                          {line.status === "failed" && line.error ? <p className="mt-1 text-xs text-amber-200/90">{line.error}</p> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
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
            </div>
            <aside className="xl:sticky xl:top-0">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-zinc-50">Accounts</h3>
                  <button type="button" onClick={() => setTab("accounts")} className="text-xs text-cyan-200">
                    {includedAccounts.length}
                  </button>
                </div>
                {includedAccounts.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500">No accounts included.</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-3">
                    {includedAccounts.slice(0, 8).map((account) => {
                      const persona = personaById.get(account.userId);
                      return (
                        <li key={account.userId} className="flex items-center gap-2">
                          <PersonaAvatar name={account.name} avatarUrl={persona?.avatarUrl ?? null} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm text-zinc-100">{account.name}</p>
                            <p className="truncate text-xs text-zinc-500">
                              {account.moment?.decision === "jumped_in"
                                ? "Jumped in"
                                : account.moment?.decision === "stayed_out"
                                  ? "Stayed out"
                                  : account.pace}
                              {account.lastSpokeAt ? ` · ${formatWhen(account.lastSpokeAt)}` : ""}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {includedAccounts.length > 8 ? (
                  <button type="button" onClick={() => setTab("accounts")} className="mt-3 text-xs text-cyan-200">
                    See all {includedAccounts.length}
                  </button>
                ) : null}
                <div className="mt-5 border-t border-zinc-800 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-50">Conversations</h3>
                    <button type="button" onClick={() => setTab("conversations")} className="text-xs text-cyan-200">
                      Open
                    </button>
                  </div>
                  {conversationSnippets.length === 0 ? (
                    <p className="mt-3 text-sm text-zinc-500">No conversation yet.</p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-4">
                      {conversationSnippets.map((line) => (
                        <li key={line.id}>
                          <button type="button" onClick={() => setTab("conversations")} className="w-full text-left">
                            <p className="truncate text-xs text-zinc-500">
                              <span className="text-zinc-200">{line.authorName}</span>
                              {line.groupTitle ? ` · ${line.groupTitle}` : ""}
                            </p>
                            <p className="mt-1 line-clamp-3 text-sm leading-5 text-zinc-300">{line.body}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </aside>
            </div>
            ) : null}
            {tab === "groups" ? (
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="text-sm font-semibold text-zinc-50">Groups</h3>
              <p className="mt-1 text-xs text-zinc-500">Included groups take part in this run. Settings apply to every included group.</p>
              <ul className="mt-4 flex flex-col gap-2">
                {region.groups.map((group) => (
                  <li key={group.groupId} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{group.title}</p>
                      <p className="text-xs text-zinc-500">
                        {group.interacting ? "Interacting" : "Quiet"} · {group.propMemberCount}{" "}
                        {group.propMemberCount === 1 ? "account" : "accounts"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onToggleGroup(group.groupId, !group.included)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                        group.included ? "border-cyan-400/40 text-cyan-100" : "border-zinc-700 text-zinc-400"
                      }`}
                    >
                      {group.included ? "Included" : "Left out"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            ) : null}
            {tab === "accounts" ? (
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="text-sm font-semibold text-zinc-50">Prop accounts</h3>
              <p className="mt-1 text-xs text-zinc-500">Include or leave out each account, and set how that account behaves.</p>
              {region.accounts.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No prop accounts in these groups.</p> : null}
              <ul className="mt-4 flex flex-col gap-2">
                {region.accounts.map((account) => {
                  const persona = personaById.get(account.userId);
                  const open = openVoiceId === account.userId;
                  return (
                    <li key={account.userId} className="rounded-2xl border border-zinc-800 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
                            {account.name}
                            {account.visitorFrom ? (
                              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-normal text-amber-100">
                                Visitor from {account.visitorFrom}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">{account.groupTitles.join(" · ")}</p>
                          <AccountHome
                            key={`${account.userId}:${account.home?.hubId ?? ""}:${account.home?.languages.join(",") ?? ""}`}
                            account={account}
                            options={homeOptions}
                            disabled={busy}
                            onSave={(input) => onSaveHome(account.userId, input)}
                          />
                        </div>
                        <button
                          type="button"
                          disabled={busy || !region.hubId}
                          onClick={() => onToggleAccount(region.hubId, account.userId, !account.included)}
                          className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                            account.included ? "border-cyan-400/40 text-cyan-100" : "border-zinc-700 text-zinc-400"
                          }`}
                        >
                          {account.included ? "Included" : "Left out"}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-cyan-200/90">
                        {account.moment?.decision === "jumped_in"
                          ? "Jumped in"
                          : account.moment?.decision === "stayed_out"
                            ? "Stayed out"
                            : "No decision yet"}
                      </p>
                      {account.moment?.subject ? <p className="mt-1 text-sm text-zinc-300">{account.moment.subject}</p> : null}
                      <p className="mt-1 text-xs text-zinc-500">
                        {account.pace}
                        {account.lastSpokeAt ? ` · last spoke ${formatWhen(account.lastSpokeAt)}` : " · has not spoken today"}
                        {persona?.personality.trim() ? ` · ${persona.personality.trim()}` : ""}
                      </p>
                      <button
                        type="button"
                        onClick={() => setOpenVoiceId(open ? null : account.userId)}
                        className="mt-2 text-xs text-cyan-200/90"
                      >
                        {open ? "Hide personality" : "Personality"}
                      </button>
                      {open && persona ? (
                        <AccountVoice
                          persona={persona}
                          disabled={busy}
                          onSave={(voice) => onSaveVoice(account.userId, voice)}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
            ) : null}

            {tab === "conversations" ? (
              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
              <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-sm font-semibold text-zinc-50">Conversations</h3>
                    <button
                      type="button"
                      disabled={busy || region.paused || includedIds.length === 0}
                      onClick={() => {
                        setFilter("today");
                        onAddToday(includedIds);
                      }}
                      className="rounded-xl border border-cyan-400/30 px-3 py-1.5 text-xs text-cyan-100 disabled:opacity-50"
                    >
                      Add a post today
                    </button>
                  </div>
                  <div className="flex w-full flex-wrap rounded-xl border border-zinc-800 p-0.5 sm:w-auto">
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

                {orderedConversationLines.length === 0 ? (
                  <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
                    {rosterFocus
                      ? "This account has no lines in this conversation."
                      : filter === "today"
                        ? "Nothing waiting today."
                        : filter === "pending"
                          ? "Nothing waiting this week."
                          : "Nothing here."}
                  </p>
                ) : (
                  <ol className="mt-4 flex flex-col gap-3">
                    {filter === "pending" &&
                    orderedConversationLines.some((line) => isNyToday(line.runAt)) &&
                    orderedConversationLines.some((line) => !isNyToday(line.runAt)) ? (
                      <li className="text-xs text-zinc-500">Today is first. Later days are the rest of this week.</li>
                    ) : null}
                    {orderedConversationLines.map((line, index) => {
                      const persona = personaById.get(line.authorId);
                      const waiting = line.status === "pending";
                      const removed = line.status === "skipped" && line.error === "Removed";
                      const day = filter === "pending" ? nyDateKey(new Date(line.runAt)) : null;
                      const previousDay =
                        filter === "pending" && index > 0
                          ? nyDateKey(new Date(orderedConversationLines[index - 1].runAt))
                          : null;
                      const dayLabel = day && day !== previousDay ? waitingDayLabel(line.runAt) : null;
                      return (
                        <Fragment key={line.id}>
                          {dayLabel ? (
                            <li className="pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                              {dayLabel}
                              <span className="ml-2 tabular-nums font-normal normal-case tracking-normal text-zinc-500">
                                {orderedConversationLines.filter((item) => nyDateKey(new Date(item.runAt)) === day).length}
                              </span>
                            </li>
                          ) : null}
                        <li
                          className={`flex gap-3 rounded-2xl border px-4 py-3 ${
                            line.status === "failed" ? "border-amber-300/30" : "border-zinc-800"
                          } ${line.kind === "reply" ? "sm:ml-8" : ""}`}
                        >
                          <PersonaAvatar name={line.authorName} avatarUrl={persona?.avatarUrl ?? null} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-medium text-zinc-100">{line.authorName}</span>
                              {line.groupTitle ? <span className="text-xs text-zinc-500">{line.groupTitle}</span> : null}
                              <span className="rounded-md border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                                {line.kind === "reply" ? "Reply" : "Post"}
                              </span>
                              <LineBadge status={line.status} />
                              <span className="ml-auto text-xs text-zinc-500">
                                {formatWhen(line.runAt)}
                                {waiting ? ` · ${minutesUntil(line.runAt)}` : ""}
                              </span>
                            </div>
                            {removed ? (
                              <p className="mt-1.5 text-sm italic text-zinc-500">Deleted from the group.</p>
                            ) : editingId === line.id ? (
                              <form
                                className="mt-2"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  onEditLine(line.id, draft);
                                  setEditingId(null);
                                  setConfirmDelete(false);
                                }}
                              >
                                <textarea
                                  value={draft}
                                  onChange={(event) => setDraft(event.target.value)}
                                  rows={3}
                                  className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-cyan-400"
                                />
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="submit"
                                    disabled={busy || !draft.trim()}
                                    className="rounded-xl border border-cyan-400/30 px-3 py-1.5 text-xs text-cyan-100 disabled:opacity-50"
                                  >
                                    Update
                                  </button>
                                  {confirmDelete ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => {
                                        onDeleteLine(line.id);
                                        setEditingId(null);
                                        setConfirmDelete(false);
                                      }}
                                      className="rounded-xl border border-rose-400/40 px-3 py-1.5 text-xs text-rose-100 disabled:opacity-50"
                                    >
                                      Confirm delete
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => setConfirmDelete(true)}
                                      className="rounded-xl border border-rose-400/40 px-3 py-1.5 text-xs text-rose-100 disabled:opacity-50"
                                    >
                                      Delete
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setEditingId(null);
                                      setConfirmDelete(false);
                                    }}
                                    className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : line.body ? (
                              <>
                                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-zinc-100">{line.body}</p>
                                {line.status === "done" ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setEditingId(line.id);
                                      setDraft(line.body);
                                      setConfirmDelete(false);
                                    }}
                                    className="mt-2 rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 disabled:opacity-50"
                                  >
                                    Edit
                                  </button>
                                ) : null}
                              </>
                            ) : (
                              <p className="mt-1.5 text-sm italic text-zinc-500">
                                {line.status === "failed" ? "Nothing was published." : "Written when it sends."}
                              </p>
                            )}
                            {line.error && !removed ? <p className="mt-1.5 text-xs text-amber-200/90">{line.error}</p> : null}
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
                        </Fragment>
                      );
                    })}
                  </ol>
                )}
              </section>
              <aside className="flex max-h-[calc(100vh-8rem)] flex-col rounded-3xl border border-zinc-800 bg-zinc-900 xl:sticky xl:top-0">
                <div className="shrink-0 border-b border-zinc-800 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-50">Accounts</h3>
                    <span className="text-xs tabular-nums text-zinc-500">{rosterMembers.length}</span>
                  </div>
                  {includedGroupOptions.length > 1 ? (
                    <select
                      value={rosterGroup?.id ?? ""}
                      disabled={busy}
                      onChange={(event) => {
                        setRosterGroupId(event.target.value);
                        setRosterFocus(null);
                        setAddMode(null);
                        setBulkIds([]);
                      }}
                      className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50 disabled:opacity-50"
                    >
                      {includedGroupOptions.map((group) => (
                        <option key={group.groupId} value={group.groupId}>
                          {group.title}
                        </option>
                      ))}
                    </select>
                  ) : rosterGroup ? (
                    <p className="mt-1 truncate text-xs text-zinc-500">{rosterGroup.title}</p>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">Include a group first.</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !rosterGroup}
                      onClick={() => {
                        setAddMode((mode) => (mode === "one" ? null : "one"));
                        setAddQuery("");
                        setBulkIds([]);
                      }}
                      className={`flex-1 rounded-xl border px-2 py-1.5 text-xs disabled:opacity-50 ${
                        addMode === "one" ? "border-cyan-400/50 text-cyan-100" : "border-zinc-700 text-zinc-200"
                      }`}
                    >
                      Add one
                    </button>
                    <button
                      type="button"
                      disabled={busy || !rosterGroup}
                      onClick={() => {
                        setAddMode((mode) => (mode === "bulk" ? null : "bulk"));
                        setAddQuery("");
                        setBulkIds([]);
                      }}
                      className={`flex-1 rounded-xl border px-2 py-1.5 text-xs disabled:opacity-50 ${
                        addMode === "bulk" ? "border-cyan-400/50 text-cyan-100" : "border-zinc-700 text-zinc-200"
                      }`}
                    >
                      Add several
                    </button>
                  </div>
                </div>
                {addMode && rosterGroup ? (
                  <div className="shrink-0 border-b border-zinc-800 p-3">
                    <input
                      value={addQuery}
                      onChange={(event) => setAddQuery(event.target.value)}
                      placeholder="Search prop accounts"
                      className={inputCls}
                    />
                    <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-auto">
                      {addCandidates.length === 0 ? (
                        <li className="px-1 py-2 text-xs text-zinc-500">No accounts left to add.</li>
                      ) : (
                        addCandidates.slice(0, 40).map((persona) => (
                          <li key={persona.userId}>
                            {addMode === "one" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => onAddAccounts(rosterGroup.id, [persona.userId])}
                                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                              >
                                <PersonaAvatar name={persona.name} avatarUrl={persona.avatarUrl} size="sm" />
                                <span className="truncate">{persona.name}</span>
                              </button>
                            ) : (
                              <label className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800">
                                <input
                                  type="checkbox"
                                  checked={bulkIds.includes(persona.userId)}
                                  disabled={busy}
                                  onChange={(event) =>
                                    setBulkIds((current) =>
                                      event.target.checked
                                        ? [...current, persona.userId]
                                        : current.filter((id) => id !== persona.userId),
                                    )
                                  }
                                  className="h-4 w-4 accent-cyan-400"
                                />
                                <span className="truncate">{persona.name}</span>
                              </label>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                    {addMode === "bulk" ? (
                      <button
                        type="button"
                        disabled={busy || bulkIds.length === 0}
                        onClick={() => {
                          onAddAccounts(rosterGroup.id, bulkIds);
                          setBulkIds([]);
                          setAddMode(null);
                          setAddQuery("");
                        }}
                        className="mt-2 w-full rounded-xl border border-cyan-400/30 px-3 py-1.5 text-xs text-cyan-100 disabled:opacity-50"
                      >
                        Add {bulkIds.length === 0 ? "selected" : bulkIds.length}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-auto p-2">
                  <button
                    type="button"
                    onClick={() => setRosterFocus(null)}
                    className={`mb-1 w-full rounded-xl px-3 py-2 text-left text-sm ${
                      rosterFocus === null ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    All accounts
                  </button>
                  {rosterMembers.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-zinc-500">No prop accounts in this conversation.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {rosterMembers.map((member) => {
                        const persona = personaById.get(member.userId);
                        const selected = rosterFocus === member.userId;
                        return (
                          <li key={member.userId}>
                            <button
                              id={`run-roster-${member.userId}`}
                              type="button"
                              onClick={() => setRosterFocus(member.userId)}
                              className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left ${
                                selected ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-200 hover:bg-zinc-800"
                              }`}
                            >
                              <PersonaAvatar name={member.name} avatarUrl={persona?.avatarUrl ?? null} size="sm" />
                              <span className="min-w-0">
                                <span className="block truncate text-sm">{member.name}</span>
                                {member.username ? <span className="block truncate text-[11px] text-zinc-500">@{member.username}</span> : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800 p-3">
                  <button
                    type="button"
                    disabled={rosterMembers.length === 0}
                    aria-label="Previous account"
                    onClick={() => {
                      if (rosterMembers.length === 0) return;
                      const index = rosterFocus ? rosterMembers.findIndex((member) => member.userId === rosterFocus) : 0;
                      const next = (index - 1 + rosterMembers.length) % rosterMembers.length;
                      setRosterFocus(rosterMembers[next]?.userId ?? null);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-700 text-zinc-200 disabled:opacity-50"
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  </button>
                  <p className="min-w-0 truncate text-xs text-zinc-500">
                    {rosterFocus
                      ? rosterMembers.find((member) => member.userId === rosterFocus)?.name ?? "Account"
                      : "All accounts"}
                  </p>
                  <button
                    type="button"
                    disabled={rosterMembers.length === 0}
                    aria-label="Next account"
                    onClick={() => {
                      if (rosterMembers.length === 0) return;
                      const index = rosterFocus ? rosterMembers.findIndex((member) => member.userId === rosterFocus) : -1;
                      const next = (index + 1) % rosterMembers.length;
                      setRosterFocus(rosterMembers[next]?.userId ?? null);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-700 text-zinc-200 disabled:opacity-50"
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </aside>
              </div>
            ) : null}

            {tab === "analytics" ? <RunAnalytics region={region} /> : null}

            {tab === "settings" ? (
              <div className="flex flex-col gap-6">
                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <h3 className="text-sm font-semibold text-zinc-50">Objective</h3>
                  <p className="mt-1 text-xs text-zinc-500">The goal for every group in this region. Change it here.</p>
                  <textarea
                    value={objective}
                    disabled={busy || !region.hubId}
                    onChange={(event) => setObjective(event.target.value)}
                    rows={3}
                    placeholder="Create very compelling engagement to boost user conversations"
                    className="mt-3 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-cyan-400/50 disabled:opacity-50"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-zinc-500">
                      {region.hubId ? "Saved on this region." : "This set of groups is not in a region yet."}
                    </p>
                    <button
                      type="button"
                      disabled={busy || !region.hubId || objective.trim() === region.objective.trim()}
                      onClick={() => onSaveObjective(region.hubId, objective)}
                      className="rounded-xl border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50"
                    >
                      Save objective
                    </button>
                  </div>
                </section>
                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <h3 className="text-sm font-semibold text-zinc-50">Local time and language</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {region.place ? `${region.place}. ` : ""}
                    Week hours, active hours, and daily caps count in this time zone. Props write in this language.
                    {region.localeSource === "region" ? " Set on this region." : " Taken from the nearest listed city."}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs text-zinc-400">Time zone</span>
                      <input
                        value={timeZone}
                        disabled={busy || !region.hubId}
                        onChange={(event) => setTimeZone(event.target.value)}
                        placeholder="America/New_York"
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-cyan-400/50 disabled:opacity-50"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-zinc-400">Language</span>
                      <input
                        value={language}
                        disabled={busy || !region.hubId}
                        onChange={(event) => setLanguage(event.target.value)}
                        placeholder="English"
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-cyan-400/50 disabled:opacity-50"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={busy || !region.hubId || (timeZone.trim() === region.timeZone && language.trim() === region.language)}
                    onClick={() => onSaveLocale(region.hubId, { timeZone, language })}
                    className="mt-3 rounded-xl border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50"
                  >
                    Save
                  </button>
                </section>
                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <h3 className="text-sm font-semibold text-zinc-50">Settings</h3>
                  <p className="mt-1 text-xs text-zinc-500">Grammar, abbreviations, rules, cuss words, and the week apply to every included group.</p>
                </section>
                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-50">How grammatically correct should they be?</h3>
                    <p className="shrink-0 text-sm text-cyan-200">{grammarLabel(grammar)}</p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{grammarHint(grammar)}</p>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={grammar}
                    disabled={busy}
                    aria-label="How grammatically correct should they be?"
                    aria-valuetext={grammarLabel(grammar)}
                    onChange={(event) => setGrammar(Number(event.target.value))}
                    className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-cyan-400 disabled:opacity-50"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
                    <span>Messy</span>
                    <span>Correct</span>
                  </div>
                  <button
                    type="button"
                    disabled={busy || grammar === run.grammar}
                    onClick={() => onSaveGrammar(includedIds, grammar)}
                    className="mt-3 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
                  >
                    Save
                  </button>
                </section>

                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-50">How much should they use abbreviations?</h3>
                    <p className="shrink-0 text-sm text-cyan-200">{abbrevLabel(abbrev)}</p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{abbrevHint(abbrev)}</p>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={abbrev}
                    disabled={busy}
                    aria-label="How much should they use abbreviations?"
                    aria-valuetext={abbrevLabel(abbrev)}
                    onChange={(event) => setAbbrev(Number(event.target.value))}
                    className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-cyan-400 disabled:opacity-50"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
                    <span>None</span>
                    <span>Heavy</span>
                  </div>
                  <button
                    type="button"
                    disabled={busy || abbrev === run.abbrev}
                    onClick={() => onSaveAbbrev(includedIds, abbrev)}
                    className="mt-3 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
                  >
                    Save
                  </button>
                </section>

                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <h3 className="text-sm font-semibold text-zinc-50">Rules</h3>
                  <p className="mt-1 text-xs text-zinc-500">The model follows these on every new line in this run.</p>
                  <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                    <p className="text-sm text-zinc-100">Universal rules, always on for every account</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      No hyphens or dashes, no semicolons, lists, or hashtags, one emoji and one exclamation mark at most, and no AI or marketing
                      phrasing. Lines that break them are fixed or rewritten before they post, and dropped after three tries. They override
                      the rules below.
                    </p>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    {rules.map((rule, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <input
                          className={inputCls}
                          aria-label={`Rule ${index + 1}`}
                          maxLength={180}
                          value={rule}
                          onChange={(event) =>
                            setRules((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                          }
                        />
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Remove rule ${index + 1}`}
                          onClick={() => setRules((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          className="shrink-0 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-300 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || rules.length >= 12}
                      onClick={() => setRules((current) => [...current, ""])}
                      className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
                    >
                      Add a rule
                    </button>
                    <button
                      type="button"
                      disabled={busy || serializeRunRules(withNoHyphenRule(rules, noHyphens)) === serializeRunRules(run.rules)}
                      onClick={() => onSaveRules(includedIds, withNoHyphenRule(rules, noHyphens))}
                      className="rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
                    >
                      Save rules
                    </button>
                  </div>
                </section>

                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <button
                    type="button"
                    onClick={() => setAdvanced((value) => !value)}
                    className="flex w-full items-center justify-between text-left"
                    aria-expanded={advanced}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-zinc-50">Advanced options</span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {run.swear ? `Cuss words ${SWEAR_RATES.find((item) => item.id === run.swearRate)?.label.toLowerCase()}` : "Cuss words off"}
                      </span>
                    </span>
                    <span className="text-xs text-cyan-200">{advanced ? "Hide" : "Show"}</span>
                  </button>
                  {advanced ? (
                    <div className="mt-4 border-t border-zinc-800 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-zinc-100">Cuss words</p>
                          <p className="text-xs text-zinc-500">
                            {swear ? "A mild cuss word, on some new lines. No slurs." : "New lines stay clean."}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={swear}
                          aria-label="Allow cuss words"
                          disabled={busy}
                          onClick={() => setSwear((value) => !value)}
                          className={`relative h-7 w-12 shrink-0 rounded-full disabled:opacity-50 ${swear ? "bg-cyan-400" : "bg-zinc-700"}`}
                        >
                          <span className={`absolute top-1 h-5 w-5 rounded-full bg-zinc-950 ${swear ? "left-6" : "left-1"}`} />
                        </button>
                      </div>
                      {swear ? (
                        <div className="mt-3">
                          <p className="text-xs text-zinc-500">Frequency</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {SWEAR_RATES.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                disabled={busy}
                                onClick={() => setSwearRate(item.id)}
                                className={`rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50 ${
                                  swearRate === item.id ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100" : "border-zinc-700 text-zinc-300"
                                }`}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-zinc-500">{SWEAR_RATES.find((item) => item.id === swearRate)?.hint}</p>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || (swear === run.swear && swearRate === run.swearRate)}
                        onClick={() => onSaveSwear(includedIds, swear, swearRate)}
                        className="mt-4 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  ) : null}
                </section>

                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-50">This week</h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        {weekOn
                          ? `${describeWeek(weekDays, weekStart, weekEnd, weekEveryHours * 60, callsPerDay)}. Hours are ${region.timeZone} time.`
                          : "Off. This run is not on a weekly schedule."}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={weekOn}
                      aria-label="Schedule this run for the week"
                      disabled={busy}
                      onClick={() => setWeekOn((value) => !value)}
                      className={`relative h-7 w-12 shrink-0 rounded-full disabled:opacity-50 ${weekOn ? "bg-cyan-400" : "bg-zinc-700"}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-zinc-950 ${weekOn ? "left-6" : "left-1"}`} />
                    </button>
                  </div>
                  {weekOn ? (
                    <div className="mt-4 border-t border-zinc-800 pt-4">
                      <WeekFields
                        days={weekDays}
                        startHour={weekStart}
                        endHour={weekEnd}
                        everyHours={weekEveryHours}
                        callsPerDay={callsPerDay}
                        posts={postsInWindow(weekStart, weekEnd, weekEveryHours * 60, callsPerDay, run.repliesPerPost)}
                        disabled={busy}
                        onDays={setWeekDays}
                        onStart={setWeekStart}
                        onEnd={setWeekEnd}
                        onEvery={setWeekEveryHours}
                        onCalls={setCallsPerDay}
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (weekOn === run.weekDays > 0 &&
                        (!weekOn ||
                          (weekDays === run.weekDays &&
                            weekStart === run.weekStartHour &&
                            weekEnd === run.weekEndHour &&
                            weekEveryHours * 60 === run.weekEveryMinutes &&
                            callsPerDay === run.callsPerDay)))
                    }
                    onClick={() =>
                      onSaveWeek(includedIds, {
                        days: weekOn ? weekDays : 0,
                        startHour: weekStart,
                        endHour: weekEnd,
                        everyMinutes: weekEveryHours * 60,
                        callsPerDay,
                      })
                    }
                    className="mt-4 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
                  >
                    Save
                  </button>
                </section>

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
                      onClick={() => onSetAutomatic(includedIds, !run.autoContinue, postsPerDayValue)}
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
                        onSetAutomatic(includedIds, true, postsPerDayValue);
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
              </div>
            ) : null}
          </div>
          </div>
        </div>
      </main>
    </div>,
    document.body,
  );
}

function RunAnalytics({ region }: { region: RegionRun }) {
  const stats = buildRunAnalytics(region);
  const groupMax = Math.max(1, ...stats.groups.map((group) => group.sent + group.waiting + group.waitingLater + group.failed));
  const speakerMax = Math.max(1, ...stats.speakers.map((speaker) => speaker.sent));
  const hourMax = Math.max(1, ...stats.hours.map((hour) => hour.sent));
  const decided = stats.jumped + stats.stayed + stats.undecided;
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="text-sm font-semibold text-zinc-50">Analytics</h3>
        <p className="mt-1 text-xs text-zinc-500">Today, New York time. Lines still waiting are counted until they send.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Sent" value={String(stats.sent)} sub={`${stats.posts} posts · ${stats.replies} replies`} />
          <Metric
            label="Waiting today"
            value={String(stats.waiting)}
            sub={stats.waitingLater > 0 ? `${stats.waitingLater} later this week` : "scheduled or sending"}
          />
          <Metric label="Failed" value={String(stats.failed)} sub={stats.failed > 0 ? "see Conversations" : "none so far"} />
          <Metric
            label="Jumped in"
            value={stats.included === 0 ? "0" : String(stats.jumped)}
            sub={stats.included === 0 ? "no accounts included" : `of ${stats.included} included`}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="text-sm font-semibold text-zinc-50">When they sent</h3>
        {stats.hours.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Nothing sent yet today.</p>
        ) : (
          <div className="mt-4 flex h-28 items-end gap-1">
            {stats.hours.map((hour) => (
              <div key={hour.hour} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] tabular-nums text-zinc-500">{hour.sent > 0 ? hour.sent : ""}</span>
                  <div className="flex h-16 w-full items-end">
                  <div
                    className={`w-full rounded-sm ${hour.sent === 0 ? "bg-zinc-800" : "bg-cyan-400"}`}
                    style={{ height: `${hour.sent === 0 ? 8 : Math.max(12, (hour.sent / hourMax) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-500">{hour.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="text-sm font-semibold text-zinc-50">Groups</h3>
          {stats.groups.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No groups included.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {stats.groups.map((group) => (
                <li key={group.title}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-zinc-100">{group.title}</span>
                    <span className="shrink-0 tabular-nums text-zinc-400">{group.sent} sent</span>
                  </div>
                  <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full bg-cyan-400" style={{ width: `${(group.sent / groupMax) * 100}%` }} />
                    <div className="h-full bg-cyan-200/70" style={{ width: `${(group.waiting / groupMax) * 100}%` }} />
                    <div className="h-full bg-zinc-500" style={{ width: `${(group.waitingLater / groupMax) * 100}%` }} />
                    <div className="h-full bg-amber-300" style={{ width: `${(group.failed / groupMax) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {group.waiting > 0 ? `${group.waiting} waiting today` : "none waiting today"}
                    {group.waitingLater > 0 ? ` · ${group.waitingLater} later` : ""}
                    {group.failed > 0 ? ` · ${group.failed} failed` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="text-sm font-semibold text-zinc-50">Who spoke</h3>
          {stats.speakers.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Nobody has sent a line yet today.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {stats.speakers.map((speaker) => (
                <li key={speaker.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-zinc-100">{speaker.name}</span>
                    <span className="shrink-0 tabular-nums text-zinc-400">{speaker.sent}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full bg-cyan-400" style={{ width: `${(speaker.sent / speakerMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="text-sm font-semibold text-zinc-50">Jump in</h3>
        <p className="mt-1 text-xs text-zinc-500">Latest decision for each included account.</p>
        {stats.included === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No accounts included.</p>
        ) : (
          <>
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-cyan-400" style={{ width: `${decided === 0 ? 0 : (stats.jumped / decided) * 100}%` }} />
              <div className="h-full bg-zinc-500" style={{ width: `${decided === 0 ? 0 : (stats.stayed / decided) * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
              <span>{stats.jumped} jumped in</span>
              <span>{stats.stayed} stayed out</span>
              <span>{stats.undecided} no decision yet</span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>
    </div>
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

function AccountHome({
  account,
  options,
  disabled,
  onSave,
}: {
  account: RegionRunAccount;
  options: Array<{ hubId: string; label: string }>;
  disabled: boolean;
  onSave: (input: { hubId: string | null; languages: string[] }) => void;
}) {
  const home = account.home;
  const [open, setOpen] = useState(false);
  const [hubId, setHubId] = useState(home?.source === "set" ? home.hubId : "");
  const [languages, setLanguages] = useState(home?.languagesSet ? home.languages.join(", ") : "");
  const choices = home && !options.some((option) => option.hubId === home.hubId) ? [...options, { hubId: home.hubId, label: home.place }] : options;
  const fieldCls = "rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-cyan-400/50";

  return (
    <div className="mt-1 text-xs text-zinc-500">
      <p>
        {home
          ? `Home ${home.place || "unknown"}${home.source === "groups" ? " (from its groups)" : ""} · writes ${home.languages.join(", ")}`
          : "No home yet"}
        <button type="button" disabled={disabled} onClick={() => setOpen(!open)} className="ml-2 text-cyan-200/90 disabled:opacity-50">
          {open ? "Cancel" : "Change"}
        </button>
      </p>
      {open ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={hubId} disabled={disabled} onChange={(event) => setHubId(event.target.value)} className={fieldCls}>
            <option value="">From its groups</option>
            {choices.map((option) => (
              <option key={option.hubId} value={option.hubId}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={languages}
            disabled={disabled}
            onChange={(event) => setLanguages(event.target.value)}
            placeholder="Languages, e.g. English, Spanish"
            className={`${fieldCls} w-52`}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onSave({ hubId: hubId || null, languages: languages.split(",").map((language) => language.trim()).filter(Boolean) });
              setOpen(false);
            }}
            className="rounded-lg border border-cyan-400/30 px-2 py-1 text-cyan-100 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AccountVoice({
  persona,
  disabled,
  onSave,
}: {
  persona: ConversationPersona;
  disabled: boolean;
  onSave: (voice: PropVoice) => void;
}) {
  const saved = personaVoice(persona);
  const [voice, setVoice] = useState(saved);
  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <PropVoiceFields voice={voice} disabled={disabled} fieldClassName={inputCls} onChange={setVoice} />
      <button
        type="button"
        disabled={disabled || samePropVoice(voice, saved)}
        onClick={() => onSave(voice)}
        className="mt-3 rounded-xl border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50"
      >
        Save personality
      </button>
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

function personaVoice(persona: ConversationPersona): PropVoice {
  return {
    personality: persona.personality,
    swear: persona.swear,
    swearRate: persona.swearRate,
    grammar: persona.grammar,
    abbrev: persona.abbrev,
    behavior: persona.behavior,
    traits: persona.traits,
  };
}

function PersonaRow({
  persona,
  disabled,
  onSave,
  onCopy,
}: {
  persona: ConversationPersona;
  disabled: boolean;
  onSave: (voice: PropVoice) => Promise<void>;
  onCopy: () => Promise<void>;
}) {
  const saved = personaVoice(persona);
  const [voice, setVoice] = useState(saved);

  return (
    <form
      className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(voice);
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
      <p className="mt-3 text-xs text-zinc-500">
        Age, interests, temperament, and the other traits decide how this account writes. Cuss words, grammar, and abbreviations can still follow the conversation.
      </p>
      <div className="mt-4">
        <PropVoiceFields voice={voice} disabled={disabled} fieldClassName={inputCls} onChange={setVoice} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={disabled || samePropVoice(voice, saved)}
          className="rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
        >
          Save behavior
        </button>
        <button
          type="button"
          disabled={disabled || !voiceIsSet(saved)}
          onClick={() => void onCopy()}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
        >
          Copy behavior
        </button>
      </div>
    </form>
  );
}
