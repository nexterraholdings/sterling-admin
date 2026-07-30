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

type MfaScreenProps = {
  mode: "enroll" | "verify";
  factorId?: string;
};

export function MfaScreen({ mode, factorId: initialFactorId }: MfaScreenProps) {
  const [enrollState, setEnrollState] = useState<MfaActionState>();
  const [isStartingEnroll, startEnrollTransition] = useTransition();
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
            <p className="text-xs text-zinc-500">Multi-factor authentication</p>
          </div>
        </div>

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400/90">
            {mode === "enroll" ? "Set up required" : "Verify identity"}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">
            {mode === "enroll" ? "Add an authenticator app" : "Enter your authenticator code"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {mode === "enroll"
              ? "Admin access requires a TOTP authenticator app such as 1Password, Authy, or Google Authenticator."
              : "Enter the 6-digit code from your authenticator app to continue to the dashboard."}
          </p>
        </div>

        {mode === "enroll" && isStartingEnroll && !qrCode ? (
          <p className="mt-8 text-sm text-zinc-500">Preparing your authenticator setup…</p>
        ) : null}

        {mode === "enroll" && qrCode ? (
          <div className="mt-8 space-y-4">
            <div className="mx-auto flex max-w-[220px] justify-center rounded-2xl bg-white p-4">
              {/* Supabase returns an SVG data URI for the TOTP QR code. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="Authenticator QR code" className="h-auto w-full" />
            </div>
            {secret ? (
              <p className="break-all text-center font-mono text-xs text-zinc-500">
                Manual entry key: {secret}
              </p>
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
              <Label htmlFor="code">Authenticator code</Label>
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
