"use server";

import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { requireAdmin, MARKETING_ROLES, type CurrentAdmin } from "@/app/dashboard/lib/dal";
import {
  buildRouteContext,
  validateRouteFields,
  type NotificationRouteContext,
} from "@/lib/notifications/definitionTypes";
import type { NotificationTapDestination } from "@/lib/notifications/tapDestinations";
import { sterlingBroadcastPushExtras } from "@/lib/notifications/pushBranding";
import type { ProductNotificationCopy } from "@/lib/notifications/defaultProductNotificationCopy";
import { SYSTEM_NOTIFICATION_CATALOG } from "@/lib/notifications/systemNotificationCatalog";

const expo = new Expo();

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — notification admin requires service-role access."
    );
  }
}

// Mass push/inbox broadcasts reach every user on the platform.
async function requireBroadcastAdmin(): Promise<CurrentAdmin> {
  return requireAdmin(MARKETING_ROLES);
}

// Sent one-per-request (not batched via chunkPushNotifications) because Expo rejects
// an entire batch if it mixes tokens registered to different Expo/FCM projects, which
// happens with this data set. A modest concurrency limit avoids opening too many
// connections at once while still isolating failures to a single token.
const SEND_CONCURRENCY = 20;
const INBOX_INSERT_CHUNK_SIZE = 500;

// Fixed OS-level push title. The composed message (with **bold** markup) carries all
// the actual content and is what renders in the app's in-app notification inbox.
const PUSH_TITLE = "Sterling";

export type PushOutcome = { targeted: number; sent: number; failed: number; errors: string[] };
export type InboxOutcome = { targeted: number; inserted: number; errors: string[] };

export type BroadcastResult = {
  push: PushOutcome | null;
  inbox: InboxOutcome | null;
};

export type AudiencePreview = {
  pushRecipients: number;
  inboxRecipients: number;
};

function stripBoldMarkup(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}

async function resolvePushTokens(): Promise<string[]> {
  const { data: tokenRows, error: tokenErr } = await supabaseAdmin
    .from("user_push_tokens")
    .select("user_id,expo_push_token");
  if (tokenErr) throw new Error(tokenErr.message);

  const tokenToUser = new Map<string, string>();
  for (const row of tokenRows ?? []) {
    if (row.expo_push_token) tokenToUser.set(row.expo_push_token, row.user_id);
  }

  const userIds = [...new Set(tokenToUser.values())];
  const { data: settingsRows, error: settingsErr } = await supabaseAdmin
    .from("user_settings")
    .select("user_id,push_notifications")
    .in("user_id", userIds);
  if (settingsErr) throw new Error(settingsErr.message);

  const optedOut = new Set(
    ((settingsRows ?? []) as { user_id: string; push_notifications: boolean | null }[])
      .filter((s) => s.push_notifications === false)
      .map((s) => s.user_id)
  );

  return [...tokenToUser.entries()]
    .filter(([, userId]) => !optedOut.has(userId))
    .map(([token]) => token)
    .filter((token) => Expo.isExpoPushToken(token));
}

async function resolveInboxUserIds(): Promise<string[]> {
  const { data: profileRows, error: profileErr } = await supabaseAdmin.from("profiles").select("id");
  if (profileErr) throw new Error(profileErr.message);

  const allUserIds = ((profileRows ?? []) as { id: string }[]).map((p) => p.id);
  if (allUserIds.length === 0) return [];

  const { data: settingsRows, error: settingsErr } = await supabaseAdmin
    .from("user_settings")
    .select("user_id,in_app_notifications")
    .in("user_id", allUserIds);
  if (settingsErr) throw new Error(settingsErr.message);

  const optedOut = new Set(
    ((settingsRows ?? []) as { user_id: string; in_app_notifications: boolean | null }[])
      .filter((s) => s.in_app_notifications === false)
      .map((s) => s.user_id)
  );

  return allUserIds.filter((id) => !optedOut.has(id));
}

export async function fetchAudiencePreview(): Promise<AudiencePreview> {
  await requireAdmin(MARKETING_ROLES);
  requireServiceRole();

  const [pushTokens, inboxUserIds] = await Promise.all([resolvePushTokens(), resolveInboxUserIds()]);
  return { pushRecipients: pushTokens.length, inboxRecipients: inboxUserIds.length };
}

