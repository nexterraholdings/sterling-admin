"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { requireAdmin, MARKETING_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type StarApplication,
} from "./data";

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — Sterling Star applicants require service-role access."
    );
  }
}

async function assertAdmin(): Promise<Awaited<ReturnType<typeof requireAdmin>>> {
  const admin = await requireAdmin(MARKETING_ROLES);
  requireServiceRole();
  return admin;
}

function isStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export async function fetchStarApplications(params?: {
  status?: ApplicationStatus | "all";
  query?: string;
}): Promise<StarApplication[]> {
  await assertAdmin();

  let query = supabaseAdmin
    .from("sterling_star_applications")
    .select(
      "id,full_name,email,socials,age,city,state,country,status,notes,source,created_at,updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  const search = params?.query?.trim();
  if (search) {
    const escaped = search.replace(/[\\%,.():]/g, (c) => `\\${c}`);
    query = query.or(
      `full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,city.ilike.%${escaped}%,country.ilike.%${escaped}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as StarApplication[];
}

export async function updateStarApplication(params: {
  id: string;
  status?: ApplicationStatus;
  notes?: string;
}): Promise<StarApplication> {
  const admin = await assertAdmin();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.status) {
    if (!isStatus(params.status)) throw new Error("Invalid status");
    patch.status = params.status;
  }
  if (params.notes !== undefined) {
    patch.notes = params.notes.trim() || null;
  }

  const { data, error } = await supabaseAdmin
    .from("sterling_star_applications")
    .update(patch)
    .eq("id", params.id)
    .select(
      "id,full_name,email,socials,age,city,state,country,status,notes,source,created_at,updated_at"
    )
    .single();

  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: "sterling_star_application_updated",
    targetType: "sterling_star_application",
    targetId: params.id,
    actorId: admin.id,
    actorLabel: admin.email,
    detail: `status:${data.status} name:${data.full_name} email:${data.email}`,
  });

  return data as StarApplication;
}
