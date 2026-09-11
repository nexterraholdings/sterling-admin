export type SeededPlaceKind = "city" | "neighborhood";

export type SeededHubListItem = {
  id: string;
  title: string;
  description: string | null;
  center_lat: number;
  center_lng: number;
  radius_miles: number;
  location_hint: string | null;
  place_kind: SeededPlaceKind | null;
  place_key: string | null;
  avatar_url: string | null;
  unique_participant_count: number;
  comment_count: number;
  created_at: string;
  group_count: number;
  seeded_visible: boolean;
};

export type NearbyUserHub = {
  id: string;
  title: string;
  description: string | null;
  center_lat: number;
  center_lng: number;
  radius_miles: number;
  location_hint: string | null;
  lifecycle_status: string;
  avatar_url: string | null;
  creator_id: string | null;
  unique_participant_count: number;
  comment_count: number;
  created_at: string;
  distance_miles: number | null;
  in_range?: boolean;
  creator: {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

export type ConvertedHubResult = {
  source_id: string;
  source_title: string;
  target_id: string;
  group_id: string;
  group_title: string;
  posts_moved: number;
  group_members: number;
};

export type ConvertHubError = {
  source_id: string;
  error: string;
};

export type ConvertHubsResponse = {
  converted: ConvertedHubResult[];
  errors: ConvertHubError[];
  converted_count: number;
  error_count: number;
};

export type CityHubsLaunchState = {
  seeded_public: boolean;
  lifecycle_paused: boolean;
  released_at: string | null;
  leftover_converted: number;
  leftover_failed: number;
  seeded_count: number;
  leftover_user_hubs: number;
  hubs_with_stewards: number;
  already_converted: number;
};

export type CityHubsReleaseResult = CityHubsLaunchState & {
  converted: ConvertedHubResult[];
  errors: ConvertHubError[];
};

export const SEEDED_RADIUS_MIN = 1;
export const SEEDED_RADIUS_MAX = 50;

export function clampSeededRadius(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(SEEDED_RADIUS_MAX, Math.max(SEEDED_RADIUS_MIN, Math.round(value)));
}

export function placeKindForRadius(miles: number): SeededPlaceKind {
  return clampSeededRadius(miles) <= 10 ? "neighborhood" : "city";
}

export function isValidSeededCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export const SEEDED_SIZE_PRESETS: Array<{
  id: SeededPlaceKind;
  label: string;
  hint: string;
  radiusMiles: number;
}> = [
  { id: "neighborhood", label: "Neighborhood", hint: "A district or cluster of blocks", radiusMiles: 5 },
  { id: "city", label: "City", hint: "Metro coverage around a city center", radiusMiles: 30 },
];

export function mapSeededHubRpcError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("discussion_name_taken") || lower.includes("area_discussions_hub_name")) {
    return "That hub name is already in use.";
  }
  if (lower.includes("discussion_name_too_short") || lower.includes("discussion_name_required")) {
    return "Hub name must be at least 3 letters.";
  }
  if (lower.includes("discussion_name_too_long")) return "Hub name must be 24 characters or fewer.";
  if (lower.includes("discussion_name_invalid") || lower.includes("discussion_name_repeating")) {
    return "Use 3–24 lowercase letters and numbers, starting with a letter (like miami or brickell).";
  }
  if (lower.includes("discussion_name_reserved")) return "That hub name is reserved.";
  if (lower.includes("invalid_coordinates")) return "Enter a valid latitude and longitude.";
  if (lower.includes("invalid_seeded_radius") || lower.includes("area_discussions_radius_miles")) {
    return "Radius must be between 1 and 50 miles.";
  }
  if (lower.includes("seeded_hub_has_content")) {
    return "This city hub has groups or posts. Confirm deletion to remove them too.";
  }
  if (lower.includes("invalid_place_kind")) return "Size must be city or neighborhood.";
  if (lower.includes("discussion_description")) return "Add a longer hub description (at least a short sentence).";
  if (lower.includes("seeded_hub_required")) return "Pick a seeded city hub as the destination.";
  if (lower.includes("user_hub_required")) return "Only user-created hubs can be turned into groups.";
  if (lower.includes("hub_already_migrated")) return "That hub was already converted.";
  if (lower.includes("group_image_url_invalid")) return "That hub photo could not be copied onto the group.";
  if (lower.includes("hub_has_no_owner")) return "That hub has no steward to become the group owner.";
  if (lower.includes("discussion_not_found")) return "Hub not found.";
  if (lower.includes("convert_batch_too_large")) return "Convert at most 50 hubs at a time.";
  if (lower.includes("ids_required")) return "Select at least one hub to convert.";
  if (lower.includes("seeded_ids_required")) return "Select at least one seeded hub.";
  if (lower.includes("discussion_group_title_taken")) return "A group with that name already exists in this hub.";
  if (lower.includes("group_not_found")) return "Group not found.";
  if (lower.includes("same_hub")) return "That group is already in this hub.";
  if (lower.includes("groups_required")) return "Select at least one group to move.";
  if (lower.includes("move_batch_too_large")) return "Move at most 50 groups at a time.";
  if (lower.includes("already_released")) return "City hubs are already live. This switch cannot be undone.";
  if (lower.includes("no_seeded_hubs")) return "Plant at least one city hub before showing them on store apps.";
  if (lower.includes("hub_lifecycle_paused")) return "Hub stewardship is paused.";
  return message;
}
