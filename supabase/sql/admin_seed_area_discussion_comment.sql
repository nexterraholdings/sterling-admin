-- Admin-only exception to the feed_location_enforced trigger
-- (trg_area_discussion_comments_feed_location / enforce_area_discussion_feed_post_via_rpc).
-- Real users must post via create_area_discussion_comment(), which requires
-- auth.uid() and a real device location. The admin dashboard seeds content as
-- service_role with no user session, so it needs its own narrow bypass.
-- Restricted to service_role only — anon/authenticated cannot call this.
drop function if exists public.admin_create_area_discussion_comment(uuid, uuid, uuid, text);
drop function if exists public.admin_create_area_discussion_comment(uuid, uuid, uuid, text, uuid);

create or replace function public.admin_create_area_discussion_comment(
  p_discussion_id uuid,
  p_group_id uuid,
  p_author_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns table (
  out_id uuid,
  out_author_id uuid,
  out_body text,
  out_likes_count integer,
  out_created_at timestamptz,
  out_parent_id uuid
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_parent_id uuid;
begin
  if p_author_id is null then
    raise exception 'author_required';
  end if;

  if not exists (select 1 from public.profiles where id = p_author_id) then
    raise exception 'author_not_found';
  end if;

  if not exists (select 1 from public.area_discussions where id = p_discussion_id) then
    raise exception 'discussion_not_found';
  end if;

  if p_group_id is not null and not exists (
    select 1 from public.discussion_groups
    where id = p_group_id and discussion_id = p_discussion_id
  ) then
    raise exception 'discussion_group_hub_mismatch';
  end if;

  -- The app only ever threads one level deep: CommentRow always attaches a
  -- reply-to-a-reply to the top-level comment (threadParentId = comment.id in
  -- SterlingMobile), never to the reply itself. A comment whose parent is
  -- itself a reply is never fetched by the app's reply queries (which only
  -- look up children of a top-level id), so it'd be seeded invisibly. Resolve
  -- p_parent_id up to its top-level ancestor here so seeded replies land
  -- exactly where the app would put them.
  if p_parent_id is not null then
    select coalesce(c.parent_id, c.id) into v_parent_id
    from public.area_discussion_comments c
    where c.id = p_parent_id
      and c.discussion_id = p_discussion_id
      and c.group_id is not distinct from p_group_id;

    if v_parent_id is null then
      raise exception 'parent_not_found';
    end if;
  else
    v_parent_id := null;
  end if;

  perform set_config('app.discussion_feed_bypass_location', '1', true);

  insert into public.area_discussion_comments (discussion_id, group_id, author_id, body, parent_id, likes_count, created_at)
  values (p_discussion_id, p_group_id, p_author_id, coalesce(btrim(p_body), ''), v_parent_id, 0, now())
  returning area_discussion_comments.id into v_id;

  return query
  select c.id, c.author_id, c.body, c.likes_count, c.created_at, c.parent_id
  from public.area_discussion_comments c
  where c.id = v_id;
end;
$function$;

revoke all on function public.admin_create_area_discussion_comment(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_area_discussion_comment(uuid, uuid, uuid, text, uuid) to service_role;

-- One-off cleanup: re-parent any comments seeded before this fix whose
-- parent is itself a reply (grandchildren, great-grandchildren, ...), so
-- they surface in the app instead of sitting invisibly under a reply the
-- app never queries into. Walks each comment's ancestor chain all the way
-- to its top-level root in one pass, however deep the old chain went.
with recursive ancestry as (
  select c.id, c.parent_id as root_id
  from public.area_discussion_comments c
  where c.parent_id is not null
  union all
  select a.id, p.parent_id
  from ancestry a
  join public.area_discussion_comments p on p.id = a.root_id
  where p.parent_id is not null
)
update public.area_discussion_comments as target
set parent_id = resolved.root_id
from (
  select a.id, a.root_id
  from ancestry a
  join public.area_discussion_comments r on r.id = a.root_id
  where r.parent_id is null
) as resolved
where target.id = resolved.id
  and target.parent_id is distinct from resolved.root_id;
