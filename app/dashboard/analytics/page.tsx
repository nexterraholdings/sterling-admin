import { StatsCard } from "@/components/dashboard/StatsCard";
import { fetchAnalytics } from "../lib/analytics";
import { AnalyticsClient } from "./client";

export default async function AnalyticsPage() {
  const data = await fetchAnalytics();

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
      title: "Reports filed",
      value: data.totalReports.toLocaleString(),
      change: data.statusCounts["pending"]
        ? `${data.statusCounts["pending"]} pending`
        : "all resolved",
      tone: data.statusCounts["pending"] ? "amber" as const : "emerald" as const,
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M3 3.5A1.5 1.5 0 014.5 2h1.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.44 4H11a3 3 0 012 2.5V8h1a1 1 0 011 1v1a1 1 0 01-1 1h-1v4a2 2 0 01-2 2H5a2 2 0 01-2-2V3.5z"/></svg>,
    },
    {
      title: "Users with strikes",
      value: String(data.usersWithStrikes),
      change: `avg ${data.avgStrikes} strikes`,
      tone: data.usersWithStrikes > 0 ? "rose" as const : "slate" as const,
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0V5zm0 8.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd"/></svg>,
    },
    {
      title: "Total posts",
      value: data.totalPosts.toLocaleString(),
      change: "",
      tone: "violet" as const,
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M3.196 12.87l-.825.483a.75.75 0 000 1.294l7.25 4.25a.75.75 0 00.758 0l7.25-4.25a.75.75 0 000-1.294l-.825-.484-5.666 3.322a2.25 2.25 0 01-2.276 0L3.196 12.87z"/><path d="M3.196 8.87l-.825.483a.75.75 0 000 1.294l7.25 4.25a.75.75 0 00.758 0l7.25-4.25a.75.75 0 000-1.294l-.825-.484-5.666 3.322a2.25 2.25 0 01-2.276 0L3.196 8.87z"/><path d="M10.38 1.103a.75.75 0 00-.76 0l-7.25 4.25a.75.75 0 000 1.294l7.25 4.25a.75.75 0 00.76 0l7.25-4.25a.75.75 0 000-1.294l-7.25-4.25z"/></svg>,
    },
    {
      title: "Total events",
      value: data.totalEvents.toLocaleString(),
      change: `${data.upcomingEvents} upcoming`,
      tone: data.upcomingEvents > 0 ? "emerald" as const : "slate" as const,
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd"/></svg>,
      subtitle: `avg ${data.avgAttendees} attendees`,
    },
  ];

  const postTypeEntries = Object.entries(data.postTypeCounts).sort((a, b) => b[1] - a[1]);
  const marketEntries = Object.entries(data.marketCounts).sort((a, b) => b[1] - a[1]);
  const eventTypeEntries = Object.entries(data.eventTypeCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-zinc-900 to-blue-500/10" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/15 text-xs font-bold text-violet-300">A</span>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Analytics</p>
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-50">Platform breakdown</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Real-time distribution of users, reports, and content across the platform.
          </p>
        </div>
      </div>

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
        reportTrend={data.reportTrend}
        userTrend={data.userTrend}
        postTrend={data.postTrend}
        eventTrend={data.eventTrend}
        statusCounts={data.statusCounts}
        postTypeEntries={postTypeEntries}
        marketEntries={marketEntries}
        eventTypeEntries={eventTypeEntries}
        totalUsers={data.totalUsers}
        totalReports={data.totalReports}
        totalPosts={data.totalPosts}
        totalEvents={data.totalEvents}
        upcomingEvents={data.upcomingEvents}
        pastEvents={data.pastEvents}
        privateEvents={data.privateEvents}
        publicEvents={data.publicEvents}
      />
    </div>
  );
}