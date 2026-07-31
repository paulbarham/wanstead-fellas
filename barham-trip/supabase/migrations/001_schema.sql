-- Barham Family Trip — core schema + RLS.
-- Small closed family group (6 seats). Everyone can see everyone; personal
-- lists (packing, notes) are private; bookings + RSVPs are shared.

-- Family members mirror auth.users; rows are written by the seed script.
create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  age_group text check (age_group in ('adult', 'teen', 'child')) not null,
  color text default '#e08853'
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

-- Per-user RSVP for each day option.
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

-- PIN login table (for the twins). Never readable by clients — the pin-login
-- edge function reads it with the service role.
--   pin_hash format: "<salt>:<sha256hex(salt + ':' + pin)>" — computed
--   identically by scripts/seed_family.ts (Node) and the pin-login edge
--   function (Deno), so no native bcrypt dependency is needed in either runtime.
--   email lets the function mint a session for the right pre-provisioned account.
create table if not exists public.family_pins (
  member_id uuid primary key references public.members(id) on delete cascade,
  email text not null,
  pin_hash text not null
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;
alter table public.booking_status enable row level security;
alter table public.packing_status enable row level security;
alter table public.day_rsvp enable row level security;
alter table public.notes enable row level security;
alter table public.family_pins enable row level security; -- no policies: locked to service role

-- Everyone in the family can see everyone.
drop policy if exists "family read members" on public.members;
create policy "family read members" on public.members
  for select using (auth.uid() is not null);

-- A member may update their own row (e.g. avatar_url, display_name).
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

-- Packing: strictly per-user.
drop policy if exists "packing self" on public.packing_status;
create policy "packing self" on public.packing_status
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

-- RSVP: readable by the whole family, writable only for yourself.
drop policy if exists "rsvp read family" on public.day_rsvp;
create policy "rsvp read family" on public.day_rsvp
  for select using (auth.uid() is not null);
drop policy if exists "rsvp self write" on public.day_rsvp;
create policy "rsvp self write" on public.day_rsvp
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

-- Notes: strictly per-user.
drop policy if exists "notes self" on public.notes;
create policy "notes self" on public.notes
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());
