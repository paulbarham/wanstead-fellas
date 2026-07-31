-- Holiday app — full backend setup.
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- Idempotent: safe to run more than once.
-- (Source of truth is supabase/migrations/*.sql — this is those files concatenated.)

-- ============================================================
-- supabase/migrations/001_schema.sql
-- ============================================================
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

-- ============================================================
-- supabase/migrations/002_realtime.sql
-- ============================================================
-- Enable Postgres realtime for the two shared tables so the family panel and
-- the bookings list update live across everyone's phones. Guarded so re-running
-- doesn't error on "table already in publication".
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_status'
  ) then
    alter publication supabase_realtime add table public.booking_status;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_rsvp'
  ) then
    alter publication supabase_realtime add table public.day_rsvp;
  end if;
end $$;

-- REPLICA IDENTITY FULL so realtime payloads include the full row (needed for
-- our client to read booking_key / member_id on updates).
alter table public.booking_status replica identity full;
alter table public.day_rsvp replica identity full;

-- ============================================================
-- supabase/migrations/003_storage.sql
-- ============================================================
-- Storage buckets: public avatars, and a shared day-photos bucket (nice-to-have).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('day-photos', 'day-photos', true)
on conflict (id) do nothing;

-- Anyone signed in can read; a member may write only within their own folder
-- (path convention: `<member_id>/...`).
drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars self write" on storage.objects;
create policy "avatars self write" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars self update" on storage.objects;
create policy "avatars self update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "day-photos read" on storage.objects;
create policy "day-photos read" on storage.objects
  for select using (bucket_id = 'day-photos');

drop policy if exists "day-photos write" on storage.objects;
create policy "day-photos write" on storage.objects
  for insert with check (bucket_id = 'day-photos' and auth.uid() is not null);

-- ============================================================
-- supabase/migrations/004_provisioning.sql
-- ============================================================
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

-- ============================================================
-- supabase/migrations/005_family_seed.sql
-- ============================================================
-- TEMPLATE family seed — REPLACE these with your travellers.
--
-- People with an email get their members row auto-created (with these names /
-- colours) the first time they open the app and sign in. Anyone with no device
-- is inserted directly as a managed member under a managing adult's email.

-- Sign-in roster (matched to auth.users by email, case-insensitive).
insert into public.member_seed (email, display_name, age_group, color) values
  ('you@example.com',     'You',     'adult', '#0e3a48'),
  ('partner@example.com', 'Partner', 'adult', '#4a8896'),
  ('child1@example.com',  'Child 1', 'teen',  '#e08853')
on conflict (email) do update
  set display_name = excluded.display_name,
      age_group    = excluded.age_group,
      color        = excluded.color;

-- Managed members (no device) under a managing adult's email. Insert once;
-- guarded by name so a re-run doesn't duplicate them.
insert into public.members (id, display_name, age_group, color, manager_email)
select gen_random_uuid(), 'Child 2', 'child', '#7a9e5e', 'you@example.com'
where not exists (select 1 from public.members where display_name = 'Child 2' and manager_email = 'you@example.com');

-- ============================================================
-- supabase/migrations/006_family_gate.sql
-- ============================================================
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

-- ============================================================
-- supabase/migrations/007_autoconfirm.sql
-- ============================================================
-- Auto-confirm new sign-ups at the database level, so email+password works
-- without any confirmation email (and regardless of the dashboard toggle).
create or replace function public.autoconfirm_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists autoconfirm_before_insert on auth.users;
create trigger autoconfirm_before_insert
  before insert on auth.users
  for each row
  execute function public.autoconfirm_user();

-- ============================================================
-- supabase/migrations/008_trip_ideas.sql
-- ============================================================
-- Family-added "things to do" ideas per leg (place). Shared across everyone.
create table if not exists public.trip_ideas (
  id uuid primary key default gen_random_uuid(),
  leg_id text not null,
  title text not null,
  note text,
  added_by uuid references public.members(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.trip_ideas enable row level security;

drop policy if exists "ideas read" on public.trip_ideas;
create policy "ideas read" on public.trip_ideas
  for select using (auth.uid() is not null);

drop policy if exists "ideas insert" on public.trip_ideas;
create policy "ideas insert" on public.trip_ideas
  for insert with check (auth.uid() is not null and added_by = auth.uid());

drop policy if exists "ideas delete own" on public.trip_ideas;
create policy "ideas delete own" on public.trip_ideas
  for delete using (added_by = auth.uid());

-- Realtime so new ideas appear on everyone's phones.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_ideas'
  ) then
    alter publication supabase_realtime add table public.trip_ideas;
  end if;
end $$;
alter table public.trip_ideas replica identity full;

-- ============================================================
-- supabase/migrations/009_bookings_editable.sql
-- ============================================================
-- Editable, shared bookings checklist (replaces the static JSON list for the UI).
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  sort int not null default 0,
  checked boolean default false,
  checked_by uuid references public.members(id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz default now()
);

alter table public.bookings enable row level security;

drop policy if exists "bookings read" on public.bookings;
create policy "bookings read" on public.bookings
  for select using (auth.uid() is not null);

drop policy if exists "bookings write" on public.bookings;
create policy "bookings write" on public.bookings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;
alter table public.bookings replica identity full;

-- TEMPLATE seed (only if the table is empty). Replace with your bookings, or
-- just add them in-app once you're signed in.
insert into public.bookings (name, note, sort)
select v.name, v.note, v.sort from (values
  ('Flights', 'Seats, dates, confirmation ref.', 0),
  ('Hotel — First Place', 'Nights, address, ref.', 1),
  ('Travel insurance', 'Family policy covering the whole trip.', 2)
) as v(name, note, sort)
where not exists (select 1 from public.bookings);

