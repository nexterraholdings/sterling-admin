"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ADMIN_DISCUSSION_LIFECYCLE_OPTIONS,
  lifecyclePillKey,
  normalizeDiscussionLifecycleStatus,
} from "@/lib/discussions/lifecycle";

export const LIFECYCLE_BADGE: Record<string, string> = {
  bootstrap: "bg-violet-500/15 text-violet-300 ring-violet-500/25",
  active: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25",
  grace: "bg-amber-500/15 text-amber-300 ring-amber-500/25",
  claimable: "bg-blue-500/15 text-blue-300 ring-blue-500/25",
  expired: "bg-zinc-800 text-zinc-500 ring-zinc-700",
};

export const LIFECYCLE_LABEL: Record<string, string> = Object.fromEntries(
  ADMIN_DISCUSSION_LIFECYCLE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<string, string>;

/** @deprecated Legacy rows; displayed as Claimable */
LIFECYCLE_LABEL.auction = "Claimable";
LIFECYCLE_BADGE.auction = LIFECYCLE_BADGE.claimable;

type PersonLike = { full_name: string | null; username: string | null } | null | undefined;

export function personLabel(p: PersonLike): string {
  if (!p) return "Unknown";
  return p.username ? `@${p.username}` : p.full_name ?? "Unknown";
}

function getInitials(p: PersonLike): string {
  if (p?.full_name?.trim()) {
    const parts = p.full_name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return p.full_name.slice(0, 2).toUpperCase();
  }
  return (p?.username ?? "??").slice(0, 2).toUpperCase();
}

const AVATAR_PALETTES = [
  "bg-violet-500/15 text-violet-300",
  "bg-blue-500/15 text-blue-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
];

function avatarColor(id: string): string {
  const n = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTES[n % AVATAR_PALETTES.length];
}

export function Avatar({ id, person, size = "md" }: { id: string; person: PersonLike; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs";
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full font-bold ${dims} ${avatarColor(id)}`}>
      {getInitials(person)}
    </div>
  );
}

export function LifecyclePill({ status }: { status: string }) {
  const key = lifecyclePillKey(status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
        LIFECYCLE_BADGE[key] ?? "bg-zinc-800 text-zinc-400 ring-zinc-700"
      }`}
    >
      {LIFECYCLE_LABEL[key] ?? normalizeDiscussionLifecycleStatus(status).replace(/_/g, " ")}
    </span>
  );
}

export function LiveBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-300 ring-1 ring-rose-500/30">
      <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
      Live
    </span>
  );
}

export function ReportsBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-300 ring-1 ring-rose-500/25">
      {count} report{count !== 1 ? "s" : ""}
    </span>
  );
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - Date.parse(dateStr);
  if (Number.isNaN(diff)) return formatShortDate(dateStr);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatShortDate(dateStr);
}

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15";

export function FilterField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

export function filterInputProps(className = "") {
  return { className: `${inputCls} ${className}`.trim() };
}

export function FilterChip({
  active,
  onClick,
  children,
  tone = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "neutral" | "rose" | "emerald" | "violet";
}) {
  const tones = {
    neutral: active
      ? "bg-zinc-100 text-zinc-900 ring-zinc-200"
      : "bg-zinc-900 text-zinc-400 ring-zinc-800 hover:text-zinc-200",
    rose: active
      ? "bg-rose-500/20 text-rose-200 ring-rose-500/40"
      : "bg-zinc-900 text-zinc-400 ring-zinc-800 hover:text-rose-200",
    emerald: active
      ? "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40"
      : "bg-zinc-900 text-zinc-400 ring-zinc-800 hover:text-emerald-200",
    violet: active
      ? "bg-violet-500/20 text-violet-200 ring-violet-500/40"
      : "bg-zinc-900 text-zinc-400 ring-zinc-800 hover:text-violet-200",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 transition ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function SectionCard({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm ${className}`}>
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {description && <p className="mt-1 text-sm leading-relaxed text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/50 px-6 py-14 text-center">
      <p className="text-base font-medium text-zinc-300">{title}</p>
      {hint && <p className="mt-2 max-w-md text-sm text-zinc-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "danger" | "ghost";
}) {
  const styles = {
    primary: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30 hover:bg-emerald-500/25",
    danger: "bg-rose-500/10 text-rose-300 ring-rose-500/30 hover:bg-rose-500/20",
    ghost: "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function GhostLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
    >
      {children}
    </Link>
  );
}

export function DetailAccordion({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-zinc-800 bg-zinc-950/40 open:bg-zinc-950/60"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:content-none">
        <div>
          <p className="text-sm font-semibold text-zinc-100">{title}</p>
          {summary && <p className="mt-0.5 text-xs text-zinc-500">{summary}</p>}
        </div>
        <span className="text-zinc-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-zinc-800 px-5 pb-5 pt-4">{children}</div>
    </details>
  );
}

export function LoadMoreBar({
  shown,
  total,
  loading,
  onLoadMore,
  hasMore,
}: {
  shown: number;
  total?: number;
  loading: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
}) {
  if (!hasMore) {
    if (shown > 0 && (total === undefined || shown >= total)) {
      return (
        <p className="py-4 text-center text-sm text-zinc-500">
          {total !== undefined ? `All ${total.toLocaleString()} loaded` : `${shown.toLocaleString()} loaded`}
        </p>
      );
    }
    return null;
  }
  return (
    <div className="flex flex-col items-center gap-2 border-t border-zinc-800 py-6">
      {total !== undefined ? (
        <p className="text-xs text-zinc-500">
          Showing {shown.toLocaleString()} of {total.toLocaleString()}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">{shown.toLocaleString()} loaded</p>
      )}
      <PrimaryButton variant="ghost" disabled={loading} onClick={onLoadMore}>
        {loading ? "Loading…" : "Load more"}
      </PrimaryButton>
    </div>
  );
}

export function ModerationMenu({
  actions,
}: {
  actions: { id: string; label: string; tone?: "default" | "danger"; onClick: () => void }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={a.onClick}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            a.tone === "danger"
              ? "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/25 hover:bg-rose-500/20"
              : "bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-700"
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
