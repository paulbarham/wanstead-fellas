-- Admin-only view of who can access the app and who has actually signed in.
-- The client (anon/publishable key) can't read auth.users directly, so this
-- SECURITY DEFINER function joins the sign-in roster (member_seed) to the real
-- auth accounts and returns login status. It self-gates to admins and is not
-- callable by the anon role.
create or replace function public.admin_access_overview()
returns table (
  display_name text,
  email text,
  age_group text,
  is_admin boolean,
  can_login boolean,
  has_account boolean,
  last_sign_in_at timestamptz,
  signed_up_at timestamptz,
  managed_by text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.members m where m.id = auth.uid() and m.is_admin) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  return query
  select * from (
    -- People who can sign in (the seeded roster), matched to their auth account.
    select
      s.display_name,
      s.email,
      s.age_group,
      s.is_admin,
      true as can_login,
      (u.id is not null) as has_account,
      u.last_sign_in_at,
      u.created_at as signed_up_at,
      null::text as managed_by
    from public.member_seed s
    left join auth.users u on lower(u.email) = lower(s.email)

    union all

    -- Managed members with no device of their own (e.g. the twins under Paul).
    select
      m.display_name,
      null::text as email,
      m.age_group,
      m.is_admin,
      false as can_login,
      false as has_account,
      null::timestamptz as last_sign_in_at,
      null::timestamptz as signed_up_at,
      coalesce(mgr.display_name, m.manager_email) as managed_by
    from public.members m
    left join public.member_seed mgr on lower(mgr.email) = lower(m.manager_email)
    where m.manager_email is not null
  ) rows
  order by rows.can_login desc, rows.is_admin desc, rows.display_name;
end;
$$;

-- Not callable by anon; signed-in users can call but the body only returns data
-- to admins.
revoke all on function public.admin_access_overview() from public;
grant execute on function public.admin_access_overview() to authenticated;
