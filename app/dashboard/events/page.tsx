"use client";

import { useState, useEffect } from "react";
import {
  fetchEvents,
  fetchEventById,
  fetchEventAttendees,
  fetchEventCounts,
  updateEvent,
  deleteEvent,
  removeEventAttendee,
  type EventItem,
  type EventAttendee,
  type EventFilter,
} from "./actions";
import { Pagination } from "@/components/ui/Pagination";
import { Tabs } from "@/components/dashboard/Tabs";

const PAGE_SIZE = 20;
const EVENT_TYPES = ["networking", "open_house", "social"];

function eventToForm(event: EventItem) {
  return {
    name: event.name ?? "",
    event_type: event.event_type ?? EVENT_TYPES[0],
    is_private: event.is_private ?? false,
    duration_minutes: String(event.duration_minutes ?? ""),
    starts_at: toDatetimeLocal(event.starts_at),
    notes: event.notes ?? "",
  };
}

function eventTypeOptions(currentType: string) {
  if (!currentType || EVENT_TYPES.includes(currentType)) return EVENT_TYPES;
  return [currentType, ...EVENT_TYPES];
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700";
const textareaCls = `${inputCls} resize-none`;
const selectCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

function hostLabel(host: EventItem["host"]) {
  return host?.full_name ?? host?.username ?? "Unknown host";
}

function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditEventPanel({
  event,
  onClose,
  onSaved,
}: {
  event: EventItem;
  onClose: () => void;
  onSaved: (updated: EventItem) => void;
}) {
  const [eventState, setEventState] = useState(event);
  const [form, setForm] = useState(() => eventToForm(event));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setEventState(event);
    setForm(eventToForm(event));
    setSaveError(null);

    fetchEventById(event.id)
      .then((fresh) => {
        if (cancelled || !fresh) return;
        setEventState(fresh);
        setForm(eventToForm(fresh));
      })
      .catch((e) => {
        if (!cancelled) console.error(e);
      });

    return () => {
      cancelled = true;
    };
  }, [event.id]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const updates = {
        name: form.name || null,
        event_type: form.event_type || null,
        is_private: form.is_private,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        notes: form.notes || null,
      };
      await updateEvent(eventState.id, updates);
      onSaved({ ...eventState, ...updates });
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">Edit event</h2>
            <p className="mt-0.5 text-sm text-zinc-500">{eventState.name ?? "Untitled"}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-5">
            <Field label="Event name">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Event name"
              />
            </Field>
            <Field label="Type">
              <select
                className={selectCls}
                value={form.event_type}
                onChange={(e) => set("event_type", e.target.value)}
              >
                {eventTypeOptions(form.event_type).map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Starts at">
              <input
                type="datetime-local"
                className={inputCls}
                value={form.starts_at}
                onChange={(e) => set("starts_at", e.target.value)}
              />
            </Field>
            <Field label="Duration (minutes)">
              <input
                type="number"
                min={0}
                className={inputCls}
                value={form.duration_minutes}
                onChange={(e) => set("duration_minutes", e.target.value)}
              />
            </Field>
            <Field label="Visibility">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.is_private}
                  onChange={(e) => set("is_private", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 text-zinc-50 focus:ring-zinc-500"
                />
                Private event
              </label>
            </Field>
            <Field label="Notes">
              <textarea
                rows={4}
                className={textareaCls}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Event notes…"
              />
            </Field>
            <Field label="Address">
              <p className="rounded-xl border border-zinc-800 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-400">
                {eventState.address ?? "—"}
              </p>
            </Field>
          </div>

          {saveError && (
            <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{saveError}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-white px-5 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}

function AttendeesPanel({ event, onClose }: { event: EventItem; onClose: () => void }) {
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    loadAttendees();
  }, [event.id]);

  async function loadAttendees() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEventAttendees(event.id);
      setAttendees(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this attendee from the event?")) return;
    setRemovingId(userId);
    try {
      await removeEventAttendee(event.id, userId);
      setAttendees((prev) => prev.filter((a) => a.user_id !== userId));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col overflow-hidden bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">Event attendees</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {event.name ?? "Untitled"} · {attendees.length} attending
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {error && <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</p>}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-800" />
              ))}
            </div>
          ) : attendees.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">No attendees yet</p>
          ) : (
            <div className="space-y-2">
              {attendees.map((a) => (
                <div
                  key={a.user_id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-50">
                      {a.profile?.full_name ?? a.profile?.username ?? "Unknown"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{a.profile?.email ?? a.user_id}</p>
                  </div>
                  <div className="ml-4 flex items-center gap-3">
                    <span className="text-xs text-zinc-500">
                      {a.joined_at ? new Date(a.joined_at).toLocaleDateString() : "—"}
                    </span>
                    <button
                      onClick={() => handleRemove(a.user_id)}
                      disabled={removingId === a.user_id}
                      className="rounded-lg p-2 text-zinc-500 transition hover:bg-rose-500/15 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Remove attendee"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function typeBadgeCls(type: string | null) {
  switch (type) {
    case "networking":
      return "bg-blue-500/15 text-blue-300";
    case "open_house":
      return "bg-violet-500/15 text-violet-300";
    case "social":
      return "bg-emerald-500/15 text-emerald-300";
    default:
      return "bg-zinc-800 text-zinc-400";
  }
}

function EventRow({
  event,
  onEdit,
  onViewAttendees,
  onDelete,
}: {
  event: EventItem;
  onEdit: (event: EventItem) => void;
  onViewAttendees: (event: EventItem) => void;
  onDelete: (event: EventItem) => void;
}) {
  return (
    <tr className="hover:bg-zinc-800/60 transition-colors">
      <td className="px-6 py-4">
        <div>
          <p className="font-medium text-zinc-50">{event.name ?? "Untitled"}</p>
          {event.address && <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{event.address}</p>}
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-zinc-400">{hostLabel(event.host)}</td>
      <td className="px-6 py-4 text-sm text-zinc-400">
        {event.starts_at ? new Date(event.starts_at).toLocaleString() : "—"}
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${typeBadgeCls(event.event_type)}`}>
          {event.event_type?.replace("_", " ") ?? "—"}
        </span>
      </td>
      <td className="px-6 py-4 text-sm text-zinc-400">{event.is_private ? "Private" : "Public"}</td>
      <td className="px-6 py-4 text-sm text-zinc-400">{event.attendee_count ?? 0}</td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onViewAttendees(event)}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="View attendees"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.095a1.23 1.23 0 00.41-1.412A9.995 9.995 0 0010 12c-2.31 0-4.438.784-6.131 2.095z" />
            </svg>
          </button>
          <button
            onClick={() => onEdit(event)}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="Edit event"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(event)}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-rose-500/15 hover:text-rose-400"
            title="Delete event"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v3.5a2.75 2.75 0 002.75 2.75h2.5A2.75 2.75 0 0014 7.25v-3.5A2.75 2.75 0 0011.25 1h-2.5zM7 6.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 017 6.5zM5.75 3.75a.75.75 0 00-.75.75v3.5c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75v-3.5a.75.75 0 00-.75-.75h-2.5zM11 8.5a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 0111 8.5zM8.75 8a.75.75 0 00-.75.75v3.5c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75v-3.5A.75.75 0 0011.25 8h-2.5zM11 12.5a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 0111 12.5z" clipRule="evenodd" />
              <path d="M3.5 16.5a.75.75 0 01.75-.75h11a.75.75 0 010 1.5h-11A.75.75 0 013.5 16.5z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

function EventRowSkeleton() {
  return (
    <tr>
      <td className="px-6 py-4">
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-zinc-700" />
          <div className="h-3 w-48 animate-pulse rounded bg-zinc-700" />
        </div>
      </td>
      <td className="px-6 py-4"><div className="h-4 w-24 animate-pulse rounded bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-4 w-32 animate-pulse rounded bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-5 w-20 animate-pulse rounded-full bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-4 w-14 animate-pulse rounded bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-4 w-8 animate-pulse rounded bg-zinc-700" /></td>
      <td className="px-6 py-4"><div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-700" /></td>
    </tr>
  );
}

const TABLE_HEADERS = ["Event", "Host", "Starts", "Type", "Visibility", "Attendees", ""];

function TableHead() {
  return (
    <thead className="bg-zinc-800/60 text-left text-zinc-400">
      <tr>
        {TABLE_HEADERS.map((h, i) => (
          <th key={i} className="px-6 py-4 font-medium">
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function EventsTableSkeleton() {
  return (
    <div className="-mx-6 -mb-6 overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-800 text-sm">
        <TableHead />
        <tbody className="divide-y divide-zinc-800">
          {Array.from({ length: 8 }).map((_, i) => (
            <EventRowSkeleton key={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EventsPage() {
  const [activeTab, setActiveTab] = useState<EventFilter>("upcoming");
  const [tabCounts, setTabCounts] = useState({ upcoming: 0, past: 0 });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [viewingAttendees, setViewingAttendees] = useState<EventItem | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<EventItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadEvents(1);
  }, [debouncedSearch, activeTab]);

  useEffect(() => {
    fetchEventCounts().then(setTabCounts).catch(console.error);
  }, []);

  async function loadEvents(page: number) {
    setLoading(true);
    setLoadError(null);
    try {
      const { events, totalCount } = await fetchEvents(page, debouncedSearch, activeTab);
      setEvents(events);
      setTotalCount(totalCount);
      setCurrentPage(page);
    } catch (e: any) {
      setLoadError(e.message ?? "Failed to load events");
      setEvents([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }

  function goToPage(page: number) {
    loadEvents(page);
  }

  function handleTabChange(tabId: string) {
    setActiveTab(tabId as EventFilter);
  }

  function handleSaved(_updated: EventItem) {
    // Editing starts_at can move an event across the upcoming/past boundary,
    // so re-fetch the current page + counts instead of patching in place.
    setEditingEvent(null);
    loadEvents(currentPage);
    fetchEventCounts().then(setTabCounts).catch(console.error);
  }

  async function handleDelete() {
    if (!deletingEvent) return;

    try {
      await deleteEvent(deletingEvent.id);
      setEvents((prev) => prev.filter((e) => e.id !== deletingEvent.id));
      setTotalCount((prev) => prev - 1);
      setTabCounts((prev) => ({ ...prev, [activeTab]: Math.max(0, prev[activeTab] - 1) }));
      setDeletingEvent(null);
    } catch (e: any) {
      alert(e.message);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Events</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-50">Event management</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Browse, edit, and manage user-hosted events. View attendees or remove events that violate policy.
            </p>
          </div>
        </div>

        <Tabs
          tabs={[
            { id: "upcoming", label: "Active & upcoming", count: tabCounts.upcoming, color: "emerald" },
            { id: "past", label: "Past", count: tabCounts.past, color: "blue" },
          ]}
          defaultTab="upcoming"
          variant="segmented"
          onChange={handleTabChange}
          className="mt-5"
        />

        <div className="relative mt-5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or address…"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 pl-10 pr-4 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:bg-zinc-900 focus:ring-2 focus:ring-zinc-700"
          />
          {search !== debouncedSearch && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <svg className="h-4 w-4 animate-spin text-zinc-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
            </span>
          )}
        </div>

        <div className="mt-6">
          {loadError ? (
            <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">
              {loadError}
            </div>
          ) : loading && events.length === 0 ? (
            <EventsTableSkeleton />
          ) : events.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
              {debouncedSearch
                ? "No events match your search"
                : activeTab === "upcoming"
                ? "No active or upcoming events"
                : "No past events"}
            </div>
          ) : (
            <>
              <div className="-mx-6 -mb-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-800 text-sm">
                  <TableHead />
                  <tbody className="divide-y divide-zinc-800">
                    {events.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        onEdit={setEditingEvent}
                        onViewAttendees={setViewingAttendees}
                        onDelete={setDeletingEvent}
                      />
                    ))}
                    {loading && Array.from({ length: 3 }).map((_, i) => <EventRowSkeleton key={`sk-${i}`} />)}
                  </tbody>
                </table>
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={goToPage}
                totalItems={totalCount}
                pageSize={PAGE_SIZE}
              />
            </>
          )}
        </div>
      </div>

      {editingEvent && (
        <EditEventPanel
          key={editingEvent.id}
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={handleSaved}
        />
      )}

      {viewingAttendees && (
        <AttendeesPanel
          key={viewingAttendees.id}
          event={viewingAttendees}
          onClose={() => setViewingAttendees(null)}
        />
      )}

      {deletingEvent && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDeletingEvent(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-zinc-900 p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-zinc-50">Delete event?</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Are you sure you want to delete{" "}
                <span className="font-semibold">"{deletingEvent.name ?? "this event"}"</span>? This will also
                remove all attendee records. This action cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDeletingEvent(null)}
                  className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
                >
                  Delete event
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
