"use client";

import { useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { Sidebar } from "@/components/dashboard/Sidebar";
import type { CurrentAdmin } from "@/app/dashboard/lib/dal";

export function DashboardShell({
  admin,
  children,
}: {
  admin: CurrentAdmin;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="dashboard-tech relative flex h-screen overflow-hidden text-zinc-50">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header admin={admin} navOpen={navOpen} onToggleNav={() => setNavOpen((open) => !open)} />
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} role={admin.role} />
    </div>
  );
}
