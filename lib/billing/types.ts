export type BillingPlanId = "free" | "sterling_plus" | "sterling_premium";

export type BillingStatus =
  | "active"
  | "grace_period"
  | "cancelled"
  | "expired"
  | "inactive";

export type BillingMetrics = {
  active_plus: number;
  active_premium: number;
  active_total: number;
  sandbox_active: number;
  expired_last_30_days: number;
  webhook_events_last_30_days: number;
  purchase_events_last_30_days: number;
  estimated_mrr_usd: number;
};

export type BillingSubscriberRow = {
  user_id: string;
  plan: BillingPlanId;
  status: BillingStatus;
  store: string | null;
  environment: string | null;
  product_id: string | null;
  expires_at: string | null;
  will_renew: boolean;
  is_sandbox: boolean;
  updated_at: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
};

export type BillingListResponse = {
  subscribers: BillingSubscriberRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type BillingEventRow = {
  id: string;
  rc_event_id: string;
  event_type: string;
  app_user_id: string | null;
  product_id: string | null;
  store: string | null;
  environment: string | null;
  received_at: string;
  apply_error: string | null;
};

export type BillingEventsResponse = {
  events: BillingEventRow[];
  total: number;
  page: number;
  pageSize: number;
};
