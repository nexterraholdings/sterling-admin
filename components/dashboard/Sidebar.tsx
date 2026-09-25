"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
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
      { href: "/dashboard/moderation", label: "Moderation", short: "MO", description: "Reports, flagged accounts, and bans" },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/dashboard/discussions", label: "Hubs", short: "DS", description: "Area hubs, planting, and old pins" },
      { href: "/dashboard/prop-accounts", label: "Prop accounts", short: "PA", description: "Folders and prop profiles" },
      { href: "/dashboard/groups", label: "Groups", short: "GR", description: "Seed groups with prop members and content" },
      { href: "/dashboard/conversations", label: "Conversations", short: "CV", description: "AI prop posts and replies" },
      { href: "/dashboard/notifications", label: "Notifications", short: "NO", description: "Push and in-app messages" },
      { href: "/dashboard/blog", label: "Blog", short: "BL", description: "Company blog posts" },
    ],
  },
];

const NAV_ORDER_KEY = "sterling-admin-nav-order";

type NavOrder = Record<string, string[]>;
type NavGroup = { label: string; items: NavItem[] };
type DragTarget = { group: string; href: string };

function groupsForRole(role: AdminRole): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAdminRole(role, allowedRolesForPath(item.href))),
    }))
    .filter((group) => group.items.length > 0);
}

