-- Auto-provision a `members` row the first time someone signs in.
--
-- People sign in with a magic link; Supabase creates their auth.users row; this
-- trigger then creates their members row, pulling their display name / age band
-- / colour from the `member_seed` lookup (falling back to the email prefix for
-- anyone not pre-seeded). No service-role seed script needed.

create table if not exists public.member_seed (
  email text primary key,
  display_name text not null,
  age_group text not null check (age_group in ('adult', 'teen', 'child')),
  color text not null
);

alter table public.member_seed enable row level security; -- no policies: locked down

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.member_seed where lower(email) = lower(new.email);
  insert into public.members (id, display_name, age_group, color)
  values (
    new.id,
    coalesce(s.display_name, split_part(new.email, '@', 1)),
    coalesce(s.age_group, 'adult'),
    coalesce(s.color, '#e08853')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
