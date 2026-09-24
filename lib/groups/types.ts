import type { ProfileStub } from "@/lib/discussions/types";

export type AdminGroupHub = {
  id: string;
  title: string;
  location_hint: string | null;
  origin: string | null;
  avatar_url: string | null;
};

export type GroupVisibility = "public" | "restricted" | "private";

export const GROUP_VISIBILITY_VALUES: GroupVisibility[] = ["public", "restricted", "private"];

export const GROUP_VISIBILITY_LABELS: Record<GroupVisibility, string> = {
  public: "Public — anyone can join",
  restricted: "Restricted — request to join",
  private: "Private — invite only",
};

export type AdminGroupListItem = {
  id: string;
  discussion_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  category: string | null;
  categories: string[];
  avatar_url: string | null;
  visibility: string;
  archived_at: string | null;
  created_at: string;
  member_count: number;
  post_count: number;
  guidelines: string;
  hub: AdminGroupHub | null;
  creator: ProfileStub | null;
  /** True when the group is owned by the Sterling system account rather than a real user. */
  is_system_owned: boolean;
};

export type MovedGroupResult = {
  group_id: string;
  group_title: string;
  previous_title: string;
  source_hub_id: string;
  source_hub_title: string;
  target_hub_id: string;
  target_hub_title: string;
  posts_moved: number;
  members_joined: number;
  renamed: boolean;
};

export type AdminGroupContentItem = {
  id: string;
  parent_id: string | null;
  body: string;
  likes_count: number;
  created_at: string;
  image_url: string | null;
  gif_preview_url: string | null;
  author: ProfileStub | null;
  replies: AdminGroupContentItem[];
};

export type AdminGroupMember = {
  user_id: string;
  role: string;
  is_prop_account: boolean;
  profile: ProfileStub | null;
};

export type MoveGroupError = {
  group_id: string;
  error: string;
};

export type MoveGroupsResponse = {
  moved: MovedGroupResult[];
  errors: MoveGroupError[];
  moved_count: number;
  error_count: number;
  skipped_count: number;
};

export const GROUP_CATEGORY_LABELS: Record<string, string> = {
  hangouts: "Hangouts",
  bars: "Bars",
  restaurants: "Restaurants",
  cafes: "Cafes",
  nightlife: "Nightlife",
  music: "Music",
  sports: "Sports",
  outdoors: "Outdoors",
  gyms: "Gyms",
  neighbors: "Neighbors",
  family: "Family",
  food: "Food",
  marketplace: "Buy & sell",
  arts: "Arts",
  pets: "Pets",
  work: "Work",
  gaming: "Gaming",
  other: "Other",
  event_venues: "Event venues",
  clubs: "Clubs",
  lounges: "Lounges",
  music_venues: "Music venues",
  theaters: "Theaters",
  parks: "Parks",
  beaches: "Beaches",
  markets: "Markets",
  shops: "Shops",
  hotels: "Hotels",
  museums: "Museums",
  campus: "Campus",
  interest: "Interest",
};

export const GROUP_GUIDELINES_MAX_CHARS = 4000;

export function coerceGroupGuidelines(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, GROUP_GUIDELINES_MAX_CHARS) : "";
}

export function parseGroupGuidelines(value: unknown): string {
  const text = String(value ?? "").trim();
  if (text.length > GROUP_GUIDELINES_MAX_CHARS) {
    throw new Error("discussion_group_guidelines_invalid");
  }
  return text;
}

export function groupCategoryLabel(id: string | null | undefined): string {
  if (!id) return "Group";
  return GROUP_CATEGORY_LABELS[id] ?? id.replace(/_/g, " ");
}
