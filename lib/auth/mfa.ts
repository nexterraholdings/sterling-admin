import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasLoginOk,
  hasTrustedDevice,
  persistLoginOk,
  readRememberPreference,
} from "@/lib/auth/device-trust";

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

/** Password is enough unless this session still has a pending suspicious-login challenge. */
export async function staffHasCompletedLoginChallenge(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (await hasLoginOk(userId)) return true;

  // Pre-change sessions used the trusted-device cookie to skip MFA.
  if (await hasTrustedDevice(userId)) {
    await persistLoginOk(userId, await readRememberPreference());
    return true;
  }

  const mfaState = await getStaffMfaState(supabase);
  return mfaState.status === "ok";
}
