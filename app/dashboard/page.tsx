import { fetchOverviewSnapshot } from "./lib/overview";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { DashboardOverviewClient } from "@/components/dashboard/DashboardOverviewClient";

export default async function DashboardPage() {
  const admin = await getCurrentAdmin();
  const snapshot = await fetchOverviewSnapshot();

  return (
    <DashboardOverviewClient
      snapshot={snapshot}
      canToggleGuardrails={admin.role === "owner"}
    />
  );
}
