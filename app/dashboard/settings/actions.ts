"use server";

import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { OWNER_ROLES, requireAdmin } from "@/app/dashboard/lib/dal";
import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";

export type LocationGuardrailState = {
  enabled: boolean;
  updatedAt: string | null;
};

function assertServiceRole() {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — location guardrails require service-role access."
    );
  }
}

export async function fetchLocationGuardrails(): Promise<LocationGuardrailState> {
  await requireAdmin(OWNER_ROLES);
  assertServiceRole();

  const { data, error } = await supabaseAdmin
    .from("location_guardrail_settings")
    .select("enabled, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "Location guardrail settings are missing. Apply migration 20260923193000_location_guardrail_switch.sql."
    );
  }

  return {
    enabled: Boolean(data.enabled),
    updatedAt: data.updated_at ?? null,
  };
}

export async function setLocationGuardrails(enabled: boolean): Promise<LocationGuardrailState> {
  const admin = await requireAdmin(OWNER_ROLES);
  assertServiceRole();

  const { data, error } = await supabaseAdmin
    .from("location_guardrail_settings")
    .update({
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    })
    .eq("id", 1)
    .select("enabled, updated_at")
    .single();

  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "admin",
    action: enabled ? "location_guardrails_enabled" : "location_guardrails_disabled",
    detail: enabled ? "Turned location guardrails on" : "Turned location guardrails off",
    targetType: "location_guardrail_settings",
    targetId: "1",
    actorId: admin.id,
    actorLabel: admin.email ?? admin.fullName,
  });

  return {
    enabled: Boolean(data.enabled),
    updatedAt: data.updated_at ?? null,
  };
}
