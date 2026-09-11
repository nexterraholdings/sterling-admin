"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { Sidebar } from "@/components/dashboard/Sidebar";
import type { CurrentAdmin } from "@/app/dashboard/lib/dal";

const SIDEBAR_KEY = "sterling-admin-sidebar-collapsed";

export function DashboardShell({
  admin,
  children,
}: {
  admin: CurrentAdmin;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);

  useEffect(() => {
    try {
      setDesktopCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* ignore */
    }
    setSidebarReady(true);
  }, []);

  useEffect(() => {
    if (!sidebarReady) return;
    try {
      localStorage.setItem(SIDEBAR_KEY, desktopCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [desktopCollapsed, sidebarReady]);

  function toggleNav() {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setDesktopCollapsed((open) => !open);
      return;
    }
    setMobileNavOpen((open) => !open);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-50">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        desktopCollapsed={desktopCollapsed}
        onToggleDesktop={() => setDesktopCollapsed((open) => !open)}
        role={admin.role}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          admin={admin}
          navCollapsed={desktopCollapsed}
          onToggleNav={toggleNav}
        />
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
