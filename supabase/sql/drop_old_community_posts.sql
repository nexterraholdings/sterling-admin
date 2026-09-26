-- Old community feed. public.communities is already gone, but public.posts
-- still holds those posts (community_id set on every row). The count trigger
-- still updates public.communities, so it has to go before the delete.
-- Dependent likes, comments, flags, saves, and notifications cascade.
-- reports.post_id is set null.
--
-- Run: npx supabase db query --linked -f supabase/sql/drop_old_community_posts.sql

drop trigger if exists trg_posts_count_after_delete on public.posts;
drop trigger if exists trg_posts_count_after_insert on public.posts;
drop function if exists public.handle_posts_count();

delete from public.posts
where community_id is not null;
