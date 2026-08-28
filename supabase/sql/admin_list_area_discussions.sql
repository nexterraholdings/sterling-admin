-- Admin list for area hubs. Hubs are location-pinned; they are not linked to
-- public.communities (that table no longer exists).
--
-- p_community_search is kept in the signature so existing callers do not break.
-- It is ignored.
--
-- Run: npx supabase db query --linked -f supabase/sql/admin_list_area_discussions.sql

create or replace function public.admin_list_area_discussions(
  p_search text default null,
  p_location_hint text default null,
  p_community_search text default null,
  p_creator_search text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_lifecycle_status text default null,
  p_live_only boolean default false,
  p_min_reports integer default 0,
  p_sort text default '-created_at',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_sort_col text;
  v_sort_asc boolean;
  v_offset integer;
  v_limit integer;
  v_page integer;
  v_total bigint;
  v_rows jsonb;
begin
  v_sort_col := trim(both '-' from coalesce(p_sort, '-created_at'));
  v_sort_asc := coalesce(p_sort, '-created_at') not like '-%';
  v_page := greatest(1, coalesce(p_page, 1));
  v_limit := least(100, greatest(1, coalesce(p_page_size, 20)));
  v_offset := (v_page - 1) * v_limit;

  if v_sort_col not in (
    'created_at', 'comment_count', 'rate_count', 'avg_rate',
    'engagement_score', 'title', 'live_last_go_live_at'
  ) then
    raise exception 'invalid_sort_column';
  end if;

  if p_lifecycle_status is not null and p_lifecycle_status not in (
    'bootstrap', 'active', 'grace', 'claimable', 'auction', 'expired'
  ) then
    raise exception 'invalid_lifecycle_status';
  end if;

  with filtered as (
    select
      d.*,
      coalesce(rc.report_count, 0)::integer as report_count,
      p.id as creator_profile_id,
      p.full_name as creator_full_name,
      p.username as creator_username,
      p.avatar_url as creator_avatar_url
    from public.area_discussions d
    left join public.profiles p on p.id = d.creator_id
    left join (
      select r.discussion_id, count(*)::integer as report_count
      from public.reports r
      where r.report_type = 'area_discussion'
        and r.status = 'pending'
        and r.discussion_id is not null
      group by r.discussion_id
    ) rc on rc.discussion_id = d.id
    where (p_search is null or trim(p_search) = '' or d.title ilike '%' || trim(p_search) || '%')
      and (p_location_hint is null or trim(p_location_hint) = '' or d.location_hint ilike '%' || trim(p_location_hint) || '%')
      and (
        p_creator_search is null or trim(p_creator_search) = ''
        or p.username ilike '%' || trim(p_creator_search) || '%'
        or p.full_name ilike '%' || trim(p_creator_search) || '%'
      )
      and (p_date_from is null or d.created_at >= p_date_from)
      and (p_date_to is null or d.created_at <= p_date_to)
      and (p_lifecycle_status is null or d.lifecycle_status::text = p_lifecycle_status)
      and (not coalesce(p_live_only, false) or d.is_live = true)
      and coalesce(rc.report_count, 0) >= greatest(0, coalesce(p_min_reports, 0))
  ),
  counted as (
    select count(*)::bigint as total from filtered
  ),
  page as (
    select *
    from filtered f
    order by
      case when v_sort_col = 'created_at' and v_sort_asc then f.created_at end asc nulls last,
      case when v_sort_col = 'created_at' and not v_sort_asc then f.created_at end desc nulls last,
      case when v_sort_col = 'comment_count' and v_sort_asc then f.comment_count end asc nulls last,
      case when v_sort_col = 'comment_count' and not v_sort_asc then f.comment_count end desc nulls last,
      case when v_sort_col = 'rate_count' and v_sort_asc then f.rate_count end asc nulls last,
      case when v_sort_col = 'rate_count' and not v_sort_asc then f.rate_count end desc nulls last,
      case when v_sort_col = 'avg_rate' and v_sort_asc then f.avg_rate end asc nulls last,
      case when v_sort_col = 'avg_rate' and not v_sort_asc then f.avg_rate end desc nulls last,
      case when v_sort_col = 'engagement_score' and v_sort_asc then f.engagement_score end asc nulls last,
      case when v_sort_col = 'engagement_score' and not v_sort_asc then f.engagement_score end desc nulls last,
      case when v_sort_col = 'title' and v_sort_asc then f.title end asc nulls last,
      case when v_sort_col = 'title' and not v_sort_asc then f.title end desc nulls last,
      case when v_sort_col = 'live_last_go_live_at' and v_sort_asc then f.live_last_go_live_at end asc nulls last,
      case when v_sort_col = 'live_last_go_live_at' and not v_sort_asc then f.live_last_go_live_at end desc nulls last,
      f.id asc
    limit v_limit
    offset v_offset
  )
  select (select total from counted),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'discussion', to_jsonb(f) - 'creator_profile_id' - 'creator_full_name' - 'creator_username' - 'creator_avatar_url' - 'report_count',
            'creator', case when f.creator_profile_id is null then null else jsonb_build_object(
              'id', f.creator_profile_id,
              'full_name', f.creator_full_name,
              'username', f.creator_username,
              'avatar_url', f.creator_avatar_url
            ) end,
            'report_count', f.report_count
          )
        )
        from page f
      ),
      '[]'::jsonb
    )
  into v_total, v_rows;

  return jsonb_build_object(
    'total', coalesce(v_total, 0),
    'page', v_page,
    'page_size', v_limit,
    'discussions', coalesce(v_rows, '[]'::jsonb)
  );
end;
$function$;
