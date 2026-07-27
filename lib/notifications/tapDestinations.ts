export const NOTIFICATION_TAP_DESTINATIONS = [
  "inbox",
  "map",
  "profile",
  "post",
  "post_comments",
  "community_feed",
  "member_profile",
  "discussion",
  "discussion_hub",
  "discussion_events",
  "discussion_updates",
  "discussion_live",
  "leaderboard_standing",
  "leaderboard_badges",
  "chat_with_actor",
] as const;

export type NotificationTapDestination = (typeof NOTIFICATION_TAP_DESTINATIONS)[number];

export const TAP_DESTINATION_LABELS: Record<NotificationTapDestination, string> = {
  inbox: "Inbox",
  map: "Map tab",
  profile: "Profile tab",
  post: "Post detail",
  post_comments: "Post detail (comments)",
  community_feed: "Community feed",
  member_profile: "Member profile",
  discussion: "Area discussion",
  discussion_hub: "Discussion hub",
  discussion_events: "Discussion events tab",
  discussion_updates: "Discussion updates tab",
  discussion_live: "Discussion live / chat",
  leaderboard_standing: "Leaderboard — Standing",
  leaderboard_badges: "Leaderboard — Badges",
  chat_with_actor: "Chat with actor",
};

export type RouteFieldKey = "post_id" | "discussion_id" | "community_id" | "actor_id";

export const TAP_DESTINATION_ROUTE_FIELDS: Record<NotificationTapDestination, RouteFieldKey[]> = {
  inbox: [],
  map: [],
  profile: [],
  post: ["post_id"],
  post_comments: ["post_id"],
  community_feed: ["community_id"],
  member_profile: ["actor_id"],
  discussion: ["discussion_id"],
  discussion_hub: ["discussion_id"],
  discussion_events: ["discussion_id"],
  discussion_updates: ["discussion_id"],
  discussion_live: ["discussion_id"],
  leaderboard_standing: [],
  leaderboard_badges: [],
  chat_with_actor: ["actor_id"],
};

export function normalizeCustomTypeSlug(input: string): string {
  const raw = input.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (raw.startsWith("custom_")) return raw;
  return `custom_${raw.replace(/^custom_/, "")}`;
}

export function isValidCustomTypeSlug(type: string): boolean {
  return /^custom_[a-z0-9_]+$/.test(type);
}
