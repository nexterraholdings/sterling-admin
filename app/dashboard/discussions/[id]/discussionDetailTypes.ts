import type { CommunityStub, DiscussionRow, LiveSessionRow, ProfileStub } from "@/lib/discussions/types";

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
  community: CommunityStub | null;
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
  ratings: {
    avg_rate: number | null;
    rate_count: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  };
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
  liveSessions: LiveSessionRow[];
  liveLimits: Record<string, unknown> | null;
  auction: Record<string, unknown> | null;
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

export function formatLiveDuration(started: string, ended: string | null): string {
  const startMs = Date.parse(started);
  const endMs = ended ? Date.parse(ended) : Date.now();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "—";
  const mins = Math.max(0, Math.round((endMs - startMs) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
