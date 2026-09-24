import { StatsCard } from "@/components/dashboard/StatsCard";
import { fetchAnalytics } from "../lib/analytics";
import { AnalyticsClient } from "./client";

export default async function AnalyticsPage() {
  const data = await fetchAnalytics();

  const growthChange = data.userGrowthPct === 0
    ? "flat vs last week"
    : `${data.userGrowthPct > 0 ? "+" : ""}${data.userGrowthPct}% vs last week`;

  const statsCards = [
    {
      title: "Total users",
      value: data.totalUsers.toLocaleString(),
      change: data.roleDistribution[0]?.name
        ? `${data.roleDistribution[0].percentage}% ${data.roleDistribution[0].name}s`
        : "",
      tone: "blue" as const,
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z"/></svg>,
    },
    {
      title: "New users this week",
      value: data.newUsersThisWeek.toLocaleString(),
      change: growthChange,
      tone: data.userGrowthPct >= 0 ? "emerald" as const : "rose" as const,
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v3.5h-3.5a.75.75 0 000 1.5h3.5v3.5a.75.75 0 001.5 0v-3.5h3.5a.75.75 0 000-1.5h-3.5v-3.5z" clipRule="evenodd"/></svg>,
    },
    {
      title: "Active accounts",
      value: data.activeAccounts.toLocaleString(),
      change: "last 7 days",
      tone: "violet" as const,
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M3.196 12.87l-.825.483a.75.75 0 000 1.294l7.25 4.25a.75.75 0 00.758 0l7.25-4.25a.75.75 0 000-1.294l-.825-.484-5.666 3.322a2.25 2.25 0 01-2.276 0L3.196 12.87z"/><path d="M3.196 8.87l-.825.483a.75.75 0 000 1.294l7.25 4.25a.75.75 0 00.758 0l7.25-4.25a.75.75 0 000-1.294l-.825-.484-5.666 3.322a2.25 2.25 0 01-2.276 0L3.196 8.87z"/><path d="M10.38 1.103a.75.75 0 00-.76 0l-7.25 4.25a.75.75 0 000 1.294l7.25 4.25a.75.75 0 00.76 0l7.25-4.25a.75.75 0 000-1.294l-7.25-4.25z"/></svg>,
    },
    {
      title: "Users with strikes",
      value: String(data.usersWithStrikes),
      change: `avg ${data.avgStrikes} strikes`,
      tone: data.usersWithStrikes > 0 ? "rose" as const : "slate" as const,
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0V5zm0 8.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd"/></svg>,
    },
  ];

  const postTypeEntries = Object.entries(data.postTypeCounts).sort((a, b) => b[1] - a[1]);
  const marketEntries = Object.entries(data.marketCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statsCards.map((stat) => (
          <StatsCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Main analytics content */}
      <AnalyticsClient
        roleDistribution={data.roleDistribution}
        categoryBreakdown={data.categoryBreakdown}
        userGrowthTrend={data.userGrowthTrend}
        accountActivityTrend={data.accountActivityTrend}
        postTrend={data.postTrend}
        reportTrend={data.reportTrend}
        statusCounts={data.statusCounts}
        postTypeEntries={postTypeEntries}
        marketEntries={marketEntries}
        trendingHubs={data.trendingHubs}
        totalUsers={data.totalUsers}
        totalReports={data.totalReports}
        totalPosts={data.totalPosts}
        activeAccounts={data.activeAccounts}
        propAccounts={data.propAccounts}
      />
    </div>
  );
}
