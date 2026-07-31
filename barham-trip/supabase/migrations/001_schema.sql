-- Barham Family Trip — core schema + RLS.
-- Small closed family group. Everyone can see everyone; personal lists (packing,
-- notes) are private; bookings + RSVPs are shared. Members with no device of
-- their own (Tobias & Niyah) carry a manager_email and are controlled by that
-- adult from their own login.

-- Family members. `id` equals the auth user id for people who sign in (set by
-- the on_auth_user_created trigger); managed members get a random id and never
-- sign in, so there is deliberately NO foreign key to auth.users here.
create table if not exists public.members (
  id uuid primary key,
  display_name text not null,
  avatar_url text,
  age_group text check (age_group in ('adult', 'teen', 'child')) not null,
  color text default '#e08853',
  -- If set, this member has no device and is managed by the adult with this
  -- email (matched against auth.users.email at write time).
  manager_email text
);

-- Bookings: shared ticks.
create table if not exists public.booking_status (
  booking_key text primary key,
  checked boolean default false,
  checked_by uuid references public.members(id),
  checked_at timestamptz
);

-- Per-user packing state.
create table if not exists public.packing_status (
  member_id uuid references public.members(id) on delete cascade,
  item_key text not null,
  checked boolean default false,
  updated_at timestamptz default now(),
  primary key (member_id, item_key)
);

-- Per-user (or managed) RSVP for each day option.
create table if not exists public.day_rsvp (
  member_id uuid references public.members(id) on delete cascade,
  day_n int not null check (day_n between 1 and 22),
  choice text not null check (choice in ('recommended', 'alt1', 'alt2', 'skip')),
  updated_at timestamptz default now(),
  primary key (member_id, day_n)
);

-- Notes: private per-user daily journal (nice-to-have; table ready).
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete cascade,
  day_n int check (day_n between 1 and 22),
  body text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Helper: may the current user act for `target` (themselves, or someone they
-- manage by email)?
-- ---------------------------------------------------------------------------
create or replace function public.can_act_for(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target = auth.uid()
      or exists (
        select 1
        from public.members m
        where m.id = target
          and m.manager_email is not null
          and lower(m.manager_email) = lower((select email from auth.users where id = auth.uid()))
      );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;
alter table public.booking_status enable row level security;
alter table public.packing_status enable row level security;
alter table public.day_rsvp enable row level security;
alter table public.notes enable row level security;

-- Everyone signed in can see the whole family.
drop policy if exists "family read members" on public.members;
create policy "family read members" on public.members
  for select using (auth.uid() is not null);

-- You may update your own row (avatar, name).
drop policy if exists "member self update" on public.members;
create policy "member self update" on public.members
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Bookings: shared read + write for any signed-in family member.
drop policy if exists "shared bookings read" on public.booking_status;
create policy "shared bookings read" on public.booking_status
  for select using (auth.uid() is not null);
drop policy if exists "shared bookings insert" on public.booking_status;
create policy "shared bookings insert" on public.booking_status
  for insert with check (auth.uid() is not null);
drop policy if exists "shared bookings update" on public.booking_status;
create policy "shared bookings update" on public.booking_status
  for update using (auth.uid() is not null);

-- Packing: yours, or anyone you manage.
drop policy if exists "packing self or managed" on public.packing_status;
create policy "packing self or managed" on public.packing_status
  for all using (public.can_act_for(member_id)) with check (public.can_act_for(member_id));

-- RSVP: readable by the whole family; writable for yourself or anyone you manage.
drop policy if exists "rsvp read family" on public.day_rsvp;
create policy "rsvp read family" on public.day_rsvp
  for select using (auth.uid() is not null);
drop policy if exists "rsvp self or managed write" on public.day_rsvp;
create policy "rsvp self or managed write" on public.day_rsvp
  for all using (public.can_act_for(member_id)) with check (public.can_act_for(member_id));

-- Notes: strictly per-user.
drop policy if exists "notes self" on public.notes;
create policy "notes self" on public.notes
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());
