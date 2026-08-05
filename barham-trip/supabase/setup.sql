-- Barham Family Trip — full backend setup.
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
-- The Barham family roster.
--
-- PRIVACY: the real sign-in emails are applied directly to the live database
-- and are intentionally NOT committed here — the placeholders below just
-- document the shape. (If you ever re-provision from scratch, swap in the real
-- emails.) The four with an email get their members row auto-created on first
-- sign-in; the no-device members are inserted directly as managed members under
-- a managing adult's email.

-- Sign-in roster (matched to auth.users by email, case-insensitive).
-- (Paul is flagged as the admin later, in migration 012 — after the is_admin
-- column exists — so this seed stays column-stable at any point in history.)
insert into public.member_seed (email, display_name, age_group, color) values
  ('adult1@example.com',          'Paul',    'adult', '#0e3a48'),
  ('adult2@example.com',  'Nichola', 'adult', '#4a8896'),
  ('teen1@example.com',    'Amelia',  'teen',  '#e08853'),
  ('teen2@example.com', 'Marley',  'teen',  '#c86c3a')
on conflict (email) do update
  set display_name = excluded.display_name,
      age_group    = excluded.age_group,
      color        = excluded.color;

-- Managed members (no device) under Paul. Insert once; guarded by name so a
-- re-run doesn't duplicate them.
insert into public.members (id, display_name, age_group, color, manager_email)
select gen_random_uuid(), 'Tobias', 'child', '#7a9e5e', 'adult1@example.com'
where not exists (select 1 from public.members where display_name = 'Tobias' and manager_email = 'adult1@example.com');

insert into public.members (id, display_name, age_group, color, manager_email)
select gen_random_uuid(), 'Niyah', 'child', '#b5657e', 'adult1@example.com'
where not exists (select 1 from public.members where display_name = 'Niyah' and manager_email = 'adult1@example.com');

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

-- Seed with the current list (only if the table is empty). Notes mirror the
-- original data/itinerary.json bookings; edit freely in-app from here on.
insert into public.bookings (name, note, sort)
select v.name, v.note, v.sort from (values
  ('Flights — LHR → San Francisco / Las Vegas → LHR', 'Six seats. Open-jaw: fly into SFO, home from LAS. Confirm seat allocation for the family together.', 0),
  ('ESTA visa waivers ×6', 'One per traveller including the twins. Apply at least 72 hours before flying; print or screenshot the approvals.', 1),
  ('Rental car — 7-seater SUV', '22-day hire, SFO pickup / LAS drop-off (one-way fee applies). Two booster seats for the twins.', 2),
  ('Travel insurance — family policy', 'Full family cover including the theme-park and Grand Canyon activities and US medical.', 3),
  ('Hotel Julian — San Francisco', '8–12 Aug (4 nights).', 4),
  ('Alcatraz cruise tickets', 'Sells out weeks ahead — book as early as possible. Departs Pier 33.', 5),
  ('Muir Woods parking / shuttle reservation', 'Timed reservation mandatory — no turn-ups. Book the parking or the shuttle in advance.', 6),
  ('Monterey Bay Aquarium tickets', 'Dated online tickets are cheaper and skip the queue.', 7),
  ('Hearst Castle tour', 'Timed tour bus from the visitor centre — must be pre-booked.', 8),
  ('Hampton Inn San Simeon, Cambria', '12–13 Aug (1 night).', 9),
  ('Days Inn by Wyndham Santa Monica', '13–14 Aug (1 night).', 10),
  ('Hampton Inn & Suites Santa Monica', '14–16 Aug (2 nights).', 11),
  ('Universal Studios Hollywood tickets', 'Dated tickets; consider the Express pass for August crowds.', 12),
  ('SpringHill Suites LA Burbank/Downtown', '16–23 Aug (7 nights).', 13),
  ('Disneyland tickets + park reservation', 'Needs BOTH a dated ticket and a park reservation. Set up Genie+ the night before.', 14),
  ('Six Flags Magic Mountain tickets', 'Buy online in advance; the teens'' day.', 15),
  ('W Las Vegas', '23–24 Aug (1 night).', 16),
  ('Luxor Hotel & Casino', '24–29 Aug (5 nights).', 17),
  ('Grand Canyon West day tour', 'Book the Skywalk / West Rim package and confirm the pickup or self-drive parking.', 18),
  ('Las Vegas Raiders tickets', 'NFL game at Allegiant Stadium, Las Vegas — check the August fixtures fall within our Vegas dates (23–29 Aug) and book seats together.', 19)
) as v(name, note, sort)
where not exists (select 1 from public.bookings);

