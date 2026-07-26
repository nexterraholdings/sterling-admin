import type { DiscussionAnalyticsPayload, DiscussionTrendPoint } from "./types";

export function mapDiscussionAnalyticsRow(row: Record<string, unknown>): DiscussionAnalyticsPayload {
  const tabViewsRaw = row.tab_views;
  const tabViews: Record<string, number> = {};
  if (tabViewsRaw && typeof tabViewsRaw === "object") {
    for (const [k, v] of Object.entries(tabViewsRaw as Record<string, unknown>)) {
      tabViews[k] = Number(v ?? 0);
    }
  }
  return {
    viewCount: Number(row.view_count ?? 0),
    uniqueViewers: Number(row.unique_viewers ?? 0),
    daysActive: Number(row.days_active ?? 0),
    memberCount: Number(row.member_count ?? 0),
    engagedParticipantCount: Number(row.engaged_participant_count ?? 0),
    trackedViewerJoinCount: Number(row.tracked_viewer_join_count ?? 0),
    topLevelPosts: Number(row.top_level_posts ?? 0),
    replyPosts: Number(row.reply_posts ?? 0),
    commentLikes: Number(row.comment_likes ?? 0),
    pinnedPosts: Number(row.pinned_posts ?? 0),
    postsWithMedia: Number(row.posts_with_media ?? 0),
    hiddenPosts: Number(row.hidden_posts ?? 0),
    rateCount: Number(row.rate_count ?? 0),
    avgRate: row.avg_rate != null ? Number(row.avg_rate) : null,
    stars1: Number(row.stars_1 ?? 0),
    stars2: Number(row.stars_2 ?? 0),
    stars3: Number(row.stars_3 ?? 0),
    stars4: Number(row.stars_4 ?? 0),
    stars5: Number(row.stars_5 ?? 0),
    pollCount: Number(row.poll_count ?? 0),
    pollVoteCount: Number(row.poll_vote_count ?? 0),
    liveSessionCount: Number(row.live_session_count ?? 0),
    liveSecondsTotal: Number(row.live_seconds_total ?? 0),
    liveSeconds7d: Number(row.live_seconds_7d ?? 0),
    liveChatMessages: Number(row.live_chat_messages ?? 0),
    liveChatHiddenMessages: Number(row.live_chat_hidden_messages ?? 0),
    updatesCount: Number(row.updates_count ?? 0),
    mediaCount: Number(row.media_count ?? 0),
    wikiSectionCount: Number(row.wiki_section_count ?? 0),
    resourcesCount: Number(row.resources_count ?? 0),
    reportCount: Number(row.report_count ?? 0),
    communityAvgViews: Number(row.community_avg_views ?? 0),
    communityAvgEngagement: Number(row.community_avg_engagement ?? 0),
    communityDiscussionCount: Number(row.community_discussion_count ?? 0),
    tabViews,
  };
}

export function mapDiscussionTrendRows(rows: Record<string, unknown>[]): DiscussionTrendPoint[] {
  return rows.map((row) => ({
    day: String(row.day),
    views: Number(row.views ?? 0),
    posts: Number(row.posts ?? 0),
    ratings: Number(row.ratings ?? 0),
  }));
}

/** Mobile hub tab ids vs admin labels. */
export const HUB_TAB_VIEW_LABELS: Record<string, string> = {
  welcome: "Welcome",
  chat: "Feed",
  feed: "Feed",
  media: "Media",
  updates: "Updates",
  events: "Events",
  resources: "Resources",
  wiki: "Wiki",
  people: "People",
  polls: "Polls",
  live_chat: "Live chat",
};

export function funnelPct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

export function formatDurationShort(totalSeconds: number): string {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
