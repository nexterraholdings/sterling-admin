import type { DiscussionRow, ProfileStub } from "@/lib/discussions/types";

export type ReverseGeocodedAddress = {
  display_name: string;
  road: string | null;
  house_number: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
};

export type DetailDiscussion = DiscussionRow & {
  creator: ProfileStub | null;
};

export type DetailComment = {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  parent_id: string | null;
  likes_count: number;
  created_at: string;
  is_hidden?: boolean;
  is_pinned?: boolean;
  image_url?: string | null;
  gif_preview_url?: string | null;
  author: ProfileStub | null;
};

export type DetailResponse = {
  discussion: DetailDiscussion;
  comments: DetailComment[];
  reports: Array<{
    id: string;
    reporter_id: string;
    category: string;
    description: string | null;
    status: string;
    created_at: string;
    reporter: ProfileStub | null;
  }>;
  address: ReverseGeocodedAddress | null;
  stewardshipClaims: Array<{ user_id: string; created_at: string }>;
};

export function formatDiscussionDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function profileLabel(p: ProfileStub | null): string {
  if (!p) return "Unknown user";
  return p.username ? `@${p.username}` : p.full_name ?? "Unknown user";
}