function readNavOrder(): NavOrder {
  try {
    const raw = localStorage.getItem(NAV_ORDER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const order: NavOrder = {};
    for (const [label, hrefs] of Object.entries(parsed)) {
      if (Array.isArray(hrefs) && hrefs.every((href) => typeof href === "string")) {
        order[label] = hrefs;
      }
    }
    return order;
  } catch {
    return {};
  }
}

function orderedGroups(role: AdminRole, order: NavOrder | null | undefined): NavGroup[] {
  const defaults = groupsForRole(role);
  const savedOrder = order && typeof order === "object" ? order : {};
  const byHref = new Map<string, NavItem>();
  for (const group of defaults) {
    for (const item of group.items) byHref.set(item.href, item);
  }

  const saved = Object.values(savedOrder).some((hrefs) => Array.isArray(hrefs) && hrefs.length > 0);
  if (!saved) return defaults;

  const placed = new Set<string>();
  const groups = defaults.map((group) => {
    const items: NavItem[] = [];
    const hrefs = savedOrder[group.label];
    for (const href of Array.isArray(hrefs) ? hrefs : []) {
      const item = byHref.get(href);
      if (!item || placed.has(href)) continue;
      placed.add(href);
      items.push(item);
    }
    return { label: group.label, items };
  });

  for (const group of defaults) {
    const target = groups.find((entry) => entry.label === group.label);
    if (!target) continue;
    for (const item of group.items) {
      if (placed.has(item.href)) continue;
      placed.add(item.href);
      target.items.push(item);
    }
  }

  return groups.filter((group) => group.items.length > 0);
}

function moveNavItem(groups: NavGroup[], from: DragTarget, to: DragTarget): NavGroup[] {
  if (from.group === to.group && from.href === to.href) return groups;
  const next = groups.map((group) => ({ ...group, items: [...group.items] }));
  const source = next.find((group) => group.label === from.group);
  const target = next.find((group) => group.label === to.group);
  if (!source || !target) return groups;
  const fromIndex = source.items.findIndex((item) => item.href === from.href);
  if (fromIndex < 0) return groups;
  const [item] = source.items.splice(fromIndex, 1);
  const toIndex = target.items.findIndex((entry) => entry.href === to.href);
  target.items.splice(toIndex < 0 ? target.items.length : toIndex, 0, item);
  return next.filter((group) => group.items.length > 0);
}

function orderFromGroups(groups: NavGroup[]): NavOrder {
  return Object.fromEntries(groups.map((group) => [group.label, group.items.map((item) => item.href)]));
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
  order,
  onReorder,
  onNavigate,
}: {
  pathname: string;
  role: AdminRole;
  order: NavOrder;
  onReorder: (order: NavOrder) => void;
  onNavigate?: () => void;
}) {
  const groups = useMemo(() => orderedGroups(role, order ?? {}), [role, order]);
  const listId = useId();
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.label, true]))
  );
  const [drag, setDrag] = useState<DragTarget | null>(null);
  const [over, setOver] = useState<DragTarget | null>(null);
  const dragRef = useRef<DragTarget | null>(null);
  const overRef = useRef<DragTarget | null>(null);

  useEffect(() => {
    const activeGroup = groups.find((group) => groupContainsPath(group, pathname));
    if (!activeGroup) return;
    setOpen((prev) => (prev[activeGroup.label] ? prev : { ...prev, [activeGroup.label]: true }));
  }, [pathname, groups]);

  function toggle(label: string) {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  function targetFromPoint(x: number, y: number): DragTarget | null {
    const node = document.elementFromPoint(x, y)?.closest("[data-nav-href]");
    const href = node?.getAttribute("data-nav-href");
    const group = node?.getAttribute("data-nav-group");
    if (!href || !group) return null;
    return { group, href };
  }

  function onGripPointerDown(event: ReactPointerEvent<HTMLButtonElement>, target: DragTarget) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = target;
    overRef.current = target;
    setDrag(target);
    setOver(target);
  }

  function onGripPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    const next = targetFromPoint(event.clientX, event.clientY);
    if (!next) return;
    const current = overRef.current;
    if (current?.group === next.group && current.href === next.href) return;
    overRef.current = next;
    setOver(next);
  }

  function onGripPointerUp() {
    const from = dragRef.current;
    const to = overRef.current;
    dragRef.current = null;
    overRef.current = null;
    setDrag(null);
    setOver(null);
    if (!from || !to) return;
    const next = moveNavItem(groups, from, to);
    if (next !== groups) onReorder(orderFromGroups(next));
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
              className="mb-2 flex w-full items-center justify-between rounded-lg px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400/70 transition hover:bg-cyan-400/5 hover:text-cyan-200"
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
                  const dragging = drag?.href === item.href && drag.group === group.label;
                  const dropTarget = over?.href === item.href && over.group === group.label && !dragging;

                  return (
                    <div
                      key={item.href}
                      data-nav-href={item.href}
                      data-nav-group={group.label}
                      className={`flex items-center gap-1 rounded-2xl pr-1 ${
                        dropTarget ? "ring-1 ring-emerald-400/70" : ""
                      } ${dragging ? "opacity-40" : ""}`}
                    >
                      <button
                        type="button"
                        draggable={false}
                        aria-label={`Reorder ${item.label}`}
                        title="Drag to reorder"
                        onPointerDown={(event) => onGripPointerDown(event, { group: group.label, href: item.href })}
                        onPointerMove={onGripPointerMove}
                        onPointerUp={onGripPointerUp}
                        onPointerCancel={onGripPointerUp}
                        className="flex h-9 w-6 shrink-0 cursor-grab items-center justify-center rounded-lg text-zinc-600 touch-none hover:bg-zinc-800 hover:text-zinc-300 active:cursor-grabbing"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                          <path d="M7 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0 5.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 6.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8-12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 6.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
                        </svg>
                      </button>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={`group relative flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2.5 transition ${
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
                    </div>
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
  open = false,
  onClose,
  role,
}: {
  open?: boolean;
  onClose?: () => void;
  role: AdminRole;
}) {
  const pathname = usePathname();
  const [order, setOrder] = useState<NavOrder>({});
  const [orderReady, setOrderReady] = useState(false);

  useEffect(() => {
    setOrder(readNavOrder());
    setOrderReady(true);
  }, []);

  useEffect(() => {
    if (!orderReady) return;
    try {
      localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
    } catch {
      /* ignore */
    }
  }, [order, orderReady]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-[#02060b]/70 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`fixed inset-y-3 right-3 z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-2xl border border-cyan-400/25 bg-[#070d14]/95 text-zinc-50 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_30px_80px_rgba(0,0,0,0.65),0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-md transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "pointer-events-none translate-x-[calc(100%+1rem)]"
        }`}
        aria-hidden={!open}
      >
        <div className="flex justify-end px-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/25 text-cyan-200 transition hover:border-cyan-300/50 hover:bg-cyan-400/10"
            title="Close menu"
            aria-label="Close menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <NavList pathname={pathname} role={role} order={order} onReorder={setOrder} onNavigate={onClose} />
        </nav>
      </aside>
    </>
  );
}
