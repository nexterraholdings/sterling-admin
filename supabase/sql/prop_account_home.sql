-- Where each prop account lives and which languages it writes. A prop posting
-- in a hub more than 60 miles from its home writes as a visitor. Blank home
-- means "the hub where most of its groups are"; blank languages means the
-- home hub's language. Safe to re-run.
alter table public.prop_account_personas
  add column if not exists home_hub_id uuid references public.area_discussions (id) on delete set null,
  add column if not exists languages text[] not null default '{}';
