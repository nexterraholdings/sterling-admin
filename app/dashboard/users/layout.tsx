import { OPERATOR_ROLES } from "@/app/dashboard/lib/admin-access";
import { requireAdminPage } from "@/app/dashboard/lib/dal";
import { UsersNav } from "./UsersNav";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage(OPERATOR_ROLES);
  return <UsersNav>{children}</UsersNav>;
}
