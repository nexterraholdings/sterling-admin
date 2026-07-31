"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";

export type AuditCategory = "moderation" | "admin" | "security" | "system";

export type AuditLogEntry = {
  id: string;
  category: AuditCategory;
  action: string;
  actor_label: string | null;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  created_at: string;
};

const AUDIT_PAGE_SIZE = 20;

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — audit logs require service-role access."
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

export async function fetchAuditLogs(
  page: number,
  category?: AuditCategory,
  search = ""
): Promise<{ logs: AuditLogEntry[]; totalCount: number }> {
  await assertAdmin();
  const offset = (page - 1) * AUDIT_PAGE_SIZE;

  let countQuery = supabaseAdmin
    .from("audit_logs")
    .select("id", { count: "exact", head: true });

  let dataQuery = supabaseAdmin
    .from("audit_logs")
    .select("id,category,action,actor_label,target_type,target_id,detail,created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + AUDIT_PAGE_SIZE - 1);

  if (category) {
    countQuery = countQuery.eq("category", category);
    dataQuery = dataQuery.eq("category", category);
  }

  if (search.trim()) {
    const term = escapeIlikeTerm(search.trim());
    const filter = `actor_label.ilike.%${term}%,detail.ilike.%${term}%,action.ilike.%${term}%,target_id.ilike.%${term}%`;
    countQuery = countQuery.or(filter);
    dataQuery = dataQuery.or(filter);
  }

  const [{ count }, { data, error }] = await Promise.all([countQuery, dataQuery]);
  if (error) throw new Error(error.message);

  return { logs: data ?? [], totalCount: count ?? 0 };
}

export async function fetchAuditLogCounts(): Promise<Record<AuditCategory | "all", number>> {
  await assertAdmin();
  const categories: AuditCategory[] = ["moderation", "admin", "security", "system"];

  const [allRes, ...categoryRes] = await Promise.all([
    supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true }),
    ...categories.map((category) =>
      supabaseAdmin
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("category", category)
    ),
  ]);

  const counts = { all: allRes.count ?? 0 } as Record<AuditCategory | "all", number>;
  categories.forEach((category, i) => {
    counts[category] = categoryRes[i].count ?? 0;
  });
  return counts;
}