async function sendPushBroadcast(message: string): Promise<PushOutcome> {
  const targetTokens = await resolvePushTokens();
  if (targetTokens.length === 0) {
    return { targeted: 0, sent: 0, failed: 0, errors: [] };
  }

  const plainBody = stripBoldMarkup(message);
  const messages: ExpoPushMessage[] = targetTokens.map((token) => ({
    to: token,
    title: PUSH_TITLE,
    body: plainBody,
    sound: "default",
    ...sterlingBroadcastPushExtras(),
  }));

  let sent = 0;
  let failed = 0;
  const errorSet = new Set<string>();

  for (let i = 0; i < messages.length; i += SEND_CONCURRENCY) {
    const batch = messages.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((m) => expo.sendPushNotificationsAsync([m]))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const ticket = result.value[0];
        if (ticket.status === "ok") {
          sent++;
        } else {
          failed++;
          if (ticket.message) errorSet.add(ticket.message);
        }
      } else {
        failed++;
        errorSet.add(result.reason?.message || "Failed to send notification");
      }
    }
  }

  return { targeted: targetTokens.length, sent, failed, errors: [...errorSet] };
}

async function addInboxBroadcast(message: string): Promise<InboxOutcome> {
  const userIds = await resolveInboxUserIds();
  if (userIds.length === 0) {
    return { targeted: 0, inserted: 0, errors: [] };
  }

  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < userIds.length; i += INBOX_INSERT_CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + INBOX_INSERT_CHUNK_SIZE);
    // The mobile inbox only ever renders `title` for these; it parses **bold** markup
    // inline. `body` is unused for type "system" and left null.
    const rows = chunk.map((user_id) => ({
      user_id,
      type: "system",
      title: message,
      body: null,
    }));
    const { error } = await supabaseAdmin.from("notifications").insert(rows);
    if (error) {
      errors.push(error.message);
    } else {
      inserted += chunk.length;
    }
  }

  return { targeted: userIds.length, inserted, errors };
}

export async function sendBroadcastNotification(params: {
  message: string;
  sendPush: boolean;
  addToInbox: boolean;
}): Promise<BroadcastResult> {
  await requireBroadcastAdmin();
  requireServiceRole();
  const message = params.message.trim();
  if (!message) throw new Error("Message is required");
  if (!params.sendPush && !params.addToInbox) throw new Error("Choose at least one delivery method");

  const [push, inbox] = await Promise.all([
    params.sendPush ? sendPushBroadcast(message) : Promise.resolve(null),
    params.addToInbox ? addInboxBroadcast(message) : Promise.resolve(null),
  ]);

  return { push, inbox };
}

export type CustomBroadcastResult = {
  inbox: InboxOutcome | null;
  pushSent: number;
  pushFailed: number;
  pushErrors: string[];
};

async function invokePushForNotificationId(notificationId: string): Promise<boolean> {
  const { error } = await supabaseAdmin.functions.invoke("send-notification", {
    body: { notification_id: notificationId },
  });
  return !error;
}

