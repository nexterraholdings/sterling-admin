export type ListingType = "sale" | "rent" | "deal";
export type ListingStatus = "active" | "pending" | "sold" | "expired";
export type LeadStatus = "new" | "contacted" | "closed";

export type CommunityListingRow = {
  id: string;
  community_id: string;
  created_by: string;
  title: string;
  description: string | null;
  address: string;
  lat: number;
  lng: number;
  price: number | null;
  listing_type: ListingType;
  status: ListingStatus;
  photos: string[];
  post_id: string | null;
  after_repair_value: number | null;
  estimated_rehab_cost: number | null;
  estimated_monthly_rent: number | null;
  cap_rate: number | null;
  cash_on_cash_return: number | null;
  investment_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ListingCommunityStub = {
  id: string;
  name: string | null;
  community_type: string | null;
};

export type ListingCreatorStub = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type ListingListItem = {
  listing: CommunityListingRow;
  community: ListingCommunityStub | null;
  creator: ListingCreatorStub | null;
  lead_count: number;
};

export type LeadRow = {
  id: string;
  listing_id: string;
  community_id: string;
  user_id: string;
  message: string | null;
  status: LeadStatus;
  created_at: string;
};

export type LeadContactStub = {
  full_name: string;
  avatar_url: string;
  phone_number: string | null;
  email: string | null;
};

export type LeadListItem = {
  lead: LeadRow;
  listing: { id: string; title: string };
  community: { id: string; name: string | null };
  contact: LeadContactStub;
};

export const LISTING_TYPE_LABEL: Record<ListingType, string> = {
  sale: "Sale",
  rent: "Rent",
  deal: "Deal",
};

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  active: "Active",
  pending: "Pending",
  sold: "Sold",
  expired: "Expired",
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  closed: "Closed",
};
