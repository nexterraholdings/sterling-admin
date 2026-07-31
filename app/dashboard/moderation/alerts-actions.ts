"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction, describeUser } from "@/app/dashboard/lib/audit-log";

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — moderation alerts require service-role access."
    );
  }
}

async function assertAdmin(): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();
}

export type AlertActionType = "message" | "post" | "comment";
export type AlertWindowLabel = "standard" | "severe";
export type AlertSeverity = "standard" | "severe";
export type AlertStatus = "pending" | "reviewed" | "dismissed";

export type ModerationAlert = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_username: string | null;
  alert_type: string;
  action_type: AlertActionType;
  action_count: number;
  window_label: AlertWindowLabel;
  severity: AlertSeverity;
  details: { timeout_minutes?: number; reason?: string } | null;
  status: AlertStatus;
  created_at: string;
};

export type ActionEvent = {
  id: string;
  user_id: string;
  action_type: string;
  target_id: string | null;
  created_at: string;
};

export async function fetchModerationAlerts(): Promise<ModerationAlert[]> {
  await assertAdmin();
  const { data, error } = await supabaseAdmin.rpc("admin_get_moderation_alerts");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function resolveModerationAlert(
  alertId: string,
  status: "reviewed" | "dismissed"
): Promise<void> {
  await assertAdmin();
  const { error } = await supabaseAdmin.rpc("admin_resolve_moderation_alert", {
    p_alert_id: alertId,
    p_status: status,
  });
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "moderation",
    action: "resolve_moderation_alert",
    detail: `Marked automated abuse alert ${alertId} as ${status}`,
    targetType: "moderation_alert",
    targetId: alertId,
  });
}

export async function fetchRecentUserActivity(userId: string, limit = 25): Promise<ActionEvent[]> {
  await assertAdmin();
  const { data, error } = await supabaseAdmin
    .from("action_events")
    .select("id,user_id,action_type,target_id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function unbanUserFromAlert(userId: string): Promise<void> {
  await assertAdmin();
  const { error } = await supabaseAdmin.rpc("admin_unban_user", { p_user_id: userId });
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "moderation",
    action: "unban_user",
    detail: `Lifted automated rate-limit ban on ${await describeUser(userId)}`,
    targetType: "user",
    targetId: userId,
  });
}
