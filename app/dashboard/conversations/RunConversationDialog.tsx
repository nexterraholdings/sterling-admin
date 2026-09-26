"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, X } from "lucide-react";
import { WEEKDAY_LABELS, dayOn, formatHour, toggleDay } from "@/lib/conversations/week";
import type { ConversationGroup } from "@/lib/conversations/types";

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 disabled:opacity-50";

const STEPS = ["Objective", "Groups"] as const;

const RUN_GOALS = [
  { id: "engagement", label: "Create compelling engagement", hint: "Posts and replies people want to answer." },
  { id: "conversations", label: "Boost user conversations", hint: "Get people in the group talking with each other." },
  { id: "welcome", label: "Welcome people in", hint: "Make it easy for someone new to join." },
  { id: "threads", label: "Keep threads going", hint: "Stay with conversations that are already open." },
  { id: "local", label: "Bring up local life", hint: "Everyday things on the block people recognize." },
  { id: "active", label: "Make the group feel active", hint: "The group looks lived in, not empty." },
] as const;

function formatRunObjective(goalIds: string[], details: string): string {
  const goals = RUN_GOALS.filter((goal) => goalIds.includes(goal.id)).map((goal) => goal.label);
  const extra = details.trim();
  return [...(goals.length > 0 ? [`${goals.join(". ")}.`] : []), ...(extra ? [extra] : [])].join(" ").slice(0, 400);
}

export type NewRunInput = {
  hubId: string;
  objective: string;
  groupIds: string[];
};

