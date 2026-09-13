"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs } from "@/components/dashboard/Tabs";

type PageView = "users" | "cheats" | "seeding-content";

const TAB_ROUTES: Record<PageView, string> = {
  users: "/dashboard/users",
  cheats: "/dashboard/users/cheats",
  "seeding-content": "/dashboard/users/seeding-content",
};

function tabForPathname(pathname: string): PageView {
  if (pathname.startsWith("/dashboard/users/seeding-content")) return "seeding-content";
  if (pathname.startsWith("/dashboard/users/cheats")) return "cheats";
  return "users";
}

export function UsersNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pageView = tabForPathname(pathname);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Operations</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-50">
          {pageView === "users"
            ? "User management"
            : pageView === "cheats"
              ? "Engagement boosting"
              : "Seeding content"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          {pageView === "users"
            ? "Browse profiles and auth.users, spot orphans, and delete auth, profile, or both."
            : pageView === "cheats"
              ? "Directly boost engagement metrics for testing or demo purposes."
              : "Seed draft content from pro account creators for smoke tests and demos."}
        </p>
        <div className="mt-5 border-t border-zinc-800 pt-5">
          <Tabs
            key={pageView}
            tabs={[
              { id: "users", label: "Users", color: "emerald" },
              { id: "cheats", label: "Cheats", color: "amber" },
              { id: "seeding-content", label: "Seeding content", color: "blue" },
            ]}
            defaultTab={pageView}
            variant="segmented"
            onChange={(id) => router.push(TAB_ROUTES[id as PageView])}
          />
        </div>
      </div>

      {children}
    </div>
  );
}
