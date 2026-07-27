"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import {
  isValidCustomTypeSlug,
  normalizeCustomTypeSlug,
  NOTIFICATION_TAP_DESTINATIONS,
  type NotificationTapDestination,
} from "@/lib/notifications/tapDestinations";
import type { NotificationTypeDefinition } from "@/lib/notifications/definitionTypes";

function rowToDefinition(row: Record<string, unknown>): NotificationTypeDefinition {
  return row as unknown as NotificationTypeDefinition;
}

export async function listNotificationDefinitions(): Promise<NotificationTypeDefinition[]> {
  await getCurrentAdmin();
  const { data, error } = await supabaseAdmin
    .from("notification_type_definitions")
    .select("*")
    .order("display_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => rowToDefinition(r));
}

export async function createNotificationDefinition(params: {
  typeSlug: string;
  display_name: string;
  title_template: string;
  body_template?: string | null;
  tap_destination: NotificationTapDestination;
  enabled?: boolean;
}): Promise<NotificationTypeDefinition> {
  const admin = await getCurrentAdmin();
  const type = normalizeCustomTypeSlug(params.typeSlug);
  if (!isValidCustomTypeSlug(type)) {
    throw new Error("Type must match custom_[a-z0-9_]+");
  }
  if (!NOTIFICATION_TAP_DESTINATIONS.includes(params.tap_destination)) {
    throw new Error("Invalid tap destination");
  }
  const display_name = params.display_name.trim();
  const title_template = params.title_template.trim();
  if (!display_name || !title_template) throw new Error("Display name and title template are required");

  const { data, error } = await supabaseAdmin
    .from("notification_type_definitions")
    .insert({
      type,
      display_name,
      title_template,
      body_template: params.body_template?.trim() || null,
      tap_destination: params.tap_destination,
      trigger_mode: "manual",
      enabled: params.enabled ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: "notification_definition_create",
    detail: type,
    targetType: "notification_type_definition",
    targetId: (data as { id: string }).id,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return rowToDefinition(data as Record<string, unknown>);
}

export async function updateNotificationDefinition(
  id: string,
  params: {
    display_name: string;
    title_template: string;
    body_template?: string | null;
    tap_destination: NotificationTapDestination;
    enabled: boolean;
  },
): Promise<NotificationTypeDefinition> {
  const admin = await getCurrentAdmin();
  if (!NOTIFICATION_TAP_DESTINATIONS.includes(params.tap_destination)) {
    throw new Error("Invalid tap destination");
  }
  const display_name = params.display_name.trim();
  const title_template = params.title_template.trim();
  if (!display_name || !title_template) throw new Error("Display name and title template are required");

  const { data, error } = await supabaseAdmin
    .from("notification_type_definitions")
    .update({
      display_name,
      title_template,
      body_template: params.body_template?.trim() || null,
      tap_destination: params.tap_destination,
      enabled: params.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: "notification_definition_update",
    detail: (data as { type: string }).type,
    targetType: "notification_type_definition",
    targetId: id,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return rowToDefinition(data as Record<string, unknown>);
}

export async function setNotificationDefinitionEnabled(id: string, enabled: boolean): Promise<void> {
  const admin = await getCurrentAdmin();
  const { data, error } = await supabaseAdmin
    .from("notification_type_definitions")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("type")
    .single();
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: enabled ? "notification_definition_enable" : "notification_definition_disable",
    detail: (data as { type: string }).type,
    targetType: "notification_type_definition",
    targetId: id,
    actorId: admin.id,
    actorLabel: admin.email,
  });
}
