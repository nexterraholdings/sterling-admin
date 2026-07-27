export type SystemNotificationCategory =
  | "Social & feed"
  | "Communities"
  | "Map events"
  | "Area discussions"
  | "Rankings & referrals"
  | "Scheduled & onboarding"
  | "Admin & legacy";

export type SystemNotificationPipeline = "app" | "discussion" | "cron" | "admin";

export type SystemNotificationDefinition = {
  type: string;
  category: SystemNotificationCategory;
  trigger: string;
  pipeline: SystemNotificationPipeline;
  /** `user_settings` column when users can disable this type; null = master toggles only */
  preferenceColumn: string | null;
};

/** Mirrors Sterling `UserNotificationType` and discussion/cron types in production. */
export const SYSTEM_NOTIFICATION_CATALOG: SystemNotificationDefinition[] = [
  // Social & feed
  {
    type: "new_message",
    category: "Social & feed",
    trigger: "Direct message received",
    pipeline: "app",
    preferenceColumn: "notif_new_messages",
  },
  {
    type: "new_follow",
    category: "Social & feed",
    trigger: "Someone follows you",
    pipeline: "app",
    preferenceColumn: "notif_connections",
  },
  {
    type: "new_connection",
    category: "Social & feed",
    trigger: "Mutual follow becomes a connection",
    pipeline: "app",
    preferenceColumn: "notif_connections",
  },
  {
    type: "new_comment",
    category: "Social & feed",
    trigger: "Comment on your post",
    pipeline: "app",
    preferenceColumn: "notif_comments",
  },
  {
    type: "new_reply",
    category: "Social & feed",
    trigger: "Reply to your comment",
    pipeline: "app",
    preferenceColumn: "notif_comments",
  },
  {
    type: "new_like",
    category: "Social & feed",
    trigger: "Like on your post",
    pipeline: "app",
    preferenceColumn: "notif_likes",
  },
  {
    type: "new_comment_like",
    category: "Social & feed",
    trigger: "Like on your comment",
    pipeline: "app",
    preferenceColumn: "notif_likes",
  },
  {
    type: "new_mention",
    category: "Social & feed",
    trigger: "@mention in a post or comment",
    pipeline: "app",
    preferenceColumn: "notif_mentions",
  },
  {
    type: "poll_vote",
    category: "Social & feed",
    trigger: "First vote on your poll",
    pipeline: "app",
    preferenceColumn: "notif_likes",
  },

  // Communities
  {
    type: "new_member",
    category: "Communities",
    trigger: "Join or join request on a community you manage",
    pipeline: "app",
    preferenceColumn: "notif_community",
  },
  {
    type: "community_invite",
    category: "Communities",
    trigger: "Invited to a private community",
    pipeline: "app",
    preferenceColumn: "notif_community",
  },
  {
    type: "community_join_approved",
    category: "Communities",
    trigger: "Join request approved",
    pipeline: "app",
    preferenceColumn: "notif_community",
  },
  {
    type: "community_join_rejected",
    category: "Communities",
    trigger: "Join request declined",
    pipeline: "app",
    preferenceColumn: "notif_community",
  },
  {
    type: "community_member_removed",
    category: "Communities",
    trigger: "Removed from a community",
    pipeline: "app",
    preferenceColumn: "notif_community",
  },
  {
    type: "community_role_changed",
    category: "Communities",
    trigger: "Moderator role granted or removed",
    pipeline: "app",
    preferenceColumn: "notif_community",
  },

  // Map events
  {
    type: "event_join",
    category: "Map events",
    trigger: "Someone joins your map event",
    pipeline: "app",
    preferenceColumn: "notif_community",
  },
  {
    type: "event_updated",
    category: "Map events",
    trigger: "Host updates an event you attend",
    pipeline: "app",
    preferenceColumn: "notif_community",
  },
  {
    type: "event_cancelled",
    category: "Map events",
    trigger: "Host cancels an event you attend",
    pipeline: "app",
    preferenceColumn: "notif_community",
  },

  // Area discussions
  {
    type: "area_discussion_reply",
    category: "Area discussions",
    trigger: "Comment, rating, or reply on a discussion you steward",
    pipeline: "app",
    preferenceColumn: "notif_discussion_replies",
  },
  {
    type: "area_discussion_invite",
    category: "Area discussions",
    trigger: "Invited to a map discussion",
    pipeline: "app",
    preferenceColumn: "notif_discussion_invites",
  },
  {
    type: "area_discussion_live",
    category: "Area discussions",
    trigger: "Steward starts an emergency meeting / live session",
    pipeline: "app",
    preferenceColumn: "notif_discussion_live",
  },
  {
    type: "area_discussion_member_joined",
    category: "Area discussions",
    trigger: "Someone joins your discussion",
    pipeline: "discussion",
    preferenceColumn: "notif_discussion_replies",
  },
  {
    type: "area_discussion_update",
    category: "Area discussions",
    trigger: "Steward posts a manual hub update",
    pipeline: "discussion",
    preferenceColumn: "notif_discussion_updates",
  },
  {
    type: "area_discussion_event_published",
    category: "Area discussions",
    trigger: "Event added to a discussion hub",
    pipeline: "discussion",
    preferenceColumn: "notif_discussion_events",
  },
  {
    type: "area_discussion_event_reminder",
    category: "Area discussions",
    trigger: "Event starting soon or tomorrow (cron)",
    pipeline: "cron",
    preferenceColumn: "notif_discussion_events",
  },
  {
    type: "area_discussion_poll_started",
    category: "Area discussions",
    trigger: "Steward starts a hub poll",
    pipeline: "discussion",
    preferenceColumn: "notif_discussion_polls",
  },
  {
    type: "area_discussion_check_in_reminder",
    category: "Area discussions",
    trigger: "Steward check-in due (cron)",
    pipeline: "cron",
    preferenceColumn: "notif_discussion_stewardship",
  },
  {
    type: "area_discussion_grace",
    category: "Area discussions",
    trigger: "Discussion enters grace / at-risk (cron)",
    pipeline: "cron",
    preferenceColumn: "notif_discussion_stewardship",
  },
  {
    type: "area_discussion_bootstrap_urgent",
    category: "Area discussions",
    trigger: "Bootstrap hub needs participants (cron)",
    pipeline: "cron",
    preferenceColumn: "notif_discussion_stewardship",
  },
  {
    type: "area_discussion_lifecycle",
    category: "Area discussions",
    trigger: "Lifecycle change (claimable, ended, auction, etc.)",
    pipeline: "discussion",
    preferenceColumn: "notif_discussion_stewardship",
  },
  {
    type: "area_discussion_digest",
    category: "Area discussions",
    trigger: "Weekly map-discussion digest (cron, opt-in)",
    pipeline: "cron",
    preferenceColumn: "notif_discussion_digest",
  },

  // Rankings & referrals
  {
    type: "ranking_milestone",
    category: "Rankings & referrals",
    trigger: "Ranking achievement unlocked (DB trigger)",
    pipeline: "app",
    preferenceColumn: null,
  },
  {
    type: "ranking_tier_up",
    category: "Rankings & referrals",
    trigger: "Lifetime points reach a new badge tier",
    pipeline: "app",
    preferenceColumn: null,
  },
  {
    type: "referral_signup",
    category: "Rankings & referrals",
    trigger: "Someone joins with your invite code",
    pipeline: "app",
    preferenceColumn: null,
  },

  // Scheduled & onboarding
  {
    type: "streak_reminder",
    category: "Scheduled & onboarding",
    trigger: "Map streak at risk (streak-reminder cron)",
    pipeline: "cron",
    preferenceColumn: null,
  },
  {
    type: "market_news_reminder",
    category: "Scheduled & onboarding",
    trigger: "Unread News of the Day (market-news-reminder cron)",
    pipeline: "cron",
    preferenceColumn: "notif_market_news",
  },
  {
    type: "new_user_welcome",
    category: "Scheduled & onboarding",
    trigger: "Once after onboarding completes",
    pipeline: "app",
    preferenceColumn: null,
  },

  // Admin & legacy
  {
    type: "system",
    category: "Admin & legacy",
    trigger: "Admin broadcast added to in-app inbox",
    pipeline: "admin",
    preferenceColumn: null,
  },
  {
    type: "welcome",
    category: "Admin & legacy",
    trigger: "Legacy welcome rows (pre new_user_welcome)",
    pipeline: "app",
    preferenceColumn: null,
  },
];

export const SYSTEM_NOTIFICATION_CATEGORIES: SystemNotificationCategory[] = [
  "Social & feed",
  "Communities",
  "Map events",
  "Area discussions",
  "Rankings & referrals",
  "Scheduled & onboarding",
  "Admin & legacy",
];

const PIPELINE_LABEL: Record<SystemNotificationPipeline, string> = {
  app: "App event",
  discussion: "Discussion pipeline",
  cron: "Scheduled job",
  admin: "Admin broadcast",
};

export function pipelineLabel(pipeline: SystemNotificationPipeline): string {
  return PIPELINE_LABEL[pipeline];
}
