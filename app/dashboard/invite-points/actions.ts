"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction, describeUser } from "@/app/dashboard/lib/audit-log";

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — invite point adjustments require service-role access."
    );
  }
}

function escapeIlikeTerm(term: string): string {
  return term.replace(/[\\%,.():]/g, (c) => `\\${c}`);
}

async function assertAdmin(): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();
}

export type UserSearchResult = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  referral_count: number;
};

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  await assertAdmin();
  const term = query.trim();
  if (!term) return [];

  const escaped = escapeIlikeTerm(term);
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email,username,full_name,referral_count")
    .or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,username.ilike.%${escaped}%`)
    .order("full_name", { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({ ...row, referral_count: row.referral_count ?? 0 }));
}

export type InvitePointAdjustment = {
  id: string;
  target_user_id: string;
  points_delta: number;
  reason: string;
  created_by_admin_id: string;
  created_at: string;
  new_referral_count: number;
};

export async function adjustInvitePoints(params: {
  targetUserId: string;
  pointsDelta: number;
  reason: string;
}): Promise<InvitePointAdjustment> {
  await assertAdmin();
  const admin = await getCurrentAdmin();
  const reason = params.reason.trim();

  if (!Number.isInteger(params.pointsDelta) || params.pointsDelta === 0) {
    throw new Error("Points must be a nonzero whole number");
  }
  if (!reason) {
    throw new Error("Reason is required");
  }

  const { data, error } = await supabaseAdmin
    .rpc("admin_adjust_invite_points", {
      p_target_user_id: params.targetUserId,
      p_points_delta: params.pointsDelta,
      p_reason: reason,
      p_admin_id: admin.id,
    })
    .single();
  if (error) throw new Error(error.message);

  const adjustment = data as InvitePointAdjustment;

  await logAdminAction({
    category: "admin",
    action: "adjust_invite_points",
    detail: `${params.pointsDelta > 0 ? "+" : ""}${params.pointsDelta} invite points for ${await describeUser(
      params.targetUserId
    )}: ${reason} (new balance: ${adjustment.new_referral_count})`,
    targetType: "user",
    targetId: params.targetUserId,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return adjustment;
}

export type RecentAdjustment = Omit<InvitePointAdjustment, "new_referral_count"> & {
  // The table only stores the delta, not a historical balance snapshot — this is
  // the target user's *current* referral_count, not the balance right after this
  // particular adjustment (later adjustments may have changed it since).
  current_referral_count: number;
  target: { email: string | null; username: string | null; full_name: string | null } | null;
  admin: { email: string | null; username: string | null; full_name: string | null } | null;
};

type AdjustmentRow = {
  id: string;
  target_user_id: string;
  points_delta: number;
  reason: string;
  created_by_admin_id: string;
  created_at: string;
};

type ProfileStub = { id: string; email: string | null; username: string | null; full_name: string | null; referral_count: number | null };

async function enrichAdjustments(rows: AdjustmentRow[]): Promise<RecentAdjustment[]> {
  const userIds = [...new Set(rows.flatMap((r) => [r.target_user_id, r.created_by_admin_id]))];
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabaseAdmin.from("profiles").select("id,email,username,full_name,referral_count").in("id", userIds)
    : { data: [] as ProfileStub[], error: null };
  if (profilesError) throw new Error(profilesError.message);

  const profileMap = new Map<string, ProfileStub>(((profiles as ProfileStub[]) ?? []).map((p) => [p.id, p]));

  return rows.map((r) => {
    const target = profileMap.get(r.target_user_id);
    return {
      ...r,
      current_referral_count: target?.referral_count ?? 0,
      target: target ? { email: target.email, username: target.username, full_name: target.full_name } : null,
      admin: profileMap.has(r.created_by_admin_id)
        ? {
            email: profileMap.get(r.created_by_admin_id)!.email,
            username: profileMap.get(r.created_by_admin_id)!.username,
            full_name: profileMap.get(r.created_by_admin_id)!.full_name,
          }
        : null,
    };
  });
}

export async function fetchRecentAdjustments(limit = 20): Promise<RecentAdjustment[]> {
  await assertAdmin();
  const { data, error } = await supabaseAdmin
    .from("admin_invite_point_adjustments")
    .select("id,target_user_id,points_delta,reason,created_by_admin_id,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return enrichAdjustments((data ?? []) as AdjustmentRow[]);
}

// Powers the "history for this user" list shown once a target is selected, so an
// admin can see prior grants/deductions before adding another one.
export async function fetchAdjustmentsForUser(userId: string, limit = 5): Promise<RecentAdjustment[]> {
  await assertAdmin();
  const { data, error } = await supabaseAdmin
    .from("admin_invite_point_adjustments")
    .select("id,target_user_id,points_delta,reason,created_by_admin_id,created_at")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return enrichAdjustments((data ?? []) as AdjustmentRow[]);
}
