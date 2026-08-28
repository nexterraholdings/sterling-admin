"use client";

import Image from "next/image";
import { useActionState, useEffect, useState, useTransition } from "react";
import logo from "@/assets/MobileAppLogo.png";
import {
  beginMfaEnroll,
  completeMfaEnroll,
  verifyMfaSignIn,
  type MfaActionState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GOOGLE_AUTHENTICATOR_IOS =
  "https://apps.apple.com/app/google-authenticator/id388497605";
const GOOGLE_AUTHENTICATOR_ANDROID =
  "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2";

type MfaScreenProps = {
  mode: "enroll" | "verify";
  factorId?: string;
};

export function MfaScreen({ mode, factorId: initialFactorId }: MfaScreenProps) {
  const [enrollState, setEnrollState] = useState<MfaActionState>();
  const [isStartingEnroll, startEnrollTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [completeState, completeAction, completePending] = useActionState(completeMfaEnroll, undefined);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyMfaSignIn, undefined);

  const activeFactorId = enrollState?.factorId ?? initialFactorId ?? "";
  const qrCode = enrollState?.qrCode;
  const secret = enrollState?.secret;
  const error = enrollState?.error ?? completeState?.error ?? verifyState?.error;
  const pending = completePending || verifyPending;

  useEffect(() => {
    if (mode === "enroll" && !enrollState && !isStartingEnroll) {
      startEnrollTransition(async () => {
        const result = await beginMfaEnroll();
        setEnrollState(result);
      });
    }
  }, [mode, enrollState, isStartingEnroll]);

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent)]"
      />

      <div className="relative w-full max-w-lg rounded-3xl border border-zinc-800/90 bg-zinc-900/70 p-8 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)] backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative size-11 overflow-hidden rounded-2xl ring-1 ring-emerald-500/20">
            <Image src={logo} alt="Sterling" fill className="object-cover" priority />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-50">Sterling Admin</p>
            <p className="text-xs text-zinc-500">Google Authenticator</p>
          </div>
        </div>

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400/90">
            Unusual sign-in
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">
            {mode === "enroll" ? "Set up Google Authenticator" : "Enter your Google Authenticator code"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {mode === "enroll"
              ? "This sign-in looks unusual. Scan the QR code with Google Authenticator, then enter the 6-digit code to continue."
              : "This sign-in looks unusual. Open Google Authenticator and enter the 6-digit code for Sterling Admin."}
          </p>
        </div>

        {mode === "enroll" ? (
          <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-400">
            <li>
              Install Google Authenticator from the{" "}
              <a
                href={GOOGLE_AUTHENTICATOR_IOS}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-300 underline-offset-4 hover:underline"
              >
                App Store
              </a>{" "}
              or{" "}
              <a
                href={GOOGLE_AUTHENTICATOR_ANDROID}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-300 underline-offset-4 hover:underline"
              >
                Google Play
              </a>
              .
            </li>
            <li>Tap + and choose Scan a QR code.</li>
            <li>Enter the 6-digit code shown for Sterling Admin.</li>
          </ol>
        ) : null}

        {mode === "enroll" && isStartingEnroll && !qrCode ? (
          <p className="mt-8 text-sm text-zinc-500">Preparing your Google Authenticator setup…</p>
        ) : null}

        {mode === "enroll" && qrCode ? (
          <div className="mt-8 space-y-4">
            <div className="mx-auto flex max-w-[220px] justify-center rounded-2xl bg-white p-4">
              {/* Supabase returns an SVG data URI for the TOTP QR code. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="Google Authenticator QR code" className="h-auto w-full" />
            </div>
            {secret ? (
              <div className="space-y-2 text-center">
                <p className="break-all font-mono text-xs text-zinc-500">
                  Can’t scan? Enter this key in Google Authenticator: {secret}
                </p>
                <button
                  type="button"
                  onClick={() => void copySecret()}
                  className="text-xs font-medium text-emerald-300 underline-offset-4 hover:underline"
                >
                  {copied ? "Copied" : "Copy setup key"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {(mode === "verify" || (mode === "enroll" && activeFactorId)) && (
          <form
            action={mode === "enroll" ? completeAction : verifyAction}
            className="mt-8 space-y-5"
          >
            <input type="hidden" name="factorId" value={activeFactorId} />

            <div className="space-y-2">
              <Label htmlFor="code">Google Authenticator code</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                placeholder="000000"
                disabled={pending || !activeFactorId}
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={pending || !activeFactorId}
              className="h-11 w-full rounded-2xl bg-emerald-500 text-sm font-semibold text-emerald-950 ring-0 hover:bg-emerald-400 disabled:opacity-50"
            >
              {pending ? "Verifying…" : "Continue to dashboard"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
