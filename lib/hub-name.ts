export const HUB_NAME_MIN = 3;
export const HUB_NAME_MAX = 24;

export const HUB_NAME_HINT =
  "3–24 letters and numbers, no spaces, unique across every hub (like miami or brickell).";

const RESERVED_HUB_NAMES = new Set([
  "about",
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "clips",
  "contact",
  "create",
  "dashboard",
  "discussion",
  "discussions",
  "dmca",
  "event",
  "events",
  "explore",
  "feed",
  "guidelines",
  "help",
  "home",
  "hub",
  "hubs",
  "inbox",
  "jefgrowzz",
  "legal",
  "login",
  "map",
  "maps",
  "messages",
  "mod",
  "moderator",
  "official",
  "owner",
  "post",
  "posts",
  "privacy",
  "profile",
  "search",
  "settings",
  "signin",
  "signup",
  "staff",
  "sterling",
  "sterlingtheapp",
  "support",
  "terms",
  "username",
]);

const REPEAT_RE = /(.)\1{3,}/;

export type HubNameConflict = {
  id: string;
  title: string;
  origin: string;
  lifecycle_status: string | null;
};

export function sanitizeHubNameInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, HUB_NAME_MAX);
}

export function normalizeHubName(value: string): string {
  return sanitizeHubNameInput(value);
}

export function hubNameFormatError(value: string): string | null {
  const slug = normalizeHubName(value);
  if (!slug) return "Hub name must be at least 3 letters.";
  if (slug.length < HUB_NAME_MIN) return "Hub name must be at least 3 letters.";
  if (slug.length > HUB_NAME_MAX) return "Hub name must be 24 characters or fewer.";
  if (!/^[a-z][a-z0-9]*$/.test(slug)) {
    return HUB_NAME_HINT;
  }
  if (REPEAT_RE.test(slug)) {
    return "Don’t repeat the same letter or number 4 times in a row.";
  }
  if (RESERVED_HUB_NAMES.has(slug)) return "That hub name is reserved.";
  return null;
}

export function isValidHubNameFormat(value: string): boolean {
  return hubNameFormatError(value) === null;
}

export function assertHubName(value: string): string {
  const slug = normalizeHubName(value);
  const error = hubNameFormatError(slug);
  if (error) throw new Error(error);
  return slug;
}

export function hubNamesCollide(a: string, b: string): boolean {
  const left = normalizeHubName(a);
  const right = normalizeHubName(b);
  return left.length > 0 && left === right;
}

export function hubNameConflictMessage(conflict: HubNameConflict): string {
  const kind = conflict.origin === "seeded" ? "seeded hub" : "user hub";
  const expired = conflict.lifecycle_status === "expired" ? " (expired)" : "";
  return `That name is already used by the ${kind} ${conflict.title}${expired}.`;
}

export function mapHubNameDbError(message: string | undefined | null): string | null {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("discussion_name_taken") || msg.includes("area_discussions_hub_name")) {
    return "That hub name is already in use.";
  }
  if (msg.includes("discussion_name_too_short") || msg.includes("discussion_name_required")) {
    return "Hub name must be at least 3 letters.";
  }
  if (msg.includes("discussion_name_too_long")) return "Hub name must be 24 characters or fewer.";
  if (msg.includes("discussion_name_reserved")) return "That hub name is reserved.";
  if (msg.includes("discussion_name_repeating") || msg.includes("discussion_name_invalid")) {
    return HUB_NAME_HINT;
  }
  return null;
}
