"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import logo from "@/assets/MobileAppLogo.png";
import { login } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_STORAGE_KEY = "sterling_admin_email";
const REMEMBER_STORAGE_KEY = "sterling_admin_remember_device";

export function SignInScreen() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(EMAIL_STORAGE_KEY);
      const savedRemember = localStorage.getItem(REMEMBER_STORAGE_KEY);
      if (savedEmail) setEmail(savedEmail);
      if (savedRemember === "0") setRemember(false);
    } catch {
      // Ignore blocked storage (private mode, etc).
    }
  }, []);

  function persistDevicePreference() {
    try {
      localStorage.setItem(REMEMBER_STORAGE_KEY, remember ? "1" : "0");
      if (remember && email.trim()) {
        localStorage.setItem(EMAIL_STORAGE_KEY, email.trim());
      } else {
        localStorage.removeItem(EMAIL_STORAGE_KEY);
      }
    } catch {
      // Ignore blocked storage.
    }
  }

  return (
    <main className="relative flex h-dvh max-h-dvh w-full items-center justify-center overflow-hidden bg-zinc-950 px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08),transparent_55%)]"
      />

      <div className="relative w-full max-w-[400px] rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-8 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.75)] backdrop-blur-sm">
        <div className="flex flex-col items-center text-center">
          <div className="relative size-14 overflow-hidden rounded-2xl ring-1 ring-white/10">
            <Image src={logo} alt="" fill className="object-cover" priority />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-50">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">Sign in to continue</p>
        </div>

        <form action={formAction} onSubmit={persistDevicePreference} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              disabled={pending}
              className="h-11"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={pending}
                className="h-11 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 transition hover:text-zinc-300"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3">
            <input
              type="checkbox"
              name="remember"
              value="1"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              disabled={pending}
              className="mt-0.5 size-4 shrink-0 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/30"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-200">
                Remember this device
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
                Stay signed in for 30 days on this browser.
              </span>
            </span>
          </label>

          {state?.error ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
            >
              {state.error}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={pending}
            className="mt-2 h-11 w-full rounded-2xl bg-emerald-500 text-sm font-semibold text-emerald-950 ring-0 hover:bg-emerald-400 disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
