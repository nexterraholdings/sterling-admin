import { OPERATOR_ROLES } from "@/app/dashboard/lib/admin-access";
import { requireAdminPage } from "@/app/dashboard/lib/dal";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage(OPERATOR_ROLES);
  return children;
}