export function RunConversationDialog({
  groups,
  busy,
  onCreate,
}: {
  groups: ConversationGroup[];
  busy: boolean;
  onCreate: (input: NewRunInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [hubId, setHubId] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groupQuery, setGroupQuery] = useState("");

  const regions = useMemo(() => {
    const map = new Map<string, { hubId: string; title: string; groups: ConversationGroup[] }>();
    for (const group of groups) {
      if (!group.hubId) continue;
      const current = map.get(group.hubId) ?? {
        hubId: group.hubId,
        title: group.hubTitle?.trim() || "Region",
        groups: [],
      };
      current.groups.push(group);
      map.set(group.hubId, current);
    }
    return [...map.values()]
      .map((region) => ({
        ...region,
        groups: [...region.groups].sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [groups]);

  const region = regions.find((item) => item.hubId === hubId) ?? regions[0] ?? null;
  const query = groupQuery.trim().toLowerCase();
  const visibleGroups = (region?.groups ?? []).filter((group) => !query || group.title.toLowerCase().includes(query));
  const objective = formatRunObjective(goalIds, details);
  const objectiveReady = goalIds.length > 0;
  const selectedIds = groupIds.filter((id) => region?.groups.some((group) => group.id === id));
  const canStart = Boolean(region) && objectiveReady && selectedIds.length > 0 && !busy;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function chooseRegion(nextHubId: string) {
    setHubId(nextHubId);
    setGroupIds([]);
  }

  function toggleGroup(group: ConversationGroup) {
    if (group.propMemberCount < 2) return;
    setGroupIds((current) => (current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id]));
  }

  function start() {
    if (!region || !canStart) return;
    onCreate({ hubId: region.hubId, objective, groupIds: selectedIds });
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setGoalIds([]);
          setDetails("");
          setHubId(regions[0]?.hubId ?? "");
          setGroupIds([]);
          setOpen(true);
        }}
        className="rounded-xl bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950"
      >
        New run
      </button>
      {open && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
              onClick={() => setOpen(false)}
            >
              <div
                className="flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden bg-[#0c1016] text-zinc-50 sm:h-[min(85vh,40rem)] sm:rounded-3xl sm:border sm:border-zinc-800"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="New run"
              >
                <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => (step === 0 ? setOpen(false) : setStep(0))}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-700 text-zinc-200"
                    aria-label={step === 0 ? "Close" : "Back"}
                  >
                    {step === 0 ? <X className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cyan-300/80">New run</p>
                    <p className="truncate text-sm text-zinc-400">
                      {RUN_GOALS.filter((goal) => goalIds.includes(goal.id)).map((goal) => goal.label).join(", ") || "An objective and the groups in it"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {STEPS.map((label, index) => (
                      <span
                        key={label}
                        className={`h-1.5 w-6 rounded-full ${index <= step ? "bg-cyan-400" : "bg-zinc-800"}`}
                        title={label}
                      />
                    ))}
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-auto px-4 py-5">
                  {step === 0 ? (
                    <div>
                      <h2 className="text-lg font-semibold">What is this run for?</h2>
                      <p className="mt-1 text-sm text-zinc-500">Pick every goal that fits. Add anything extra below.</p>
                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {RUN_GOALS.map((goal) => {
                          const selected = goalIds.includes(goal.id);
                          return (
                            <button
                              key={goal.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() =>
                                setGoalIds((current) =>
                                  current.includes(goal.id) ? current.filter((id) => id !== goal.id) : [...current, goal.id],
                                )
                              }
                              className={`rounded-2xl border px-3 py-3 text-left ${
                                selected ? "border-cyan-400/50 bg-cyan-400/10" : "border-zinc-800 bg-zinc-950/40"
                              }`}
                            >
                              <span className="flex items-start justify-between gap-2">
                                <span className="text-sm font-medium">{goal.label}</span>
                                {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /> : null}
                              </span>
                              <span className="mt-0.5 block text-xs text-zinc-500">{goal.hint}</span>
                            </button>
                          );
                        })}
                      </div>
                      <label className="mt-5 block text-sm font-medium text-zinc-100">
                        Additional details
                        <textarea
                          className={`${inputCls} mt-2 min-h-24 resize-y font-normal`}
                          value={details}
                          maxLength={240}
                          placeholder="Anything this run should keep in mind"
                          onChange={(event) => setDetails(event.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}

                  {step === 1 ? (
                    <div>
                      <h2 className="text-lg font-semibold">Which groups are in it?</h2>
                      <p className="mt-1 text-sm text-zinc-500">A run can include more than one group in the same region.</p>
                      {regions.length > 1 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {regions.map((item) => (
                            <button
                              key={item.hubId}
                              type="button"
                              onClick={() => chooseRegion(item.hubId)}
                              className={`rounded-xl border px-3 py-1.5 text-sm ${
                                region?.hubId === item.hubId
                                  ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
                                  : "border-zinc-700 text-zinc-300"
                              }`}
                            >
                              {item.title}
                            </button>
                          ))}
                        </div>
                      ) : region ? (
                        <p className="mt-4 text-sm text-zinc-300">{region.title}</p>
                      ) : (
                        <p className="mt-4 text-sm text-zinc-500">No region with groups yet.</p>
                      )}
                      <input
                        className={`${inputCls} mt-4`}
                        placeholder="Search groups"
                        value={groupQuery}
                        onChange={(event) => setGroupQuery(event.target.value)}
                      />
                      <div className="mt-3 flex flex-col gap-2">
                        {visibleGroups.map((group) => {
                          const selected = selectedIds.includes(group.id);
                          const tooSmall = group.propMemberCount < 2;
                          return (
                            <button
                              key={group.id}
                              type="button"
                              disabled={tooSmall}
                              onClick={() => toggleGroup(group)}
                              className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left disabled:opacity-40 ${
                                selected ? "border-cyan-400/50 bg-cyan-400/10" : "border-zinc-800 bg-zinc-950/40"
                              }`}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{group.title}</span>
                                <span className="mt-0.5 block truncate text-xs text-zinc-500">
                                  {tooSmall
                                    ? "Needs at least two prop accounts"
                                    : `${group.propMemberCount} ${group.propMemberCount === 1 ? "account" : "accounts"}`}
                                </span>
                              </span>
                              {selected ? <Check className="h-4 w-4 shrink-0 text-cyan-300" /> : null}
                            </button>
                          );
                        })}
                        {visibleGroups.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">No groups match.</p> : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3">
                  <p className="text-xs text-zinc-500">
                    {step + 1} of {STEPS.length}
                  </p>
                  {step === 0 ? (
                    <button
                      type="button"
                      disabled={!objectiveReady}
                      onClick={() => setStep(1)}
                      className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!canStart}
                      onClick={start}
                      className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40"
                    >
                      {busy ? "Starting…" : "Start run"}
                    </button>
                  )}
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function WeekFields({
  days,
  startHour,
  endHour,
  everyHours,
  callsPerDay,
  posts,
  onDays,
  onStart,
  onEnd,
  onEvery,
  onCalls,
  disabled,
}: {
  days: number;
  startHour: number;
  endHour: number;
  everyHours: number;
  callsPerDay: number;
  posts: number;
  onDays: (days: number) => void;
  onStart: (hour: number) => void;
  onEnd: (hour: number) => void;
  onEvery: (hours: number) => void;
  onCalls: (calls: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs text-zinc-500">Days</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, index) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => onDays(toggleDay(days, index))}
              className={`rounded-xl border px-2.5 py-1.5 text-sm disabled:opacity-50 ${
                dayOn(days, index) ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100" : "border-zinc-700 text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-zinc-500">
          From
          <select
            disabled={disabled}
            value={startHour}
            onChange={(event) => onStart(Number(event.target.value))}
            className={`${inputCls} mt-1`}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {formatHour(hour)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          To
          <select
            disabled={disabled}
            value={endHour}
            onChange={(event) => onEnd(Number(event.target.value))}
            className={`${inputCls} mt-1`}
          >
            {Array.from({ length: 24 }, (_, hour) => hour + 1).map((hour) => (
              <option key={hour} value={hour}>
                {formatHour(hour)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Stepper label="Every N hours" value={everyHours} min={1} max={6} onChange={onEvery} disabled={disabled} />
      <Stepper label="Calls a day" value={callsPerDay} min={1} max={40} onChange={onCalls} disabled={disabled} />
      <p className="text-xs text-zinc-500">
        {posts > 0
          ? `${posts} ${posts === 1 ? "post" : "posts"} a day inside those hours. Each post uses one call, plus one per reply.`
          : "That call cap is too low for a post and its replies."}
      </p>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
          className="h-9 w-9 rounded-xl border border-zinc-700 text-lg text-zinc-200 disabled:opacity-40"
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          −
        </button>
        <span className="w-8 text-center text-sm tabular-nums">{value}</span>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
          className="h-9 w-9 rounded-xl border border-zinc-700 text-lg text-zinc-200 disabled:opacity-40"
          aria-label={`More ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
