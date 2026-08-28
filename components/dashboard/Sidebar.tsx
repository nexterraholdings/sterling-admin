"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useId, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import logo from "@/assets/MobileAppLogo.png";
import type { AdminRole } from "@/app/dashboard/lib/admin-access";
import { allowedRolesForPath, hasAdminRole } from "@/app/dashboard/lib/admin-access";

type NavItem = {
  href: string;
  label: string;
  short: string;
  description: string;
};

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Insights",
    items: [
      { href: "/dashboard", label: "Overview", short: "OV", description: "Platform metrics" },
      { href: "/dashboard/analytics", label: "Analytics", short: "AN", description: "Growth and quality trends" },
      { href: "/dashboard/audit-logs", label: "Audit Logs", short: "AL", description: "Admin activity history" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/dashboard/users", label: "Users", short: "US", description: "Profiles and accounts" },
      { href: "/dashboard/moderators", label: "Moderators", short: "MD", description: "Dashboard access and roles" },
      { href: "/dashboard/sterling-star", label: "Sterling Star", short: "SS", description: "Creator program applicants" },
      { href: "/dashboard/moderation", label: "Moderation", short: "MO", description: "Reports, flagged accounts, and bans" },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/dashboard/discussions", label: "Hubs", short: "DS", description: "Area hubs and comments" },
      { href: "/dashboard/notifications", label: "Notifications", short: "NO", description: "Push and in-app messages" },
    ],
  },
];

function groupsForRole(role: AdminRole) {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAdminRole(role, allowedRolesForPath(item.href))),
    }))
    .filter((group) => group.items.length > 0);
}

function isActivePath(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function groupContainsPath(group: { items: NavItem[] }, pathname: string) {
  return group.items.some((item) => isActivePath(pathname, item.href));
}

function NavList({
  pathname,
  role,
  onNavigate,
}: {
  pathname: string;
  role: AdminRole;
  onNavigate?: () => void;
}) {
  const groups = useMemo(() => groupsForRole(role), [role]);
  const listId = useId();
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.label, true]))
  );

  useEffect(() => {
    const activeGroup = groups.find((group) => groupContainsPath(group, pathname));
    if (!activeGroup) return;
    setOpen((prev) => (prev[activeGroup.label] ? prev : { ...prev, [activeGroup.label]: true }));
  }, [pathname, groups]);

  function toggle(label: string) {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const expanded = open[group.label] !== false;
        const panelId = `${listId}-${group.label.toLowerCase()}`;

        return (
          <section key={group.label}>
            <button
              type="button"
              onClick={() => toggle(group.label)}
              aria-expanded={expanded}
              aria-controls={panelId}
              className="mb-2 flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            >
              {group.label}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {expanded && (
              <div id={panelId} className="space-y-1">
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition ${
                        active
                          ? "bg-emerald-500/10 text-zinc-50 ring-1 ring-emerald-500/20"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-emerald-400" />
                      )}
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-black tracking-tight transition ${
                          active
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700 group-hover:text-zinc-50"
                        }`}
                      >
                        {item.short}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span className={`mt-0.5 block truncate text-xs ${active ? "text-zinc-400" : "text-zinc-500"}`}>
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function Sidebar({
  mobileOpen = false,
  onCloseMobile,
  role,
}: {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  role: AdminRole;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden h-screen w-[304px] shrink-0 border-r border-zinc-800/80 bg-zinc-900 text-zinc-50 lg:flex lg:flex-col"
        style={{ position: "sticky", top: 0, height: "100vh" }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-zinc-800/80 px-4 py-5">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                <Image src={logo} alt="Sterling" width={44} height={44} className="h-full w-full object-cover" priority />
              </div>
              <h2 className="truncate text-base font-semibold text-zinc-50">Admin Console</h2>
            </Link>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <NavList pathname={pathname} role={role} />
          </nav>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[280px] max-w-[80vw] flex-col border-r border-zinc-800 bg-zinc-900 text-zinc-50 transition-transform duration-300 ease-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-5">
          <Link href="/dashboard" onClick={onCloseMobile} className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
              <Image src={logo} alt="Sterling" width={44} height={44} className="h-full w-full object-cover" />
            </div>
            <h2 className="truncate text-base font-semibold text-zinc-50">Admin Console</h2>
          </Link>
          <button
            onClick={onCloseMobile}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-50"
            title="Close menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <NavList pathname={pathname} role={role} onNavigate={onCloseMobile} />
        </nav>
      </aside>
    </>
  );
}
