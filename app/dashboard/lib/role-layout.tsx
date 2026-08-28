import type { AdminRole } from "@/app/dashboard/lib/admin-access";
import { requireAdminPage } from "@/app/dashboard/lib/dal";

export function createRoleLayout(roles: readonly AdminRole[]) {
  return async function RoleLayout({ children }: { children: React.ReactNode }) {
    await requireAdminPage(roles);
    return children;
  };
}
