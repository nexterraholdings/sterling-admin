"use client";

import { useMemo, useState } from "react";
import { TOPIC_DIRECTIONS, type ConversationGroup, type ConversationPersona, type ManualRunRequest } from "@/lib/conversations/types";

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 disabled:opacity-50";

const PAGE_SIZE = 6;

const WINDOWS = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
];

const NATURAL_GAPS = [
  { label: "Every 5–10 min", min: 5, max: 10 },
  { label: "Every 10–15 min", min: 10, max: 15 },
  { label: "Every 15–30 min", min: 15, max: 30 },
  { label: "Every 30–60 min", min: 30, max: 60 },
];

type StatusFilter = "all" | "on" | "off";
type ReadyFilter = "all" | "ready" | "short";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join("") || "?";
}

function Step({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="mt-6">
      <p className="text-sm font-medium text-zinc-100">
        <span className="mr-2 font-mono text-xs text-cyan-300/80">{n}</span>
        {title}
      </p>
      <p className="mt-1 text-sm text-zinc-500">{hint}</p>
    </div>
  );
}

export function RunConversationDialog({
  groups,
  personas,
  autopilotOn,
  callsLeft,
  busy,
  onRun,
}: {
  groups: ConversationGroup[];
  personas: ConversationPersona[];
  autopilotOn: boolean;
  callsLeft: number;
  busy: boolean;
  onRun: (input: ManualRunRequest) => void;
}) {
  const [groupId, setGroupId] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [readyFilter, setReadyFilter] = useState<ReadyFilter>("all");
  const [hubFilter, setHubFilter] = useState("all");
  const [groupPage, setGroupPage] = useState(1);
  const [useGroupSubject, setUseGroupSubject] = useState(true);
  const [topic, setTopic] = useState("");
  const [direction, setDirection] = useState("");
  const [note, setNote] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [posts, setPosts] = useState(1);
  const [repliesPerPost, setRepliesPerPost] = useState(2);
  const [joinExisting, setJoinExisting] = useState(true);
  const [maxCalls, setMaxCalls] = useState(2);
  const [pace, setPace] = useState<"now" | "natural" | "window">("now");
  const [gap, setGap] = useState(NATURAL_GAPS[1]);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [startNow, setStartNow] = useState(true);
  const [keepGoing, setKeepGoing] = useState(false);
  const [postsPerDay, setPostsPerDay] = useState(4);
  const [accountQuery, setAccountQuery] = useState("");

  const group = groups.find((item) => item.id === groupId) ?? null;
  const avatarById = useMemo(() => new Map(personas.map((persona) => [persona.userId, persona.avatarUrl])), [personas]);
  const hubs = useMemo(
    () => [...new Set(groups.map((item) => item.hubTitle).filter((title): title is string => Boolean(title)))].sort((a, b) => a.localeCompare(b)),
    [groups],
  );

  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    return [...groups]
      .filter((item) => {
        if (statusFilter === "on" && !item.enabled) return false;
        if (statusFilter === "off" && item.enabled) return false;
        if (readyFilter === "ready" && item.propMemberCount < 2) return false;
        if (readyFilter === "short" && item.propMemberCount >= 2) return false;
        if (hubFilter !== "all" && (item.hubTitle ?? "") !== hubFilter) return false;
        if (!q) return true;
        return `${item.title} ${item.hubTitle ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.title.localeCompare(b.title));
  }, [groups, groupQuery, statusFilter, readyFilter, hubFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const pageSafe = Math.min(groupPage, pageCount);
  const visibleGroups = filteredGroups.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  function chooseGroup(next: ConversationGroup) {
    if (next.id === groupId) return;
    setGroupId(next.id);
    setTopic(next.topic.startsWith("Stay on what this group") ? "" : (next.topic ?? ""));
    setRepliesPerPost(next.repliesPerPost ?? 2);
    setAccountIds(next.members.map((member) => member.userId));
    setAccountQuery("");
  }

  const visibleMembers = (group?.members ?? []).filter((member) => {
    const q = accountQuery.trim().toLowerCase();
    if (!q) return true;
    return `${member.name} ${member.username ?? ""}`.toLowerCase().includes(q);
  });
  const lines = posts + posts * repliesPerPost;
  const natural = pace === "natural";
  const needsSpread = natural || (pace === "window" && durationMinutes > 0);
  const topicReady = useGroupSubject || topic.trim().length >= 8;
  const directionReady = TOPIC_DIRECTIONS.some((item) => item.id === direction);
  const accountsReady = accountIds.length >= (repliesPerPost > 0 ? 2 : 1);
  const spreadBlocked = (needsSpread || keepGoing) && !autopilotOn;
  const canRun = Boolean(group) && topicReady && directionReady && accountsReady && !spreadBlocked && !busy;
  const directionLabel = TOPIC_DIRECTIONS.find((item) => item.id === direction)?.label.toLowerCase();
  const windowLabel = natural
    ? `about every ${gap.min}–${gap.max} minutes`
    : pace === "now" || durationMinutes === 0
      ? "right now"
      : `over ${durationMinutes} minutes`;

  return (
    <form
      className="mt-5 border-t border-zinc-800 pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!group || !canRun) return;
        onRun({
          groupId: group.id,
          topic: useGroupSubject ? "" : topic.trim(),
          useGroupSubject,
          direction,
          note: note.trim(),
          accountIds,
          posts,
          repliesPerPost,
          joinExisting,
          maxCalls,
          durationMinutes: natural || pace === "now" ? 0 : durationMinutes,
          startNow: natural || pace === "window" ? startNow : true,
          natural,
          postEveryMin: gap.min,
          postEveryMax: gap.max,
          keepGoing,
          postsPerDay,
        });
      }}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cyan-300/80">Start one run</p>
      <p className="mt-1 max-w-2xl text-sm text-zinc-400">
        Answer these in order. {callsLeft} Groq calls are left today. Running turns the chosen group on.
      </p>

      <Step n={1} title="Which group?" hint="Search and filter the full list. A group needs two prop accounts before replies can happen." />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search groups or hubs"
          value={groupQuery}
          onChange={(event) => {
            setGroupQuery(event.target.value);
            setGroupPage(1);
          }}
        />
        {(
          [
            ["all", "All"],
            ["on", "On"],
            ["off", "Off"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setStatusFilter(id);
              setGroupPage(1);
            }}
            className={`rounded-xl border px-3 py-1.5 text-sm ${
              statusFilter === id ? "border-cyan-400/40 text-cyan-100" : "border-zinc-700 text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
        {(
          [
            ["all", "Any size"],
            ["ready", "2+ accounts"],
            ["short", "Fewer than 2"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setReadyFilter(id);
              setGroupPage(1);
            }}
            className={`rounded-xl border px-3 py-1.5 text-sm ${
              readyFilter === id ? "border-cyan-400/40 text-cyan-100" : "border-zinc-700 text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
        {hubs.length > 0 ? (
          <select
            className={`${inputCls} w-auto`}
            value={hubFilter}
            onChange={(event) => {
              setHubFilter(event.target.value);
              setGroupPage(1);
            }}
          >
            <option value="all">All hubs</option>
            {hubs.map((hub) => (
              <option key={hub} value={hub}>
                {hub}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
        {visibleGroups.map((item) => {
          const selected = item.id === groupId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => chooseGroup(item)}
              className={`rounded-2xl border px-3 py-3 text-left ${
                selected ? "border-cyan-400/40 bg-cyan-400/10" : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.enabled ? "bg-cyan-400" : "bg-zinc-600"}`} />
                <span className="truncate text-sm font-medium text-zinc-100">{item.title}</span>
              </span>
              <span className="mt-1 block truncate text-xs text-zinc-500">
                {item.hubTitle ? `${item.hubTitle} · ` : ""}
                {item.propMemberCount} {item.propMemberCount === 1 ? "account" : "accounts"}
                {item.enabled ? " · on" : " · off"}
              </span>
            </button>
          );
        })}
      </div>
      {filteredGroups.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No groups match.</p> : null}
      {filteredGroups.length > PAGE_SIZE ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(filteredGroups.length, pageSafe * PAGE_SIZE)} of {filteredGroups.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pageSafe <= 1}
              onClick={() => setGroupPage(pageSafe - 1)}
              className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pageSafe >= pageCount}
              onClick={() => setGroupPage(pageSafe + 1)}
              className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-sm text-zinc-400">{group ? `Selected: ${group.title}` : "No group selected yet."}</p>

      <Step n={2} title="What should they talk about?" hint="Use the group itself, or write a narrower subject. Then pick how it should sound." />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setUseGroupSubject(true)}
          className={`rounded-xl border px-3 py-1.5 text-sm ${
            useGroupSubject ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100" : "border-zinc-700 text-zinc-300"
          }`}
        >
          Whatever the group is about
        </button>
        <button
          type="button"
          onClick={() => setUseGroupSubject(false)}
          className={`rounded-xl border px-3 py-1.5 text-sm ${
            !useGroupSubject ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100" : "border-zinc-700 text-zinc-300"
          }`}
        >
          A specific subject
        </button>
      </div>
      {useGroupSubject ? (
        <p className="mt-3 text-sm text-zinc-300">
          {group
            ? `${group.title}${group.category ? ` · ${group.category}` : ""}. They talk about that the way members of this group would.`
            : "Pick a group. An MMA group talks about MMA. A coffee group talks about coffee."}
        </p>
      ) : (
        <label className="mt-3 block text-xs text-zinc-400">
          Subject
          <textarea
            className={`${inputCls} mt-1 min-h-20 resize-y`}
            value={topic}
            maxLength={240}
            placeholder="Example: whether the new coffee shop on Main is worth the line"
            onChange={(event) => setTopic(event.target.value)}
          />
        </label>
      )}
      {!useGroupSubject && !topicReady && topic.trim().length > 0 ? (
        <p className="mt-1 text-xs text-amber-200">Use at least a short sentence.</p>
      ) : null}
      {useGroupSubject && group?.description ? <p className="mt-1 text-xs text-zinc-500">{group.description}</p> : null}
      <p className="mt-3 text-xs text-zinc-400">How it should sound</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {TOPIC_DIRECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setDirection(item.id)}
            className={`rounded-xl border px-3 py-1.5 text-sm ${
              direction === item.id ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100" : "border-zinc-700 text-zinc-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">{direction ? TOPIC_DIRECTIONS.find((item) => item.id === direction)?.hint : "Pick one."}</p>
      <label className="mt-3 block text-xs text-zinc-400">
        Extra detail, optional
        <textarea
          className={`${inputCls} mt-1 min-h-16 resize-y`}
          value={note}
          maxLength={160}
          placeholder="A place, a disagreement, or something they should not mention"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <Step n={3} title="Who speaks?" hint="These accounts write the posts and replies. Uncheck anyone who should sit this one out." />
      {group ? (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-300">{accountIds.length} included</p>
            <div className="flex gap-2 text-sm">
              <button type="button" className="text-cyan-200" onClick={() => setAccountIds(group.members.map((member) => member.userId))}>
                All
              </button>
              <button type="button" className="text-zinc-400" onClick={() => setAccountIds([])}>
                None
              </button>
            </div>
          </div>
          <input
            className={`${inputCls} mt-2 max-w-xs`}
            placeholder="Search these accounts"
            value={accountQuery}
            onChange={(event) => setAccountQuery(event.target.value)}
          />
          <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-zinc-800 p-2">
            {group.members.length === 0 ? <p className="px-2 py-3 text-sm text-zinc-500">This group has no prop accounts.</p> : null}
            {visibleMembers.map((member) => {
              const checked = accountIds.includes(member.userId);
              const avatar = avatarById.get(member.userId);
              return (
                <label key={member.userId} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-zinc-800/80">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setAccountIds((current) =>
                        current.includes(member.userId) ? current.filter((id) => id !== member.userId) : [...current, member.userId],
                      )
                    }
                  />
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-cyan-100">
                      {initials(member.name)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-zinc-100">{member.name}</span>
                    <span className="block truncate text-xs text-zinc-500">{member.username ? `@${member.username}` : "No username"}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {!accountsReady ? (
            <p className="mt-1 text-xs text-amber-200">
              {repliesPerPost > 0 ? "Replies need at least two accounts." : "Pick at least one account."}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">Pick a group first.</p>
      )}

      <Step
        n={4}
        title="How many messages, and how fast?"
        hint="New posts start a thread. Replies answer them. They can also answer posts that are already in the group."
      />
      <label className="mt-3 flex items-start gap-2 text-sm text-zinc-200">
        <input type="checkbox" className="mt-1" checked={joinExisting} onChange={(event) => setJoinExisting(event.target.checked)} />
        <span>Reply to posts and comments already in the group, not only the ones this run creates.</span>
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-zinc-400">
          New posts
          <input
            type="number"
            min={1}
            max={4}
            className={`${inputCls} mt-1`}
            value={posts}
            onChange={(event) => setPosts(Math.min(4, Math.max(1, Number(event.target.value) || 1)))}
          />
        </label>
        <label className="text-xs text-zinc-400">
          Replies on each post
          <input
            type="number"
            min={0}
            max={4}
            className={`${inputCls} mt-1`}
            value={repliesPerPost}
            onChange={(event) => setRepliesPerPost(Math.min(4, Math.max(0, Number(event.target.value) || 0)))}
          />
        </label>
        <label className="text-xs text-zinc-400">
          Calls to send now
          <input
            type="number"
            min={1}
            max={6}
            className={`${inputCls} mt-1`}
            value={maxCalls}
            onChange={(event) => setMaxCalls(Math.min(6, Math.max(1, Number(event.target.value) || 1)))}
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-zinc-400">How fast</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPace("now")}
          className={`rounded-xl border px-3 py-1.5 text-sm ${pace === "now" ? "border-cyan-400/40 text-cyan-100" : "border-zinc-700 text-zinc-300"}`}
        >
          Right now
        </button>
        <button
          type="button"
          onClick={() => setPace("natural")}
          className={`rounded-xl border px-3 py-1.5 text-sm ${pace === "natural" ? "border-cyan-400/40 text-cyan-100" : "border-zinc-700 text-zinc-300"}`}
        >
          Natural
        </button>
        <button
          type="button"
          onClick={() => setPace("window")}
          className={`rounded-xl border px-3 py-1.5 text-sm ${pace === "window" ? "border-cyan-400/40 text-cyan-100" : "border-zinc-700 text-zinc-300"}`}
        >
          Fixed window
        </button>
      </div>
      {natural ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {NATURAL_GAPS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setGap(item)}
              className={`rounded-xl border px-3 py-1.5 text-sm ${
                gap.min === item.min && gap.max === item.max ? "border-cyan-400/40 text-cyan-100" : "border-zinc-700 text-zinc-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {pace === "window" ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {WINDOWS.map((window) => (
            <button
              key={window.label}
              type="button"
              onClick={() => setDurationMinutes(window.minutes)}
              className={`rounded-xl border px-3 py-1.5 text-sm ${
                durationMinutes === window.minutes ? "border-cyan-400/40 text-cyan-100" : "border-zinc-700 text-zinc-300"
              }`}
            >
              {window.label}
            </button>
          ))}
          <label className="text-xs text-zinc-400">
            Or minutes
            <input
              type="number"
              min={1}
              max={360}
              className={`${inputCls} mt-1 w-24`}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Math.min(360, Math.max(1, Number(event.target.value) || 1)))}
            />
          </label>
        </div>
      ) : null}
      {natural ? (
        <p className="mt-2 text-xs text-zinc-500">
          Each new post waits a random time in that range. Replies show up unevenly, a few minutes apart, instead of on a fixed beat.
        </p>
      ) : null}
      {needsSpread ? (
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" checked={startNow} onChange={(event) => setStartNow(event.target.checked)} />
          Send the first post immediately
        </label>
      ) : null}
      <p className="mt-2 text-xs text-zinc-500">
        About {lines} {lines === 1 ? "line" : "lines"} if every reply is written. This click sends at most {maxCalls}.
        {needsSpread
          ? ` The rest waits on the autopilot timer.${spreadBlocked ? " Turn automatic conversations on first, or choose Right now." : ""}`
          : " Anything past that waits until automatic conversations is on."}
      </p>

      <Step
        n={5}
        title="Make it automatic?"
        hint="Choose whether this conversation stops after the run or keeps going on its own every day."
      />
      <div className={`mt-3 rounded-2xl border p-4 ${keepGoing ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-zinc-800"}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100">
              {keepGoing ? "Automatic: keeps going every day" : "One time: stops when this run is done"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {keepGoing
                ? "Autopilot keeps opening posts, replying to each other, and joining threads already in the group."
                : "Only the lines from this run are sent. Turn this on to keep the conversation going."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={keepGoing}
            aria-label="Make it automatic"
            onClick={() => setKeepGoing((value) => !value)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition ${keepGoing ? "bg-cyan-400" : "bg-zinc-700"}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-zinc-950 transition ${keepGoing ? "left-7" : "left-1"}`} />
          </button>
        </div>
        {keepGoing ? (
          <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-zinc-800 pt-4">
            <label className="text-xs text-zinc-400">
              New posts per day
              <input
                type="number"
                min={1}
                max={20}
                className={`${inputCls} mt-1 w-24`}
                value={postsPerDay}
                onChange={(event) => setPostsPerDay(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
              />
            </label>
            <p className="max-w-lg pb-2 text-xs text-zinc-500">
              Each post gets {repliesPerPost} {repliesPerPost === 1 ? "reply" : "replies"} at uneven times, only inside the allowed hours and under the daily call cap.
            </p>
          </div>
        ) : null}
        {keepGoing && !autopilotOn ? (
          <p className="mt-3 text-xs text-amber-200">Turn automatic conversations on (the switch at the top of this card) first.</p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 px-3 py-3">
        <p className="max-w-xl text-sm text-zinc-300">
          {group && topicReady && directionLabel
            ? `${accountIds.length} accounts in ${group.title} talk about ${useGroupSubject ? "what that group is about" : `“${topic.trim()}”`} in a ${directionLabel} tone, ${windowLabel}${keepGoing ? `, then keep going with ${postsPerDay} posts a day` : ""}.`
            : "Fill in the group, subject, and direction to run."}
        </p>
        <button type="submit" disabled={!canRun} className="rounded-xl bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50">
          {busy ? "Running…" : "Run"}
        </button>
      </div>
    </form>
  );
}
