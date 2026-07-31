"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";

const PAGE_SIZE = 20;

export type EventHost = {
  full_name: string | null;
  username: string | null;
  email: string | null;
} | null;

export type EventItem = {
  id: string;
  host_id: string | null;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  starts_at: string | null;
  duration_minutes: number | null;
  event_type: string | null;
  is_private: boolean | null;
  attendee_count: number | null;
  notes: string | null;
  created_at: string | null;
  host: EventHost;
};

export type EventAttendee = {
  user_id: string;
  joined_at: string | null;
  profile: EventHost;
};

export type EventFilter = "upcoming" | "past";

const EVENT_COLUMNS =
  "id,host_id,name,address,lat,lng,starts_at,duration_minutes,event_type,is_private,attendee_count,notes,created_at";

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — event management requires service-role access."
    );
  }
}

function escapeIlikeTerm(term: string): string {
  return term.replace(/[\\%,.():]/g, (c) => `\\${c}`);
}

async function attachHosts(events: Omit<EventItem, "host">[]): Promise<EventItem[]> {
  const hostIds = [...new Set(events.map((e) => e.host_id).filter(Boolean))] as string[];
  if (hostIds.length === 0) {
    return events.map((e) => ({ ...e, host: null }));
  }

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,username,email")
    .in("id", hostIds);
  if (error) throw new Error(error.message);

  const hostById = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; username: string | null; email: string | null }[]).map(
      (p) => [p.id, { full_name: p.full_name, username: p.username, email: p.email }]
    )
  );

  return events.map((e) => ({ ...e, host: (e.host_id && hostById.get(e.host_id)) || null }));
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchEvents(
  page: number,
  search = "",
  filter: EventFilter = "upcoming"
): Promise<{ events: EventItem[]; totalCount: number }> {
  await getCurrentAdmin();
  requireServiceRole();

  const offset = (page - 1) * PAGE_SIZE;
  const now = new Date().toISOString();

  let countQuery = supabaseAdmin.from("events").select("*", { count: "exact", head: true });
  let dataQuery = supabaseAdmin
    .from("events")
    .select(EVENT_COLUMNS)
    .range(offset, offset + PAGE_SIZE - 1);

  if (filter === "upcoming") {
    countQuery = countQuery.gte("starts_at", now);
    dataQuery = dataQuery.gte("starts_at", now).order("starts_at", { ascending: true });
  } else {
    countQuery = countQuery.lt("starts_at", now);
    dataQuery = dataQuery.lt("starts_at", now).order("starts_at", { ascending: false });
  }

  if (search.trim()) {
    const term = escapeIlikeTerm(search.trim());
    const orFilter = `name.ilike.%${term}%,address.ilike.%${term}%`;
    countQuery = countQuery.or(orFilter);
    dataQuery = dataQuery.or(orFilter);
  }

  const [{ count, error: countError }, { data, error }] = await Promise.all([countQuery, dataQuery]);
  if (countError) throw new Error(countError.message);
  if (error) throw new Error(error.message);

  const events = await attachHosts((data ?? []) as Omit<EventItem, "host">[]);

  return { events, totalCount: count ?? 0 };
}

export async function fetchEventById(id: string): Promise<EventItem | null> {
  await getCurrentAdmin();
  requireServiceRole();

  const { data, error } = await supabaseAdmin
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const [event] = await attachHosts([data as Omit<EventItem, "host">]);
  return event ?? null;
}

export async function fetchEventCounts(): Promise<{ upcoming: number; past: number }> {
  await getCurrentAdmin();
  requireServiceRole();

  const now = new Date().toISOString();

  const [{ count: upcoming, error: upcomingError }, { count: past, error: pastError }] = await Promise.all([
    supabaseAdmin.from("events").select("*", { count: "exact", head: true }).gte("starts_at", now),
    supabaseAdmin.from("events").select("*", { count: "exact", head: true }).lt("starts_at", now),
  ]);

  if (upcomingError) throw new Error(upcomingError.message);
  if (pastError) throw new Error(pastError.message);

  return { upcoming: upcoming ?? 0, past: past ?? 0 };
}

export async function fetchEventAttendees(eventId: string): Promise<EventAttendee[]> {
  await getCurrentAdmin();
  requireServiceRole();

  const { data, error } = await supabaseAdmin
    .from("event_attendees")
    .select("user_id,joined_at")
    .eq("event_id", eventId)
    .order("joined_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as { user_id: string; joined_at: string | null }[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  if (userIds.length === 0) return [];

  const { data: profiles, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,username,email")
    .in("id", userIds);
  if (profileErr) throw new Error(profileErr.message);

  const profileById = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; username: string | null; email: string | null }[]).map(
      (p) => [p.id, { full_name: p.full_name, username: p.username, email: p.email }]
    )
  );

  return rows.map((r) => ({
    user_id: r.user_id,
    joined_at: r.joined_at,
    profile: profileById.get(r.user_id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function updateEvent(
  id: string,
  updates: {
    name?: string | null;
    event_type?: string | null;
    is_private?: boolean | null;
    duration_minutes?: number | null;
    starts_at?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();

  const { error } = await supabaseAdmin.from("events").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteEvent(id: string): Promise<void> {
  const admin = await getCurrentAdmin();
  requireServiceRole();

  const { data: before, error: fetchError } = await supabaseAdmin
    .from("events")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "moderation",
    action: "delete_event",
    detail: `Deleted event "${before?.name ?? id}"`,
    targetType: "event",
    targetId: id,
    actorId: admin.id,
    actorLabel: admin.email,
  });
}

export async function removeEventAttendee(eventId: string, userId: string): Promise<void> {
  const admin = await getCurrentAdmin();
  requireServiceRole();

  const { error } = await supabaseAdmin
    .from("event_attendees")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "moderation",
    action: "remove_event_attendee",
    detail: `Removed attendee ${userId} from event ${eventId}`,
    targetType: "event",
    targetId: eventId,
    actorId: admin.id,
    actorLabel: admin.email,
  });
}
