import { OPERATOR_ROLES, requireAdminPage } from "@/app/dashboard/lib/dal";
import { listPropAccountDirectory } from "@/lib/groups/propFolders";
import { PropAccountsView } from "@/app/dashboard/users/prop-accounts/PropAccountsView";

export default async function PropAccountsPage() {
  await requireAdminPage(OPERATOR_ROLES);
  const directory = await listPropAccountDirectory();
  return <PropAccountsView directory={directory} />;
}