export async function sendCustomTypeBroadcast(params: {
  customType: string;
  title: string;
  body: string | null;
  tap_destination: NotificationTapDestination;
  routeIds: {
    post_id?: string | null;
    discussion_id?: string | null;
    community_id?: string | null;
    actor_id?: string | null;
  };
  sendPush: boolean;
  addToInbox: boolean;
}): Promise<CustomBroadcastResult> {
  await requireBroadcastAdmin();
  requireServiceRole();
  const title = params.title.trim();
  if (!title) throw new Error("Title is required");
  if (!params.sendPush && !params.addToInbox) throw new Error("Choose at least one delivery method");

  const routeErr = validateRouteFields(params.tap_destination, {
    post_id: params.routeIds.post_id ?? undefined,
    discussion_id: params.routeIds.discussion_id ?? undefined,
    community_id: params.routeIds.community_id ?? undefined,
    actor_id: params.routeIds.actor_id ?? undefined,
  });
  if (routeErr) throw new Error(routeErr);

  const { data: def, error: defErr } = await supabaseAdmin
    .from("notification_type_definitions")
    .select("type,enabled")
    .eq("type", params.customType)
    .maybeSingle();
  if (defErr) throw new Error(defErr.message);
  if (!def?.enabled) throw new Error("Unknown or disabled custom notification type");

  const route_context: NotificationRouteContext = buildRouteContext({
    tap_destination: params.tap_destination,
    post_id: params.routeIds.post_id,
    discussion_id: params.routeIds.discussion_id,
    community_id: params.routeIds.community_id,
    actor_id: params.routeIds.actor_id,
  });

  const allUserIds = await resolveInboxUserIds();
  if (allUserIds.length === 0) {
    return { inbox: { targeted: 0, inserted: 0, errors: [] }, pushSent: 0, pushFailed: 0, pushErrors: [] };
  }

  let inserted = 0;
  const inboxErrors: string[] = [];
  const notificationIdsForPush: string[] = [];

  for (let i = 0; i < allUserIds.length; i += INBOX_INSERT_CHUNK_SIZE) {
    const chunk = allUserIds.slice(i, i + INBOX_INSERT_CHUNK_SIZE);
    const rows: Array<Record<string, unknown>> = [];

    for (const user_id of chunk) {
      const { data: inAppOk } = await supabaseAdmin.rpc("notification_delivery_allowed", {
        p_user_id: user_id,
        p_type: params.customType,
        p_channel: "in_app",
      });
      const { data: pushOk } = await supabaseAdmin.rpc("notification_delivery_allowed", {
        p_user_id: user_id,
        p_type: params.customType,
        p_channel: "push",
      });

      const allowInApp = params.addToInbox && inAppOk !== false;
      const allowPush = params.sendPush && pushOk !== false;
      if (!allowInApp && !allowPush) continue;

      const id = crypto.randomUUID();
      if (allowPush) notificationIdsForPush.push(id);

      if (allowInApp || allowPush) {
        rows.push({
          id,
          user_id,
          actor_id: params.routeIds.actor_id ?? null,
          type: params.customType,
          title,
          body: params.body?.trim() || null,
          post_id: params.routeIds.post_id ?? null,
          community_id: params.routeIds.community_id ?? null,
          discussion_id: params.routeIds.discussion_id ?? null,
          route_context,
        });
      }
    }

    if (rows.length === 0) continue;

    const { error } = await supabaseAdmin.from("notifications").insert(rows);
    if (error) {
      inboxErrors.push(error.message);
    } else {
      inserted += rows.length;
    }
  }

  let pushSent = 0;
  let pushFailed = 0;
  const pushErrors: string[] = [];

  if (params.sendPush && notificationIdsForPush.length > 0) {
    for (let i = 0; i < notificationIdsForPush.length; i += SEND_CONCURRENCY) {
      const batch = notificationIdsForPush.slice(i, i + SEND_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (nid) => {
          const ok = await invokePushForNotificationId(nid);
          return ok;
        }),
      );
      for (const ok of results) {
        if (ok) pushSent++;
        else {
          pushFailed++;
          pushErrors.push("send-notification invoke failed");
        }
      }
    }
  }

  return {
    inbox: params.addToInbox
      ? { targeted: allUserIds.length, inserted, errors: inboxErrors }
      : null,
    pushSent,
    pushFailed,
    pushErrors: [...new Set(pushErrors)],
  };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type NotificationTemplate = {
  id: string;
  name: string;
  message: string;
  created_at: string;
  updated_at: string;
};

// The table stores the template body under `body` (with a required `title`
// column we don't otherwise use), while the rest of this app treats a
// template as just a name + message. Map between the two shapes here.
function rowToTemplate(row: { id: string; name: string; body: string; created_at: string; updated_at: string }): NotificationTemplate {
  return { id: row.id, name: row.name, message: row.body, created_at: row.created_at, updated_at: row.updated_at };
}

export async function fetchTemplates(): Promise<NotificationTemplate[]> {
  await requireAdmin(MARKETING_ROLES);
  requireServiceRole();

  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .select("id,name,body,created_at,updated_at")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToTemplate);
}

