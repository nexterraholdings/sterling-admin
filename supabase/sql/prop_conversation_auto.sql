-- When false, autopilot finishes the lines already queued for the group
-- but does not start new posts or join existing threads on its own.
alter table public.prop_conversation_groups
  add column if not exists auto_continue boolean not null default true;