-- ============================================================
-- supabase/migrations/010_idea_category.sql
-- ============================================================
-- Optional category on family-added "things to do" ideas, so they fold into the
-- same grouped view as the seed suggestions (sights, food, playgrounds, …).
-- Nullable — old rows and un-categorised ideas fall into the "More ideas" bucket.
alter table public.trip_ideas
  add column if not exists category text;

-- ============================================================
-- supabase/migrations/011_day_plans.sql
-- ============================================================
-- Family-curated activities slotted onto a specific day's itinerary. Shared and
-- collaborative: anyone can add an activity to a day, tick it off, or remove one
-- the group decides against. Separate from the static seed suggestions in the
-- bundled itinerary.json — this is the plan the family actually builds.
create table if not exists public.day_plans (
  id uuid primary key default gen_random_uuid(),
  day_n int not null,
  title text not null,
  note text,
  done boolean not null default false,
  added_by uuid references public.members(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.day_plans enable row level security;

drop policy if exists "day_plans read" on public.day_plans;
create policy "day_plans read" on public.day_plans
  for select using (auth.uid() is not null);

-- Insert as yourself; anyone in the family can then tick or remove it (the plan
-- is a shared decision).
drop policy if exists "day_plans insert" on public.day_plans;
create policy "day_plans insert" on public.day_plans
  for insert with check (auth.uid() is not null and added_by = auth.uid());

drop policy if exists "day_plans update" on public.day_plans;
create policy "day_plans update" on public.day_plans
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "day_plans delete" on public.day_plans;
create policy "day_plans delete" on public.day_plans
  for delete using (auth.uid() is not null);

-- Realtime so plan changes appear on everyone's phones.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_plans'
  ) then
    alter publication supabase_realtime add table public.day_plans;
  end if;
end $$;
alter table public.day_plans replica identity full;

-- ============================================================
-- supabase/migrations/012_admin_and_day_plan_delete.sql
-- ============================================================
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

-- ============================================================
-- supabase/migrations/013_admin_access_overview.sql
-- ============================================================
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

-- ============================================================
-- supabase/migrations/014_dismissed_options.sql
-- ============================================================
-- Admin-removed suggestions from the day-by-day "recommended / suggested plan".
-- The suggestions themselves live in the bundled itinerary.json; this table just
-- records which ones the admin has hidden, per day, so the removal is shared with
-- everyone and can be restored. Keyed by day number + a slug of the option title.
create table if not exists public.dismissed_options (
  id uuid primary key default gen_random_uuid(),
  day_n int not null,
  option_key text not null,
  dismissed_by uuid references public.members(id) on delete set null,
  created_at timestamptz default now(),
  unique (day_n, option_key)
);

alter table public.dismissed_options enable row level security;

drop policy if exists "dismissed read" on public.dismissed_options;
create policy "dismissed read" on public.dismissed_options
  for select using (auth.uid() is not null);

-- Only the admin can hide or restore a suggestion.
drop policy if exists "dismissed insert" on public.dismissed_options;
create policy "dismissed insert" on public.dismissed_options
  for insert with check (
    dismissed_by = auth.uid()
    and exists (select 1 from public.members m where m.id = auth.uid() and m.is_admin)
  );

drop policy if exists "dismissed delete" on public.dismissed_options;
create policy "dismissed delete" on public.dismissed_options
  for delete using (
    exists (select 1 from public.members m where m.id = auth.uid() and m.is_admin)
  );

-- Realtime so a removal/restore reflects on everyone's phones.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dismissed_options'
  ) then
    alter publication supabase_realtime add table public.dismissed_options;
  end if;
end $$;
alter table public.dismissed_options replica identity full;

