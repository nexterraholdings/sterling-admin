"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs } from "@/components/dashboard/Tabs";

type PageView = "users" | "prop-accounts" | "cheats" | "seeding-content";

const TAB_ROUTES: Record<PageView, string> = {
  users: "/dashboard/users",
  "prop-accounts": "/dashboard/users/prop-accounts",
  cheats: "/dashboard/users/cheats",
  "seeding-content": "/dashboard/users/seeding-content",
};

function tabForPathname(pathname: string): PageView {
  if (pathname.startsWith("/dashboard/users/prop-accounts")) return "prop-accounts";
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
      <div>
          <Tabs
            key={pageView}
            tabs={[
              { id: "users", label: "Users", color: "emerald" },
              { id: "prop-accounts", label: "Prop accounts", color: "violet" },
              { id: "cheats", label: "Cheats", color: "amber" },
              { id: "seeding-content", label: "Seeding content", color: "blue" },
            ]}
            defaultTab={pageView}
            variant="segmented"
            onChange={(id) => router.push(TAB_ROUTES[id as PageView])}
          />
      </div>

      {children}
    </div>
  );
}
