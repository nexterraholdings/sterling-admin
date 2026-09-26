-- Age and other traits for one prop account. The writer uses them to
-- choose interests and how that account phrases a line.
alter table public.prop_account_personas
  add column if not exists age smallint,
  add column if not exists interests text not null default '',
  add column if not exists temperament text not null default '',
  add column if not exists talk text not null default '',
  add column if not exists life text not null default '';

alter table public.prop_account_personas
  drop constraint if exists prop_account_personas_age_check;

alter table public.prop_account_personas
  add constraint prop_account_personas_age_check
  check (age is null or age between 13 and 99);

alter table public.prop_account_personas
  drop constraint if exists prop_account_personas_temperament_check;

alter table public.prop_account_personas
  add constraint prop_account_personas_temperament_check
  check (temperament in ('', 'easygoing', 'warm', 'blunt', 'dry', 'anxious', 'upbeat'));

alter table public.prop_account_personas
  drop constraint if exists prop_account_personas_talk_check;

alter table public.prop_account_personas
  add constraint prop_account_personas_talk_check
  check (talk in ('', 'brief', 'ordinary', 'chatty'));

alter table public.prop_account_personas
  drop constraint if exists prop_account_personas_life_check;

alter table public.prop_account_personas
  add constraint prop_account_personas_life_check
  check (life in ('', 'student', 'working', 'parent', 'retired', 'new'));
