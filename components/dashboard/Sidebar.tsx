"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import logo from "@/assets/MobileAppLogo.png";

type NavItem = {
  href: string;
  label: string;
  short: string;
  description: string;
};

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Command",
    items: [
      { href: "/dashboard", label: "Overview", short: "OV", description: "Live platform pulse" },
      { href: "/dashboard/analytics", label: "Analytics", short: "AN", description: "Growth and quality trends" },
      { href: "/dashboard/audit-logs", label: "Audit Logs", short: "AL", description: "Admin activity history" },
      { href: "/dashboard/news", label: "News", short: "NW", description: "Manage the daily news override" },
      { href: "/dashboard/plans", label: "Plans", short: "PL", description: "Billing, comps, and brokerage Plus" },
      { href: "/dashboard/notifications", label: "Notifications", short: "NO", description: "Push and in-app broadcast messages" },
    ],
  },
  {
    label: "Commercial",
    items: [
      { href: "/dashboard/listings", label: "Listings & Deals", short: "LD", description: "Brokerage listings and hot deals" },
      { href: "/dashboard/leads", label: "Leads", short: "LE", description: "Buyer/renter interest inbox" },
    ],
  },
  {
    label: "Community",
    items: [
      { href: "/dashboard/users", label: "Users", short: "US", description: "Profiles and cheats" },
      { href: "/dashboard/communities", label: "Communities", short: "CM", description: "Groups, visibility, owners" },
      { href: "/dashboard/events", label: "Events", short: "EV", description: "Meetups and gatherings" },
      { href: "/dashboard/discussions", label: "Hubs", short: "DS", description: "Area hubs and comments" },
      { href: "/dashboard/invite-points", label: "Invite Points", short: "IP", description: "Manually adjust referral points" },
    ],
  },
  {
    label: "Trust",
    items: [
      { href: "/dashboard/moderation", label: "Moderation", short: "MO", description: "Reports, flagged accounts, and bans" },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-6">
      {navGroups.map((group) => (
        <section key={group.label}>
          {!collapsed && (
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              {group.label}
            </p>
          )}

          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`group relative flex items-center rounded-2xl transition ${
                    collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
                  } ${
                    active
                      ? "bg-emerald-500/10 text-zinc-50 ring-1 ring-emerald-500/20"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  {active && !collapsed && (
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

                  {!collapsed && (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.label}</span>
                      <span className={`mt-0.5 block truncate text-xs ${active ? "text-zinc-400" : "text-zinc-500"}`}>
                        {item.description}
                      </span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="border-t border-zinc-800/80 p-4">
      {collapsed ? (
        <div className="mx-auto h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]" />
      ) : (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]" />
            <p className="text-xs font-bold text-emerald-300">Admin tools online</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-emerald-400/90">
            Service-role actions are live. Boosts write directly to tracked counters.
          </p>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  mobileOpen = false,
  onCloseMobile,
}: {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden h-screen shrink-0 border-r border-zinc-800/80 bg-zinc-900 text-zinc-50 transition-[width] duration-300 lg:flex lg:flex-col ${
          collapsed ? "w-[88px]" : "w-[304px]"
        }`}
        style={{ position: "sticky", top: 0, height: "100vh" }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={`border-b border-zinc-800/80 px-4 py-5 ${collapsed ? "flex justify-center" : ""}`}>
            <div className={`flex w-full items-center ${collapsed ? "justify-center" : "justify-between gap-3"}`}>
              <Link href="/dashboard" className={`flex min-w-0 items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                  <Image src={logo} alt="Sterling" width={44} height={44} className="h-full w-full object-cover" priority />
                </div>
                {!collapsed && (
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-400">Sterling</p>
                    <h2 className="mt-1 truncate text-base font-semibold text-zinc-50">Admin Console</h2>
                  </div>
                )}
              </Link>

              {!collapsed && (
                <button
                  onClick={() => setCollapsed(true)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-50"
                  title="Collapse sidebar"
                >
                  <span className="text-sm font-semibold">{"<"}</span>
                </button>
              )}
            </div>

            {collapsed && (
              <button
                onClick={() => setCollapsed(false)}
                className="mt-4 flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-50"
                title="Expand sidebar"
              >
                <span className="text-sm font-semibold">{">"}</span>
              </button>
            )}
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <NavList pathname={pathname} collapsed={collapsed} />
          </nav>

          <SidebarFooter collapsed={collapsed} />
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
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-400">Sterling</p>
              <h2 className="mt-1 truncate text-base font-semibold text-zinc-50">Admin Console</h2>
            </div>
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
          <NavList pathname={pathname} collapsed={false} onNavigate={onCloseMobile} />
        </nav>

        <SidebarFooter collapsed={false} />
      </aside>
    </>
  );
}
