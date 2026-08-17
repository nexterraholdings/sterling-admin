import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  DEVICE_TRUST_COOKIE,
  LOGIN_OK_COOKIE,
  REMEMBER_DEVICE_COOKIE,
  REMEMBER_DEVICE_MAX_AGE_SECONDS,
} from "@/lib/auth/constants";
import { rememberDeviceEnabled } from "@/lib/auth/session-cookies";

function cookieBaseOptions(remember: boolean) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: REMEMBER_DEVICE_MAX_AGE_SECONDS } : {}),
  };
}

function trustSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to trust a device");
  }
  return secret;
}

function signPayload(payload: string) {
  return createHmac("sha256", trustSecret()).update(payload).digest("base64url");
}

function signaturesMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createDeviceTrustValue(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + REMEMBER_DEVICE_MAX_AGE_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${signPayload(payload)}`;
}

export function trustedUserIdFromValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, signature] = parts;
  const exp = Number(expRaw);
  if (!userId || !signature || !Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return null;
  }
  const payload = `${userId}.${expRaw}`;
  if (!signaturesMatch(signature, signPayload(payload))) return null;
  return userId;
}

export async function writeRememberPreference(remember: boolean): Promise<void> {
  const store = await cookies();
  store.set(REMEMBER_DEVICE_COOKIE, remember ? "1" : "0", cookieBaseOptions(remember));
}

export async function readRememberPreference(): Promise<boolean> {
  const store = await cookies();
  return rememberDeviceEnabled(store.get(REMEMBER_DEVICE_COOKIE)?.value);
}

export async function persistDeviceTrust(userId: string, remember: boolean): Promise<void> {
  const store = await cookies();
  if (!remember) {
    store.set(DEVICE_TRUST_COOKIE, "", { ...cookieBaseOptions(false), maxAge: 0 });
    return;
  }
  store.set(DEVICE_TRUST_COOKIE, createDeviceTrustValue(userId), cookieBaseOptions(true));
}

export async function hasTrustedDevice(userId: string): Promise<boolean> {
  const store = await cookies();
  return trustedUserIdFromValue(store.get(DEVICE_TRUST_COOKIE)?.value) === userId;
}

export async function persistLoginOk(userId: string, remember: boolean): Promise<void> {
  const store = await cookies();
  store.set(LOGIN_OK_COOKIE, createDeviceTrustValue(userId), cookieBaseOptions(remember));
}

export async function hasLoginOk(userId: string): Promise<boolean> {
  const store = await cookies();
  return trustedUserIdFromValue(store.get(LOGIN_OK_COOKIE)?.value) === userId;
}

export async function clearLoginOk(): Promise<void> {
  const store = await cookies();
  store.set(LOGIN_OK_COOKIE, "", { ...cookieBaseOptions(false), maxAge: 0 });
}

export async function clearRememberedDevice(): Promise<void> {
  const store = await cookies();
  const expired = { ...cookieBaseOptions(false), maxAge: 0 };
  store.set(REMEMBER_DEVICE_COOKIE, "", expired);
  store.set(DEVICE_TRUST_COOKIE, "", expired);
  store.set(LOGIN_OK_COOKIE, "", expired);
}
