export type UUID = string;

export type UserRole = "member" | "creator" | "moderator" | "admin" | "support" | "owner";
export type AccountRole = "creator" | "member" | "moderator" | "admin" | "owner";
export type ModerationActionType = "suspend" | "ban" | "warning" | "review";
export type NotificationType = "comment" | "report" | "message" | "system" | "community" | "alert";

export interface UserProfile {
  id: UUID;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  role?: string | null;
  operating_markets: string[];
  market_other?: string | null;
  main_goals: string[];
  created_at: string;
  updated_at: string;
  avatar_url?: string | null;
  banner_url?: string | null;
  bio?: string | null;
  account_role: string;
  moderation_strike_count: number;
  phone_number?: string | null;
  /** Present when loaded with auth presence check */
  has_auth?: boolean;
}

export interface AuthUserRow {
  id: UUID;
  email?: string | null;
  phone?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  has_profile: boolean;
  profile_username?: string | null;
  profile_full_name?: string | null;
}

export type UserDeleteTarget = "both" | "auth" | "profile";

export interface Post {
  id: UUID;
  community_id?: UUID | null;
  author_id?: UUID | null;
  body?: string | null;
  image_url?: string | null;
  status?: string | null;
  likes_count?: number | null;
  comments_count?: number | null;
  category?: string | null;
  community_name?: string | null;
  author_username?: string | null;
  image_urls?: string[] | null;
  property_attachment?: unknown;
  post_type?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PostComment {
  id: UUID;
  post_id: UUID;
  author_id: UUID;
  body: string;
  parent_id?: UUID | null;
  likes_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CommentLike {
  id: UUID;
  comment_id: UUID;
  user_id: UUID;
  created_at?: string;
}

export interface PostLike {
  id: UUID;
  post_id: UUID;
  user_id: UUID;
  created_at?: string;
}

export type ReportType   = "post" | "profile" | "bug";
export type ReportStatus = "pending" | "reviewed" | "dismissed" | "actioned";
export type ReportCategory =
  | "hate_speech" | "harassment" | "spam" | "misinformation"
  | "nudity" | "violence" | "impersonation"
  | "crash" | "ui_issue" | "performance" | "data_loss"
  | "other";

export interface Report {
  id: UUID;
  created_at: string;
  reporter_id: UUID;
  report_type: ReportType;
  post_id?: UUID | null;
  reported_user_id?: UUID | null;
  category: ReportCategory;
  description?: string | null;
  screenshot_urls?: string[] | null;
  status: ReportStatus;
}

export interface EventRecord {
  id: UUID;
  host_id?: UUID | null;
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  starts_at?: string | null;
  duration_minutes?: number | null;
  event_type?: string | null;
  is_private?: boolean | null;
  attendee_count?: number | null;
  attended_count?: number | null;
  posts_count?: number | null;
  category?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Community {
  id: UUID;
  owner_id?: UUID | null;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  category?: string | null;
  visibility?: string | null;
  joined_at?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  members_count?: number | null;
  posts_count?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface CommunityMember {
  id: UUID;
  community_id: UUID;
  user_id: UUID;
  role?: string | null;
  joined_at?: string | null;
  created_at?: string;
}

export interface MessageRecord {
  id: UUID;
  sender_id: UUID;
  recipient_id: UUID;
  body?: string | null;
  created_at?: string;
  read_at?: string | null;
}

export interface UserProperty {
  id: UUID;
  user_id: UUID;
  name?: string | null;
  address?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  unit_apt?: string | null;
  status?: string | null;
  property_type?: string | null;
  estimated_market_value?: number | null;
  estimated_monthly_rent?: number | null;
  image_url?: string | null;
  photos?: string[] | null;
  occupancy?: number | null;
  market_value_est?: number | null;
  rent_estimate?: number | null;
  cash_flow?: number | null;
  cap_rate?: number | null;
  arv?: number | null;
  rehab_budget?: number | null;
  use_cases?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PortfolioSnapshot {
  id: UUID;
  user_id: UUID;
  snapshot_date?: string | null;
  properties_count?: number | null;
  portfolio_value?: number | null;
  avg_occupancy?: number | null;
  created_at?: string;
}

export interface NotificationRecord {
  id: UUID;
  user_id: UUID;
  type?: NotificationType | null;
  title?: string | null;
  body?: string | null;
  community_id?: UUID | null;
  post_id?: UUID | null;
  actor_id?: UUID | null;
  is_read?: boolean | null;
  created_at?: string;
}

export interface PollVote {
  id: UUID;
  post_id: UUID;
  user_id: UUID;
  option_id: UUID;
  created_at?: string;
}

export interface BlockedUser {
  id: UUID;
  blocker_id: UUID;
  blocked_id: UUID;
  created_at?: string;
}

export interface ChatClearance {
  id: UUID;
  user_id: UUID;
  other_user_id: UUID;
  cleared_at?: string;
}

export interface UserSetting {
  id: UUID;
  user_id: UUID;
  show_in_search?: boolean | null;
  allow_vendors_text?: boolean | null;
  messages_from?: string | null;
  push_notifications?: boolean | null;
  email_notifications?: boolean | null;
  in_app_notifications?: boolean | null;
  notif_new_messages?: boolean | null;
  notif_connections?: boolean | null;
  notif_vendor_updates?: boolean | null;
  notif_community?: boolean | null;
  notif_deal_alerts?: boolean | null;
  updated_at?: string;
}

export interface UserCategoryInterest {
  id: UUID;
  user_id: UUID;
  category?: string | null;
  interest_score?: number | null;
  posts_created?: number | null;
  posts_liked?: number | null;
  posts_commented?: number | null;
  communities_joined?: number | null;
  last_interaction_at?: string | null;
}

export interface UserPushToken {
  id: UUID;
  user_id: UUID;
  expo_push_token?: string | null;
  created_at?: string;
}
