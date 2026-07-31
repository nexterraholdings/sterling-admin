-- Run this in the Supabase SQL editor (or via CLI migration).
-- Adds a two-tier automatic response to mass-reported posts, gated by
-- DISTINCT DEVICES THAT ACTUALLY FILED A REPORT (not just distinct accounts,
-- and not a reporter's entire device history) reporting the same post.
--
-- Tier 1 (>=5 distinct devices): posts.status -> 'auto_hidden', is_pinned -> false.
--   Confirmed: the mobile app's feed/read queries filter on status = 'active'
--   (feedAlgorithm.ts, get_home_feed_page, useProfileQuery.ts, useDeepLinking.ts,
--   notificationNavigation.ts, and the pinned-posts query in useFeedQuery.ts all
--   check status = 'active'), so 'auto_hidden' is correctly excluded everywhere.
--
-- Tier 2 (>=15 distinct devices): additionally calls the existing
-- admin_ban_user() RPC on the post's author with a 7-day expiry (temporary,
-- reversible — never permanent) and p_also_ban_devices = false (a human
-- decides on devices once they review). Guarded per-post (target_type='post',
-- target_id=post_id) so a user who is auto-suspended once can still be
-- auto-suspended again if a *different* post of theirs is later mass-reported.
--
-- Both tiers are one-shot per post: guarded by checking audit_logs
-- for an existing entry, so additional reports past the threshold don't
-- re-fire or spam the log. Both log to audit_logs directly (category
-- 'system', actor_label 'auto-moderation') since triggers can't call the
-- app's logAdminAction() helper (app/dashboard/lib/audit-log.ts).
--
-- Device counting: reports.device_id is captured by the mobile client at
-- submission time (getDeviceIdSafe() in src/lib/utils/deviceId.ts). Reports
-- filed before this column existed (or from a client that hasn't updated)
-- fall back to one "device" per distinct reporter, so old rows neither
-- vanish nor get double-counted. The previous version of this trigger joined
-- through device_identifiers by reporter_id alone, which summed EVERY device
-- a reporter has ever registered (phone upgrades, a tablet, reinstalls) —
-- so 2-3 real reporters could already look like 5-15 "distinct devices" and
-- trip auto-hide/auto-suspend on a handful of real reports. Do not revert to
-- that join.
--
-- Assumes: reports(id, reporter_id, report_type, post_id, device_id, status,
-- created_at), posts(id, author_id, status, is_pinned),
-- audit_logs(category, action, detail, target_type, target_id, actor_label),
-- and the existing admin_ban_user(p_user_id, p_reason, p_ban_type,
-- p_expires_at, p_also_ban_devices) RPC used by banned-users/actions.ts.

create or replace function fn_auto_moderate_post_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_count integer;
  v_author_id uuid;
begin
  if NEW.report_type <> 'post' or NEW.post_id is null then
    return NEW;
  end if;

  select count(distinct coalesce(r.device_id, 'reporter:' || r.reporter_id::text))
  into v_device_count
  from reports r
  where r.post_id = NEW.post_id
    and r.report_type = 'post';

  -- Tier 1: auto-hide the post (and unpin it — a hidden post must not stay
  -- pinned at the top of the community feed)
  if v_device_count >= 5
     and not exists (
       select 1 from audit_logs
       where action = 'auto_hide_post' and target_id = NEW.post_id::text
     )
  then
    update posts
    set status = 'auto_hidden',
        is_pinned = false
    where id = NEW.post_id
      and status is distinct from 'removed';

    insert into audit_logs (category, action, detail, target_type, target_id, actor_label)
    values (
      'system',
      'auto_hide_post',
      format('Post auto-hidden after reports from %s distinct devices', v_device_count),
      'post',
      NEW.post_id::text,
      'auto-moderation'
    );
  end if;

  -- Tier 2: auto-suspend the author (temporary, reversible — never permanent) — once per post
  if v_device_count >= 15 then
    select author_id into v_author_id from posts where id = NEW.post_id;

    if v_author_id is not null and not exists (
      select 1 from audit_logs
      where action = 'auto_suspend_user'
        and target_type = 'post'
        and target_id = NEW.post_id::text
    ) then
      perform admin_ban_user(
        p_user_id => v_author_id,
        p_reason => format('Auto-suspended: post reported by %s distinct devices', v_device_count),
        p_ban_type => 'general',
        p_expires_at => now() + interval '7 days',
        p_also_ban_devices => false
      );

      insert into audit_logs (category, action, detail, target_type, target_id, actor_label)
      values (
        'system',
        'auto_suspend_user',
        format(
          'User %s auto-suspended for 7 days after post %s was reported by %s distinct devices',
          v_author_id,
          NEW.post_id,
          v_device_count
        ),
        'post',
        NEW.post_id::text,
        'auto-moderation'
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_auto_moderate_post_report on reports;
create trigger trg_auto_moderate_post_report
  after insert on reports
  for each row
  execute function fn_auto_moderate_post_report();
