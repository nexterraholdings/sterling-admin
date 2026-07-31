"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction, describeUser } from "@/app/dashboard/lib/audit-log";

export type BanType = "general" | "harassment" | "spam" | "content_violation";

export type ActiveBan = {
  ban_id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  ban_type: BanType;
  reason: string;
  banned_by: string | null;
  expires_at: string | null;
  created_at: string;
};

export type ActiveDeviceBan = {
  ban_id: string;
  device_id: string;
  linked_user_id: string | null;
  full_name: string | null;
  reason: string;
  expires_at: string | null;
  created_at: string;
};

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — ban management requires service-role access."
    );
  }
}

async function assertAdmin(): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();
}

export async function fetchActiveBans(): Promise<ActiveBan[]> {
  await assertAdmin();
  const { data, error } = await supabaseAdmin.rpc("admin_get_active_bans");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchActiveDeviceBans(): Promise<ActiveDeviceBan[]> {
  await assertAdmin();
  const { data, error } = await supabaseAdmin.rpc("admin_get_active_device_bans");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function unbanUser(userId: string): Promise<void> {
  await assertAdmin();
  const { error } = await supabaseAdmin.rpc("admin_unban_user", {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "moderation",
    action: "unban_user",
    detail: `Lifted ban on ${await describeUser(userId)}`,
    targetType: "user",
    targetId: userId,
  });
}

export async function banUser(params: {
  userId: string;
  reason: string;
  banType: BanType;
  expiresAt: string | null;
  alsoBanDevices: boolean;
}): Promise<void> {
  await assertAdmin();
  const { error } = await supabaseAdmin.rpc("admin_ban_user", {
    p_user_id: params.userId,
    p_reason: params.reason,
    p_ban_type: params.banType,
    p_expires_at: params.expiresAt,
    p_also_ban_devices: params.alsoBanDevices,
  });
  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "moderation",
    action: "ban_user",
    detail: `Banned ${await describeUser(params.userId)} (${params.banType}): ${params.reason}${
      params.alsoBanDevices ? " — devices also banned" : ""
    }`,
    targetType: "user",
    targetId: params.userId,
  });
}
