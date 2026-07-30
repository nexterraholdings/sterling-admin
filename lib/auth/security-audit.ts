import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { formatSecurityDetail } from "@/lib/auth/request-meta";

type SecurityAuditAction =
  | "login_success"
  | "login_failed"
  | "login_rate_limited"
  | "logout"
  | "mfa_enrolled"
  | "mfa_verified";

export async function logSecurityEvent(params: {
  action: SecurityAuditAction;
  ip: string;
  userAgent: string;
  email?: string;
  actorId?: string | null;
  outcome: string;
  note?: string;
}) {
  await logAdminAction({
    category: "security",
    action: params.action,
    actorId: params.actorId ?? null,
    actorLabel: params.email?.toLowerCase() ?? null,
    detail: formatSecurityDetail({
      ip: params.ip,
      userAgent: params.userAgent,
      email: params.email,
      outcome: params.outcome,
      note: params.note,
    }),
  });
}
