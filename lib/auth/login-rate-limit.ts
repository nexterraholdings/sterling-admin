import { supabaseAdmin } from "@/lib/supabase/server";
import {
  LOGIN_RATE_LIMIT_EMAIL,
  LOGIN_RATE_LIMIT_IP,
  LOGIN_RATE_LIMIT_WINDOW_MINUTES,
} from "@/lib/auth/constants";

type RateLimitResult = { allowed: true } | { allowed: false; reason: "ip" | "email" };

function windowStartIso() {
  return new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
}

async function countRecentLoginFailures(filter: {
  ip?: string;
  email?: string;
}): Promise<number> {
  let query = supabaseAdmin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("category", "security")
    .eq("action", "login_failed")
    .gte("created_at", windowStartIso());

  if (filter.ip) {
    query = query.ilike("detail", `%ip:${filter.ip}%`);
  }

  if (filter.email) {
    query = query.eq("actor_label", filter.email.toLowerCase());
  }

  const { count, error } = await query;
  if (error) {
    console.error("[login-rate-limit] failed to query audit logs:", error.message);
    return 0;
  }

  return count ?? 0;
}

export async function checkLoginRateLimit(params: {
  ip: string;
  email: string;
}): Promise<RateLimitResult> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const [ipFailures, emailFailures] = await Promise.all([
    countRecentLoginFailures({ ip: params.ip }),
    normalizedEmail ? countRecentLoginFailures({ email: normalizedEmail }) : Promise.resolve(0),
  ]);

  if (ipFailures >= LOGIN_RATE_LIMIT_IP) {
    return { allowed: false, reason: "ip" };
  }

  if (normalizedEmail && emailFailures >= LOGIN_RATE_LIMIT_EMAIL) {
    return { allowed: false, reason: "email" };
  }

  return { allowed: true };
}
