import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffMfaState =
  | { status: "ok" }
  | { status: "enroll" }
  | { status: "verify"; factorId: string };

export async function getStaffMfaState(
  supabase: SupabaseClient
): Promise<StaffMfaState> {
  const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] =
    await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

  if (factorsError) {
    console.error("[mfa] factor lookup failed:", factorsError.message);
    return { status: "enroll" };
  }

  const verifiedTotp =
    factors?.totp?.filter((factor) => factor.status === "verified") ?? [];

  if (verifiedTotp.length === 0) {
    return { status: "enroll" };
  }

  if (assuranceError) {
    console.error("[mfa] assurance lookup failed:", assuranceError.message);
    return { status: "verify", factorId: verifiedTotp[0]!.id };
  }

  if (assurance?.currentLevel !== "aal2" && assurance?.nextLevel === "aal2") {
    return { status: "verify", factorId: verifiedTotp[0]!.id };
  }

  return { status: "ok" };
}

export async function requireStaffMfaSession(
  supabase: SupabaseClient
): Promise<StaffMfaState> {
  return getStaffMfaState(supabase);
}
