import type { DiscussionLifecycleStatus } from "./types";

/** Values admins may set via dashboard (auction merged into claimable). */
export const ADMIN_DISCUSSION_LIFECYCLE_STATUSES = [
  "bootstrap",
  "active",
  "grace",
  "claimable",
  "expired",
] as const;

export type AdminDiscussionLifecycleStatus = (typeof ADMIN_DISCUSSION_LIFECYCLE_STATUSES)[number];

export const ADMIN_DISCUSSION_LIFECYCLE_OPTIONS: {
  value: AdminDiscussionLifecycleStatus;
  label: string;
  description: string;
}[] = [
  { value: "bootstrap", label: "Starting up", description: "Needs enough participants before going live" },
  { value: "active", label: "Live", description: "Steward check-in rhythm" },
  { value: "grace", label: "At risk", description: "Steward missed check-in; short grace window" },
  {
    value: "claimable",
    label: "Claimable",
    description: "Hub locked on gate; members register to claim (24h window)",
  },
  { value: "expired", label: "Ended", description: "Removed from the map" },
];

export const ADMIN_DISCUSSION_LIFECYCLE_FILTER_OPTIONS = [
  { value: "", label: "Any status" },
  ...ADMIN_DISCUSSION_LIFECYCLE_OPTIONS.map(({ value, label }) => ({ value, label })),
];

const ADMIN_SET = new Set<string>(ADMIN_DISCUSSION_LIFECYCLE_STATUSES);

export function isAdminDiscussionLifecycleStatus(value: string): value is AdminDiscussionLifecycleStatus {
  return ADMIN_SET.has(value);
}

/** Map legacy DB/API values for display and filters. */
export function normalizeDiscussionLifecycleStatus(status: string): DiscussionLifecycleStatus {
  if (status === "auction") return "claimable";
  if (
    status === "bootstrap"
    || status === "active"
    || status === "grace"
    || status === "claimable"
    || status === "expired"
  ) {
    return status;
  }
  return "active";
}

export function normalizeAdminLifecycleStatus(status: string): AdminDiscussionLifecycleStatus {
  if (status === "auction") return "claimable";
  if (isAdminDiscussionLifecycleStatus(status)) return status;
  return "active";
}

/** For list API: legacy `auction` filter matches claimable hubs. */
export function normalizeLifecycleFilterParam(status: string | null): string | null {
  if (!status) return null;
  if (status === "auction") return "claimable";
  return status;
}

export function lifecyclePillKey(status: string): string {
  return normalizeDiscussionLifecycleStatus(status);
}
