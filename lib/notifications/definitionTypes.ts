import type { NotificationTapDestination } from "@/lib/notifications/tapDestinations";

export type NotificationTypeDefinition = {
  id: string;
  type: string;
  display_name: string;
  title_template: string;
  body_template: string | null;
  tap_destination: NotificationTapDestination;
  trigger_mode: string;
  preference_column: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationRouteContext = {
  tap_destination: NotificationTapDestination;
  post_id?: string | null;
  discussion_id?: string | null;
  community_id?: string | null;
  actor_id?: string | null;
  leaderboard_tab?: "standing" | "badges";
  discussion_tab?: string;
};

export function buildRouteContext(params: {
  tap_destination: NotificationTapDestination;
  post_id?: string | null;
  discussion_id?: string | null;
  community_id?: string | null;
  actor_id?: string | null;
}): NotificationRouteContext {
  const ctx: NotificationRouteContext = { tap_destination: params.tap_destination };
  if (params.post_id) ctx.post_id = params.post_id;
  if (params.discussion_id) ctx.discussion_id = params.discussion_id;
  if (params.community_id) ctx.community_id = params.community_id;
  if (params.actor_id) ctx.actor_id = params.actor_id;
  if (params.tap_destination === "leaderboard_standing") ctx.leaderboard_tab = "standing";
  if (params.tap_destination === "leaderboard_badges") ctx.leaderboard_tab = "badges";
  if (params.tap_destination === "discussion_events") ctx.discussion_tab = "events";
  if (params.tap_destination === "discussion_updates") ctx.discussion_tab = "updates";
  if (params.tap_destination === "discussion_live") ctx.discussion_tab = "chat";
  return ctx;
}

export function validateRouteFields(
  tap_destination: NotificationTapDestination,
  fields: { post_id?: string; discussion_id?: string; community_id?: string; actor_id?: string },
): string | null {
  const needs = {
    post_id: ["post", "post_comments"].includes(tap_destination),
    discussion_id: [
      "discussion",
      "discussion_hub",
      "discussion_events",
      "discussion_updates",
      "discussion_live",
    ].includes(tap_destination),
    community_id: tap_destination === "community_feed",
    actor_id: ["member_profile", "chat_with_actor"].includes(tap_destination),
  };
  if (needs.post_id && !fields.post_id?.trim()) return "Post ID is required for this destination.";
  if (needs.discussion_id && !fields.discussion_id?.trim()) return "Discussion ID is required for this destination.";
  if (needs.community_id && !fields.community_id?.trim()) return "Community ID is required for this destination.";
  if (needs.actor_id && !fields.actor_id?.trim()) return "Actor user ID is required for this destination.";
  return null;
}
