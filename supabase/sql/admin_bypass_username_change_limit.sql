-- Allow SterlingAdmin (service_role) to change profile usernames.
-- Run: npx supabase db query --linked -f supabase/sql/admin_bypass_username_change_limit.sql

CREATE OR REPLACE FUNCTION public.trg_enforce_username_change_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count  int;
  v_limit  int := 2;
  v_window interval := interval '3 months';
BEGIN
  IF NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  -- First-time username assignment during onboarding does not count.
  IF COALESCE(TRIM(OLD.username), '') = '' THEN
    RETURN NEW;
  END IF;

  -- Service-role (SterlingAdmin) may rename any profile, including prop accounts.
  -- Skip the 2-per-3-months cap too: those limits are for people changing their
  -- own handle in the app, not for operators seeding test accounts.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to update this profile'
      USING ERRCODE = '42501';
  END IF;

  v_count := public.count_username_changes_in_window(NEW.id, v_window);

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'USERNAME_CHANGE_LIMIT: You can change your username only 2 times every 3 months.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
