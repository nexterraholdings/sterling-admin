export type ProductNotificationCopy = {
  title: string;
  body: string | null;
};

const ACTOR = "**Alex Rivera**";
const COMMUNITY = "Oak Park Neighbors";
const POST = "Excited for the block party this weekend — who is bringing chairs?";
const DISCUSSION = "Downtown corridor safety";
const EVENT = "Saturday open house on Maple St";

/** Default inbox-style samples for admin preview (placeholders mirror production copy). */
export const DEFAULT_PRODUCT_NOTIFICATION_COPY: Record<string, ProductNotificationCopy> = {
  new_message: { title: `${ACTOR} sent you a message`, body: null },
  new_follow: { title: `${ACTOR} just followed you`, body: null },
  new_connection: { title: `You and ${ACTOR} are now connected`, body: null },
  new_comment: { title: `${ACTOR} commented on your post`, body: POST },
  new_reply: { title: `${ACTOR} replied to your comment`, body: POST },
  new_like: { title: `${ACTOR} liked your post`, body: POST },
  new_comment_like: { title: `${ACTOR} liked your comment`, body: null },
  new_mention: { title: `${ACTOR} mentioned you in a comment`, body: "@you see you there!" },
  poll_vote: { title: `${ACTOR} voted on your poll`, body: POST },

  new_member: { title: `${ACTOR} joined your community`, body: COMMUNITY },
  community_invite: { title: `${ACTOR} invited you to join ${COMMUNITY}`, body: "Private group for local updates" },
  community_join_approved: { title: `${ACTOR} approved your request to join ${COMMUNITY}`, body: COMMUNITY },
  community_join_rejected: { title: `${ACTOR} declined your request to join ${COMMUNITY}`, body: COMMUNITY },
  community_member_removed: { title: `${ACTOR} removed you from ${COMMUNITY}`, body: COMMUNITY },
  community_role_changed: {
    title: `${ACTOR} made you a moderator of ${COMMUNITY}`,
    body: COMMUNITY,
  },

  event_join: { title: `${ACTOR} joined your event`, body: EVENT },
  event_updated: { title: `${ACTOR} updated ${EVENT}`, body: EVENT },
  event_cancelled: { title: `${ACTOR} cancelled ${EVENT}`, body: EVENT },

  area_discussion_reply: { title: `${ACTOR} commented on your discussion`, body: DISCUSSION },
  area_discussion_invite: { title: `${ACTOR} invited you to a map discussion`, body: DISCUSSION },
  area_discussion_live: { title: `${ACTOR} started an Emergency Meeting`, body: DISCUSSION },
  area_discussion_member_joined: { title: `${ACTOR} joined your discussion`, body: DISCUSSION },
  area_discussion_update: { title: `${ACTOR} posted an update`, body: "Street lighting install starts Monday." },
  area_discussion_event_published: { title: `${ACTOR} added an event`, body: EVENT },
  area_discussion_event_reminder: { title: "Event starting soon", body: EVENT },
  area_discussion_poll_started: { title: `${ACTOR} started a poll`, body: "Should we prioritize the crosswalk?" },
  area_discussion_check_in_reminder: { title: "Check-in due soon", body: DISCUSSION },
  area_discussion_grace: { title: "Discussion at risk", body: `${DISCUSSION} needs a steward check-in.` },
  area_discussion_bootstrap_urgent: { title: "Discussion needs people", body: `${DISCUSSION} is waiting for members.` },
  area_discussion_lifecycle: { title: "Stewardship is open", body: `${DISCUSSION} is ready to claim.` },
  area_discussion_digest: {
    title: "Your map discussions",
    body: "4 updates in your map discussions this week",
  },

  ranking_milestone: { title: "Achievement unlocked: First post", body: "+25 points · View rankings" },
  ranking_tier_up: { title: "New badge: Rising member", body: "500 lifetime points · View badge collection" },
  referral_signup: { title: `${ACTOR} joined Sterling using your invite!`, body: null },

  streak_reminder: { title: "Don't lose your **7-day** streak!", body: "Open Sterling today to keep your streak alive." },
  market_news_reminder: {
    title: "Today's market news is ready",
    body: "Open News of the Day on the map to read this morning's local story.",
  },
  new_user_welcome: {
    title: "Welcome to Sterling!",
    body: "Verify your phone in Profile settings to get started.",
  },

  system: {
    title: "**Important:** Scheduled maintenance tonight",
    body: null,
  },
  welcome: { title: "Welcome to Sterling!", body: "Verify your phone in Profile settings to get started." },
};

export function defaultCopyForType(type: string): ProductNotificationCopy {
  return (
    DEFAULT_PRODUCT_NOTIFICATION_COPY[type] ?? {
      title: type.replace(/_/g, " "),
      body: null,
    }
  );
}

export const PRODUCT_NOTIFICATION_COPY_STORAGE_KEY = "sterling-admin-product-notification-copy-v1";

export function loadCopyOverrides(): Record<string, ProductNotificationCopy> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PRODUCT_NOTIFICATION_COPY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ProductNotificationCopy>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCopyOverride(type: string, copy: ProductNotificationCopy): void {
  const all = loadCopyOverrides();
  all[type] = copy;
  localStorage.setItem(PRODUCT_NOTIFICATION_COPY_STORAGE_KEY, JSON.stringify(all));
}

export function clearCopyOverride(type: string): void {
  const all = loadCopyOverrides();
  delete all[type];
  localStorage.setItem(PRODUCT_NOTIFICATION_COPY_STORAGE_KEY, JSON.stringify(all));
}

export function resolveProductNotificationCopy(
  type: string,
  overrides: Record<string, ProductNotificationCopy>,
): ProductNotificationCopy {
  return overrides[type] ?? defaultCopyForType(type);
}
