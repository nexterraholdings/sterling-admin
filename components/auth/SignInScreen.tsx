"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { BarChart3, Eye, EyeOff, Shield, Users } from "lucide-react";
import logo from "@/assets/MobileAppLogo.png";
import { login } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const highlights = [
  {
    icon: Shield,
    title: "Moderation & trust",
    description: "Reports, bans, and flagged account review",
  },
  {
    icon: Users,
    title: "Community ops",
    description: "Users, hubs, events, and invite points",
  },
  {
    icon: BarChart3,
    title: "Platform pulse",
    description: "Analytics, billing, and broadcast notifications",
  },
];

export function SignInScreen() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-zinc-950 lg:flex-row">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
      />

      <section className="relative flex flex-1 flex-col justify-between border-b border-zinc-800/80 px-6 py-8 sm:px-10 lg:border-b-0 lg:border-r lg:px-12 lg:py-12 xl:px-16">
        <div className="flex items-center gap-3">
          <div className="relative size-11 overflow-hidden rounded-2xl shadow-[0_0_40px_-12px_rgba(16,185,129,0.45)] ring-1 ring-emerald-500/20">
            <Image src={logo} alt="Sterling" fill className="object-cover" priority />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-zinc-50">Sterling Admin</p>
            <p className="text-xs text-zinc-500">Internal operations console</p>
          </div>
        </div>

        <div className="my-10 hidden max-w-md lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400/90">
            Staff access only
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-50 xl:text-[2.75rem] xl:leading-[1.08]">
            Run the platform with clarity and control.
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-400">
            Sign in to manage users, communities, moderation queues, and platform
            configuration from one dashboard.
          </p>

          <ul className="mt-10 space-y-4">
            {highlights.map(({ icon: Icon, title, description }) => (
              <li
                key={title}
                className="flex gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3.5 backdrop-blur-sm"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                  <Icon className="size-4 text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-100">{title}</p>
                  <p className="mt-0.5 text-sm leading-6 text-zinc-500">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden text-xs text-zinc-600 lg:block">
          Authorized Sterling staff only. All sign-in activity is logged.
        </p>
      </section>

      <section className="relative flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:px-12 xl:px-16">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400/90">
              Staff access only
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">
              Sign in to Sterling Admin
            </h2>
          </div>

          <div className="rounded-3xl border border-zinc-800/90 bg-zinc-900/70 p-7 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)] backdrop-blur-sm sm:p-8">
            <div className="hidden lg:block">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400/90">
                Sign in
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">
                Welcome back
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Use your Sterling admin credentials to continue.
              </p>
            </div>

            <form action={formAction} className="mt-8 space-y-5 lg:mt-8">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="admin@sterling.test"
                  disabled={pending}
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
                    placeholder="Enter your password"
                    disabled={pending}
                    className="pr-12"
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
                className="h-11 w-full rounded-2xl bg-emerald-500 text-sm font-semibold text-emerald-950 ring-0 hover:bg-emerald-400 disabled:opacity-50"
              >
                {pending ? "Signing in…" : "Continue to dashboard"}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs leading-5 text-zinc-600 lg:hidden">
            Authorized Sterling staff only. All sign-in activity is logged.
          </p>
        </div>
      </section>
    </div>
  );
}
