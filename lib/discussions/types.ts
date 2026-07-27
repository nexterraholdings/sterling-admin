export type DiscussionLifecycleStatus =
  | "bootstrap"
  | "active"
  | "grace"
  | "claimable"
  | "auction"
  | "expired";

export type ProfileStub = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type CommunityStub = {
  id: string;
  name: string | null;
};

export type DiscussionRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  center_lat: number;
  center_lng: number;
  radius_miles: number;
  location_hint: string | null;
  avg_rate: number | null;
  rate_count: number;
  comment_count: number;
  lifecycle_status: DiscussionLifecycleStatus;
  is_live: boolean;
  engagement_score: number;
  bootstrap_expires_at: string | null;
  unique_participant_count: number;
  last_check_in_at: string | null;
  check_in_due_at: string | null;
  grace_expires_at: string | null;
  claim_window_opens_at: string | null;
  claim_window_closes_at: string | null;
  live_started_at: string | null;
  live_expires_at: string | null;
  live_last_go_live_at: string | null;
  live_cooldown_until: string | null;
  community_id: string | null;
  auto_share_updates: boolean;
  auto_share_feed: boolean;
  steward_glow_until: string | null;
  steward_boost_until: string | null;
  created_at: string;
  updated_at: string;
};

export type DiscussionListItem = DiscussionRow & {
  creator: ProfileStub | null;
  community: CommunityStub | null;
  report_count: number;
};

export type LiveSessionRow = {
  id: string;
  discussion_id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

export type DiscussionHubTab =
  | "feed"
  | "updates"
  | "events"
  | "media"
  | "resources"
  | "wiki"
  | "people"
  | "polls"
  | "live_chat";

export const DISCUSSION_HUB_TABS: { id: DiscussionHubTab; label: string }[] = [
  { id: "feed", label: "Feed" },
  { id: "updates", label: "Updates" },
  { id: "events", label: "Events" },
  { id: "media", label: "Media" },
  { id: "resources", label: "Resources" },
  { id: "wiki", label: "Wiki" },
  { id: "people", label: "People" },
  { id: "polls", label: "Polls" },
  { id: "live_chat", label: "Live chat" },
];

export type DiscussionAnalyticsPayload = {
  viewCount: number;
  uniqueViewers: number;
  daysActive: number;
  memberCount: number;
  engagedParticipantCount: number;
  trackedViewerJoinCount: number;
  topLevelPosts: number;
  replyPosts: number;
  commentLikes: number;
  pinnedPosts: number;
  postsWithMedia: number;
  hiddenPosts: number;
  rateCount: number;
  avgRate: number | null;
  stars1: number;
  stars2: number;
  stars3: number;
  stars4: number;
  stars5: number;
  pollCount: number;
  pollVoteCount: number;
  liveSessionCount: number;
  liveSecondsTotal: number;
  liveSeconds7d: number;
  liveChatMessages: number;
  liveChatHiddenMessages: number;
  updatesCount: number;
  mediaCount: number;
  wikiSectionCount: number;
  resourcesCount: number;
  reportCount: number;
  communityAvgViews: number;
  communityAvgEngagement: number;
  communityDiscussionCount: number;
  tabViews: Record<string, number>;
};

export type DiscussionTrendPoint = {
  day: string;
  views: number;
  posts: number;
  ratings: number;
};
