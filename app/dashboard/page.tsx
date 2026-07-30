import { fetchDashboardMetrics } from "./lib/metrics";
import { fetchRecentActivity } from "./lib/activity";
import { DashboardOverviewClient } from "@/components/dashboard/DashboardOverviewClient";

export default async function DashboardPage() {
  const metrics = await fetchDashboardMetrics();
  let activity = { activity: [] as any[], alerts: [] as any[], changes: [] as any[] };
  try {
    activity = await fetchRecentActivity();
  } catch {
    // fetchRecentActivity can fail if tables are empty — that's fine
  }

  return (
    <DashboardOverviewClient
      metrics={metrics}
      activity={activity.activity}
      alerts={activity.alerts}
      changes={activity.changes}
    />
  );
}
