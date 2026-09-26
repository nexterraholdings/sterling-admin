"use client";

import { useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { MobileTableStack } from "@/components/dashboard/MobileTableStack";
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
        <main className="min-w-0 flex-1 overflow-x-clip overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-8">
          <MobileTableStack />
          {children}
        </main>
      </div>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} role={admin.role} />
    </div>
  );
}
