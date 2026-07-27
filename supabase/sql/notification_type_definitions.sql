-- Admin-defined custom notification types (v1). See Sterling/supabase/migrations/20260727210000_custom_notification_definitions.sql

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS route_context jsonb;

-- (full migration applied via Sterling migrations folder)
