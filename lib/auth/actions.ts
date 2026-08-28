"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { fetchActiveSterlingAdminRole } from "@/app/dashboard/lib/dal";
import {
  MFA_REQUIRED_PATH,
  SIGN_IN_FAILED_MESSAGE,
  SIGN_IN_RATE_LIMIT_MESSAGE,
} from "@/lib/auth/constants";
import { checkLoginRateLimit } from "@/lib/auth/login-rate-limit";
import { getStaffMfaState } from "@/lib/auth/mfa";
import { getRequestClientMeta } from "@/lib/auth/request-meta";
import { logSecurityEvent } from "@/lib/auth/security-audit";
import { evaluateLoginSuspicion } from "@/lib/auth/suspicious-login";
import { getAuthUser } from "@/lib/auth/get-auth-user";
import {
  clearLoginOk,
  clearRememberedDevice,
  persistDeviceTrust,
  persistLoginOk,
  readRememberPreference,
  writeRememberPreference,
} from "@/lib/auth/device-trust";

export type LoginState = { error: string } | undefined;
export type MfaActionState = { error?: string; qrCode?: string; secret?: string; factorId?: string } | undefined;

async function assertStaffUser(userId: string) {
  return (await fetchActiveSterlingAdminRole(userId)) !== null;
}

async function completeStaffLogin(userId: string, remember: boolean) {
  await persistLoginOk(userId, remember);
  await persistDeviceTrust(userId, remember);
  redirect("/dashboard");
}

async function redirectAfterStaffAuth(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  remember: boolean,
  suspicious: boolean
) {
  if (suspicious) {
    await clearLoginOk();
    await persistDeviceTrust(userId, false);
    const mfaState = await getStaffMfaState(supabase);
    if (mfaState.status !== "ok") {
      redirect(MFA_REQUIRED_PATH);
    }
  }

  await completeStaffLogin(userId, remember);
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "1";
  const { ip, userAgent } = await getRequestClientMeta();

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const rateLimit = await checkLoginRateLimit({ ip, email });
  if (!rateLimit.allowed) {
    await logSecurityEvent({
      action: "login_rate_limited",
      ip,
      userAgent,
      email,
      outcome: rateLimit.reason,
    });
    return { error: SIGN_IN_RATE_LIMIT_MESSAGE };
  }

  await writeRememberPreference(remember);
  const supabase = await createSupabaseServerClient(remember);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await logSecurityEvent({
      action: "login_failed",
      ip,
      userAgent,
      email,
      outcome: "invalid_credentials",
    });
    return { error: SIGN_IN_FAILED_MESSAGE };
  }

  const isStaff = await assertStaffUser(data.user.id);
  if (!isStaff) {
    await supabase.auth.signOut();
    await logSecurityEvent({
      action: "login_failed",
      ip,
      userAgent,
      email,
      actorId: data.user.id,
      outcome: "not_staff",
    });
    return { error: SIGN_IN_FAILED_MESSAGE };
  }

  const suspicion = await evaluateLoginSuspicion({
    userId: data.user.id,
    ip,
    email,
  });

  await logSecurityEvent({
    action: "login_success",
    ip,
    userAgent,
    email,
    actorId: data.user.id,
    outcome: suspicion.suspicious
      ? remember
        ? "password_verified_suspicious_remember_device"
        : "password_verified_suspicious"
      : remember
        ? "password_verified_remember_device"
        : "password_verified",
    note: suspicion.reasons.join(",") || undefined,
  });

  await redirectAfterStaffAuth(supabase, data.user.id, remember, suspicion.suspicious);
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  const { ip, userAgent } = await getRequestClientMeta();
  const user = await getAuthUser(supabase);

  await supabase.auth.signOut();
  await clearRememberedDevice();

  if (user) {
    await logSecurityEvent({
      action: "logout",
      ip,
      userAgent,
      email: user.email ?? undefined,
      actorId: user.id,
      outcome: "signed_out",
    });
  }

  redirect("/");
}

async function unenrollUnverifiedTotpFactors(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
) {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const unverified =
    factors?.all?.filter(
      (factor) => factor.factor_type === "totp" && factor.status === "unverified"
    ) ?? [];
  await Promise.all(
    unverified.map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id }))
  );
}

export async function beginMfaEnroll(): Promise<MfaActionState> {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser(supabase);

  if (!user || !(await assertStaffUser(user.id))) {
    redirect("/");
  }

  await unenrollUnverifiedTotpFactors(supabase);

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Google Authenticator",
    issuer: "Sterling Admin",
  });

  if (error || !data?.totp) {
    return { error: "Could not start Google Authenticator setup. Try again." };
  }

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export async function completeMfaEnroll(
  _prevState: MfaActionState,
  formData: FormData
): Promise<MfaActionState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const { ip, userAgent } = await getRequestClientMeta();

  if (!factorId || !code) {
    return { error: "Enter the 6-digit code from Google Authenticator." };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser(supabase);

  if (!user || !(await assertStaffUser(user.id))) {
    redirect("/");
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { error: "Invalid code. Check Google Authenticator and try again." };
  }

  await logSecurityEvent({
    action: "mfa_enrolled",
    ip,
    userAgent,
    email: user.email ?? undefined,
    actorId: user.id,
    outcome: "totp_enrolled",
  });

  await completeStaffLogin(user.id, await readRememberPreference());
}

export async function verifyMfaSignIn(
  _prevState: MfaActionState,
  formData: FormData
): Promise<MfaActionState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const { ip, userAgent } = await getRequestClientMeta();

  if (!factorId || !code) {
    return { error: "Enter the 6-digit code from Google Authenticator." };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser(supabase);

  if (!user || !(await assertStaffUser(user.id))) {
    redirect("/");
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { error: "Invalid code. Check Google Authenticator and try again." };
  }

  await logSecurityEvent({
    action: "mfa_verified",
    ip,
    userAgent,
    email: user.email ?? undefined,
    actorId: user.id,
    outcome: "aal2",
  });

  await completeStaffLogin(user.id, await readRememberPreference());
}
