-- Grant dashboard access to an auth user. Console login reads sterling_admins,
-- not profiles.account_role.
--
-- 1. Authentication -> Users -> Add user (email + password), or use an existing auth user.
-- 2. Run this, swapping in that email:

insert into public.sterling_admins (user_id, role)
select id, 'owner'
from auth.users
where email = 'YOUR_EMAIL_HERE'
on conflict (user_id) do update
  set role = excluded.role,
      disabled_at = null;

-- 3. Check it worked:

select a.user_id, u.email, a.role, a.disabled_at
from public.sterling_admins a
join auth.users u on u.id = a.user_id
where u.email = 'YOUR_EMAIL_HERE';
