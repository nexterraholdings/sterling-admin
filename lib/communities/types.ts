export type CommunityType = "standard" | "brokerage";
export type AddressVerificationStatus = "unverified" | "pending" | "verified" | "rejected";
export type IsPlusSource = "manual" | "billing";

export type Community = {
  id: string;
  name: string | null;
  description: string | null;
  category: string | null;
  visibility: string | null;
  members_count: number;
  posts_count: number;
  created_at: string | null;
  community_type: CommunityType;
  address: string | null;
  lat: number | null;
  lng: number | null;
  address_verification_status: AddressVerificationStatus;
  address_reviewed_by: string | null;
  address_reviewed_at: string | null;
  is_plus: boolean;
  is_plus_source: IsPlusSource | null;
  is_plus_granted_by: string | null;
  is_plus_granted_at: string | null;
};

export const COMMUNITY_TYPE_LABEL: Record<CommunityType, string> = {
  standard: "Standard",
  brokerage: "Brokerage",
};

export const ADDRESS_VERIFICATION_LABEL: Record<AddressVerificationStatus, string> = {
  unverified: "Unverified",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
};
