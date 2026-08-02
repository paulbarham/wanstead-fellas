-- Introduce an admin flag (Paul) and restrict removing day-plan activities to
-- the admin only. Adding and ticking off activities stays open to everyone; only
-- removal is the admin's call.

-- 1. Admin flag on members + the seed lookup so it survives a re-provision.
alter table public.members
  add column if not exists is_admin boolean not null default false;
alter table public.member_seed
  add column if not exists is_admin boolean not null default false;

-- Paul is the admin. Match by display name (unique in this closed family) so we
-- don't need to hard-code an email here.
update public.member_seed set is_admin = true where display_name = 'Paul';
update public.members     set is_admin = true where display_name = 'Paul';

-- 2. Carry is_admin through the first-sign-in provisioning trigger.
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
  insert into public.members (id, display_name, age_group, color, is_admin)
  values (
    new.id,
    coalesce(s.display_name, split_part(new.email, '@', 1)),
    coalesce(s.age_group, 'adult'),
    coalesce(s.color, '#e08853'),
    coalesce(s.is_admin, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. Only the admin can delete a day-plan activity (supersedes the open policy
--    from migration 011).
drop policy if exists "day_plans delete" on public.day_plans;
create policy "day_plans delete" on public.day_plans
  for delete using (
    exists (select 1 from public.members where id = auth.uid() and is_admin)
  );
