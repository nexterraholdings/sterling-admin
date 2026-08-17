import { supabaseAdmin } from "@/lib/supabase/server";
import { hasTrustedDevice } from "@/lib/auth/device-trust";
import { hasRecentFailedLogins } from "@/lib/auth/login-rate-limit";

export type LoginSuspicion = {
  suspicious: boolean;
  reasons: string[];
};

function ipDetailNeedle(ip: string) {
  // formatSecurityDetail writes `ip:${ip} outcome:...`
  return `ip:${ip} `;
}

async function countPriorSuccessfulLogins(userId: string, ip?: string): Promise<number> {
  let query = supabaseAdmin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("category", "security")
    .eq("action", "login_success")
    .eq("actor_id", userId);

  if (ip) {
    query = query.ilike("detail", `%${ipDetailNeedle(ip)}%`);
  }

  const { count, error } = await query;
  if (error) {
    console.error("[suspicious-login] failed to query prior logins:", error.message);
    return 0;
  }

  return count ?? 0;
}

export async function evaluateLoginSuspicion(params: {
  userId: string;
  ip: string;
  email: string;
}): Promise<LoginSuspicion> {
  const reasons: string[] = [];
  const [recentFailures, priorLogins, knownIpCount, trusted] = await Promise.all([
    hasRecentFailedLogins(params.email),
    countPriorSuccessfulLogins(params.userId),
    params.ip && params.ip !== "unknown"
      ? countPriorSuccessfulLogins(params.userId, params.ip)
      : Promise.resolve(0),
    hasTrustedDevice(params.userId),
  ]);

  if (recentFailures) {
    reasons.push("recent_failed_attempts");
  }

  // First-ever sign-in is not unusual; there is no baseline yet.
  if (priorLogins > 0 && !trusted && knownIpCount === 0) {
    reasons.push("unrecognized_device_and_network");
  }

  return { suspicious: reasons.length > 0, reasons };
}