export async function createTemplate(params: {
  name: string;
  message: string;
}): Promise<NotificationTemplate> {
  await requireAdmin(MARKETING_ROLES);
  requireServiceRole();

  const name = params.name.trim();
  const message = params.message.trim();
  if (!name || !message) throw new Error("Name and message are required");

  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .insert({ name, title: name, body: message })
    .select("id,name,body,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return rowToTemplate(data);
}

export async function updateTemplate(
  id: string,
  params: { name: string; message: string }
): Promise<NotificationTemplate> {
  await requireAdmin(MARKETING_ROLES);
  requireServiceRole();

  const name = params.name.trim();
  const message = params.message.trim();
  if (!name || !message) throw new Error("Name and message are required");

  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .update({ name, title: name, body: message, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,name,body,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return rowToTemplate(data);
}

export async function deleteTemplate(id: string): Promise<void> {
  await requireAdmin(MARKETING_ROLES);
  requireServiceRole();

  const { error } = await supabaseAdmin.from("notification_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Live inbox — rows actually stored in public.notifications
// ---------------------------------------------------------------------------

const ACTIVITY_PAGE_SIZE = 40;
const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVITY_STAT_SAMPLE = 4000;

export type NotificationActivityRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  userId: string;
  actorId: string | null;
  recipientLabel: string;
  actorLabel: string | null;
};

export type NotificationTypeStat = {
  type: string;
  count: number;
  latestTitle: string;
  latestAt: string;
};

export type NotificationActivity = {
  rows: NotificationActivityRow[];
  total: number;
  windowCount: number | null;
  unreadCount: number | null;
  statsTruncated: boolean;
  typeStats: NotificationTypeStat[];
};

type NotificationDbRow = {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  user_id: string;
  actor_id: string | null;
  is_read: boolean | null;
  created_at: string;
};

function cleanActivityType(value: string | null | undefined): string | null {
  const type = value?.trim() ?? "";
  if (!type || !/^[a-z0-9_]+$/i.test(type) || type.length > 80) return null;
  return type;
}

function cleanActivitySearch(value: string | null | undefined): string | null {
  const search = value?.trim().replace(/[%_]/g, "") ?? "";
  if (!search) return null;
  return search.slice(0, 80);
}

function profileLabel(
  profile: { username: string | null; full_name: string | null } | undefined,
  id: string,
): string {
  if (profile?.username) return `@${profile.username}`;
  if (profile?.full_name) return profile.full_name;
  return id.slice(0, 8);
}

export async function fetchNotificationActivity(params: {
  type?: string | null;
  search?: string | null;
  offset?: number;
  includeStats?: boolean;
}): Promise<NotificationActivity> {
  await requireAdmin(MARKETING_ROLES);
  requireServiceRole();

  const type = cleanActivityType(params.type);
  const search = cleanActivitySearch(params.search);
  const offset = Math.min(Math.max(0, params.offset ?? 0), 5000);
  const includeStats = params.includeStats !== false;
  const since = new Date(Date.now() - ACTIVITY_WINDOW_MS).toISOString();

  let listQuery = supabaseAdmin
    .from("notifications")
    .select("id,type,title,body,user_id,actor_id,is_read,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + ACTIVITY_PAGE_SIZE - 1);

  if (type) listQuery = listQuery.eq("type", type);
  if (search) listQuery = listQuery.ilike("title", `%${search}%`);

  const listPromise = listQuery;
  const samplePromise = includeStats
    ? supabaseAdmin
        .from("notifications")
        .select("type,title,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_STAT_SAMPLE)
    : Promise.resolve({ data: null, error: null });
  const windowPromise = includeStats
    ? supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).gte("created_at", since)
    : Promise.resolve({ count: null, error: null });
  const unreadPromise = includeStats
    ? supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since)
        .eq("is_read", false)
    : Promise.resolve({ count: null, error: null });

  const [listRes, sampleRes, windowRes, unreadRes] = await Promise.all([
    listPromise,
    samplePromise,
    windowPromise,
    unreadPromise,
  ]);

  if (listRes.error) throw new Error(listRes.error.message);
  if (sampleRes.error) throw new Error(sampleRes.error.message);
  if (windowRes.error) throw new Error(windowRes.error.message);
  if (unreadRes.error) throw new Error(unreadRes.error.message);

  const dbRows = (listRes.data ?? []) as NotificationDbRow[];
  const profileIds = [
    ...new Set(dbRows.flatMap((row) => [row.user_id, row.actor_id].filter((id): id is string => Boolean(id)))),
  ];

  const profiles = new Map<string, { username: string | null; full_name: string | null }>();
  if (profileIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,username,full_name")
      .in("id", profileIds);
    if (error) throw new Error(error.message);
    for (const profile of (data ?? []) as {
      id: string;
      username: string | null;
      full_name: string | null;
    }[]) {
      profiles.set(profile.id, profile);
    }
  }

  const sample = (sampleRes.data ?? []) as { type: string; title: string | null; created_at: string }[];
  const byType = new Map<string, NotificationTypeStat>();
  for (const row of sample) {
    const existing = byType.get(row.type);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byType.set(row.type, {
      type: row.type,
      count: 1,
      latestTitle: row.title?.trim() || row.type,
      latestAt: row.created_at,
    });
  }

  return {
    rows: dbRows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title?.trim() || "(no title)",
      body: row.body?.trim() || null,
      isRead: row.is_read === true,
      createdAt: row.created_at,
      userId: row.user_id,
      actorId: row.actor_id,
      recipientLabel: profileLabel(profiles.get(row.user_id), row.user_id),
      actorLabel: row.actor_id ? profileLabel(profiles.get(row.actor_id), row.actor_id) : null,
    })),
    total: listRes.count ?? dbRows.length,
    windowCount: includeStats ? (windowRes.count ?? 0) : null,
    unreadCount: includeStats ? (unreadRes.count ?? 0) : null,
    statsTruncated: includeStats && sample.length >= ACTIVITY_STAT_SAMPLE,
    typeStats: [...byType.values()].sort((a, b) => b.count - a.count),
  };
}

export type ProductNotificationCopyState = {
  copy: Record<string, ProductNotificationCopy>;
  removed: string[];
};

export async function fetchProductNotificationCopy(): Promise<ProductNotificationCopyState> {
  await requireAdmin(MARKETING_ROLES);
  requireServiceRole();
  const { data, error } = await supabaseAdmin
    .from("notification_product_copy")
    .select("type,title,body,removed");
  if (error) throw new Error(error.message);
  const copy: Record<string, ProductNotificationCopy> = {};
  const removed: string[] = [];
  for (const row of data ?? []) {
    const type = String(row.type ?? "").trim();
    if (!type) continue;
    if (row.removed === true) {
      removed.push(type);
      continue;
    }
    const title = String(row.title ?? "").trim();
    if (!title) continue;
    const body = String(row.body ?? "").trim();
    copy[type] = { title, body: body || null };
  }
  return { copy, removed };
}

export async function saveProductNotificationCopy(
  type: string,
  copy: ProductNotificationCopy,
): Promise<ProductNotificationCopy> {
  await requireAdmin(MARKETING_ROLES);
  requireServiceRole();
  const key = type.trim();
  const title = copy.title.trim();
  const body = copy.body?.trim() ? copy.body.trim() : null;
  if (!key || !title) throw new Error("Title is required");
  if (!SYSTEM_NOTIFICATION_CATALOG.some((row) => row.type === key)) {
    throw new Error("Unknown notification type");
  }
  const { error } = await supabaseAdmin.from("notification_product_copy").upsert(
    { type: key, title, body, removed: false, updated_at: new Date().toISOString() },
    { onConflict: "type" },
  );
  if (error) throw new Error(error.message);
  return { title, body };
}

export async function resetProductNotificationCopy(type: string): Promise<void> {
  await requireAdmin(MARKETING_ROLES);
  requireServiceRole();
  const key = type.trim();
  if (!key) return;
  const { error } = await supabaseAdmin.from("notification_product_copy").delete().eq("type", key);
  if (error) throw new Error(error.message);
}

export async function removeProductNotificationCopy(type: string): Promise<void> {
  await requireAdmin(MARKETING_ROLES);
  requireServiceRole();
  const key = type.trim();
  if (!key) return;
  if (!SYSTEM_NOTIFICATION_CATALOG.some((row) => row.type === key)) {
    throw new Error("Unknown notification type");
  }
  const { error } = await supabaseAdmin.from("notification_product_copy").upsert(
    { type: key, title: "Removed", body: null, removed: true, updated_at: new Date().toISOString() },
    { onConflict: "type" },
  );
  if (error) throw new Error(error.message);
}
