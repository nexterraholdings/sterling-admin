import { OPERATOR_ROLES, requireAdminPage } from "@/app/dashboard/lib/dal";
import { loadDirectorDashboard } from "@/lib/conversations/director";
import { DirectorClient } from "./DirectorClient";

// "Plan now" waits on the director model.
export const maxDuration = 60;

export default async function DirectorPage() {
  await requireAdminPage(OPERATOR_ROLES);
  const dashboard = await loadDirectorDashboard();
  return <DirectorClient initial={dashboard} />;
}
