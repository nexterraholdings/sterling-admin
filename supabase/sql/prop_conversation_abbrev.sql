-- How often a conversation run uses texting abbreviations. 0 is spelled out, 100 is heavy.
alter table public.prop_conversation_groups
  add column if not exists abbrev smallint not null default 0;

alter table public.prop_conversation_groups
  drop constraint if exists prop_conversation_groups_abbrev_check;

alter table public.prop_conversation_groups
  add constraint prop_conversation_groups_abbrev_check
  check (abbrev between 0 and 100);
