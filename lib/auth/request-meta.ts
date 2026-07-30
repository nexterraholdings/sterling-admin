import { headers } from "next/headers";

export async function getRequestClientMeta() {
  const headerStore = await headers();

  const forwardedFor = headerStore.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip")?.trim() ||
    "unknown";

  const userAgent = headerStore.get("user-agent") ?? "unknown";

  return { ip, userAgent };
}

export function formatSecurityDetail(meta: {
  ip: string;
  userAgent: string;
  email?: string;
  outcome: string;
  note?: string;
}) {
  const parts = [`ip:${meta.ip}`, `outcome:${meta.outcome}`, `ua:${meta.userAgent.slice(0, 180)}`];
  if (meta.email) parts.push(`email:${meta.email}`);
  if (meta.note) parts.push(`note:${meta.note}`);
  return parts.join(" ");
}
