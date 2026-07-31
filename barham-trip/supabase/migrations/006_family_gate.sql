-- Lets the login screen check, before creating an account, that an email is on
-- the family roster (member_seed). SECURITY DEFINER so anon can call it without
-- being able to read member_seed directly.
create or replace function public.is_family_member(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.member_seed where lower(email) = lower(check_email));
$$;

grant execute on function public.is_family_member(text) to anon, authenticated;
