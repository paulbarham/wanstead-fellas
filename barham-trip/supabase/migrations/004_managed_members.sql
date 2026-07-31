-- Managed members: people on the trip with no device of their own (Tobias &
-- Niyah), who sit "under" a managing adult (Paul). The managing adult can set
-- their day RSVPs (and packing) from their own login.

alter table public.members
  add column if not exists managed_by uuid references public.members(id) on delete set null;

-- Helper: is `target` either me, or someone I manage?
create or replace function public.can_act_for(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target = auth.uid()
      or exists (
        select 1 from public.members m
        where m.id = target and m.managed_by = auth.uid()
      );
$$;

-- RSVP: readable by the whole family; writable for yourself OR anyone you manage.
drop policy if exists "rsvp self write" on public.day_rsvp;
drop policy if exists "rsvp self or managed write" on public.day_rsvp;
create policy "rsvp self or managed write" on public.day_rsvp
  for all
  using (public.can_act_for(member_id))
  with check (public.can_act_for(member_id));

-- Packing: private to you OR managed by you.
drop policy if exists "packing self" on public.packing_status;
drop policy if exists "packing self or managed" on public.packing_status;
create policy "packing self or managed" on public.packing_status
  for all
  using (public.can_act_for(member_id))
  with check (public.can_act_for(member_id));
