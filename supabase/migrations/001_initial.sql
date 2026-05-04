-- =============================================================
-- WansteadFellas — Initial Schema
-- Run this in your Supabase SQL editor
-- =============================================================

-- ── Profiles ─────────────────────────────────────────────────
create table if not exists profiles (
  id            uuid references auth.users on delete cascade primary key,
  name          text,
  surname       text,
  age_group     text,
  photo_url     text,
  overall_rating int default 7,
  sp            int default 7,
  sk            int default 7,
  st            int default 7,
  tk            int default 7,
  ps            int default 7,
  ag            int default 7,
  phy           int default 7,
  cp            int default 7,
  wr            int default 7,
  cunt          int default 5,
  badges        text[] default '{}',
  is_admin      bool default false,
  created_at    timestamptz default now()
);

-- ── Availability ─────────────────────────────────────────────
create table if not exists availability (
  id            uuid default gen_random_uuid() primary key,
  player_id     uuid references profiles on delete cascade,
  match_date    date,
  created_at    timestamptz default now(),
  unique (player_id, match_date)
);

-- ── Matches ──────────────────────────────────────────────────
create table if not exists matches (
  id            uuid default gen_random_uuid() primary key,
  match_date    date,
  format        text,
  status        text default 'upcoming',
  created_at    timestamptz default now()
);

-- ── Teams ────────────────────────────────────────────────────
create table if not exists teams (
  id            uuid default gen_random_uuid() primary key,
  match_id      uuid references matches on delete cascade,
  name          text,
  captain_id    uuid references profiles,
  bibs          bool default false
);

-- ── Team Players ─────────────────────────────────────────────
create table if not exists team_players (
  id            uuid default gen_random_uuid() primary key,
  team_id       uuid references teams on delete cascade,
  player_id     uuid references profiles on delete cascade
);

-- ── Fixtures ─────────────────────────────────────────────────
create table if not exists fixtures (
  id            uuid default gen_random_uuid() primary key,
  match_id      uuid references matches on delete cascade,
  team1_id      uuid references teams on delete cascade,
  team2_id      uuid references teams on delete cascade,
  score1        int,
  score2        int
);

-- ── Results ──────────────────────────────────────────────────
create table if not exists results (
  id            uuid default gen_random_uuid() primary key,
  match_id      uuid references matches on delete cascade,
  report_text   text,
  scorers       text,
  highlights    text,
  created_at    timestamptz default now()
);

-- ── Feedback ─────────────────────────────────────────────────
create table if not exists feedback (
  id            uuid default gen_random_uuid() primary key,
  player_id     uuid references profiles on delete cascade,
  category      text,
  subject       text,
  message       text,
  reviewed      bool default false,
  created_at    timestamptz default now()
);


-- =============================================================
-- TRIGGER: auto-create profile on signup
-- =============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, surname, age_group, is_admin)
  values (
    new.id,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'surname',
    coalesce(new.raw_user_meta_data->>'age_group', '16-40'),
    new.email = 'pabarham@gmail.com'
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table profiles    enable row level security;
alter table availability enable row level security;
alter table matches     enable row level security;
alter table teams       enable row level security;
alter table team_players enable row level security;
alter table fixtures    enable row level security;
alter table results     enable row level security;
alter table feedback    enable row level security;

-- Helper: is the current user an admin?
create or replace function is_admin()
returns boolean
language sql security definer
as $$
  select coalesce(
    (select is_admin from profiles where id = auth.uid()),
    false
  );
$$;


-- ── profiles policies ────────────────────────────────────────
create policy "profiles_select" on profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

create policy "profiles_update_admin" on profiles
  for update using (is_admin());

create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);


-- ── availability policies ────────────────────────────────────
create policy "avail_select" on availability
  for select using (auth.role() = 'authenticated');

create policy "avail_insert_own" on availability
  for insert with check (auth.uid() = player_id);

create policy "avail_delete_own" on availability
  for delete using (auth.uid() = player_id);

create policy "avail_insert_admin" on availability
  for insert with check (is_admin());

create policy "avail_delete_admin" on availability
  for delete using (is_admin());


-- ── matches policies ─────────────────────────────────────────
create policy "matches_select" on matches
  for select using (auth.role() = 'authenticated');

create policy "matches_admin_write" on matches
  for all using (is_admin());


-- ── teams policies ───────────────────────────────────────────
create policy "teams_select" on teams
  for select using (auth.role() = 'authenticated');

create policy "teams_admin_write" on teams
  for all using (is_admin());


-- ── team_players policies ────────────────────────────────────
create policy "tp_select" on team_players
  for select using (auth.role() = 'authenticated');

create policy "tp_admin_write" on team_players
  for all using (is_admin());


-- ── fixtures policies ────────────────────────────────────────
create policy "fixtures_select" on fixtures
  for select using (auth.role() = 'authenticated');

create policy "fixtures_admin_write" on fixtures
  for all using (is_admin());


-- ── results policies ─────────────────────────────────────────
create policy "results_select" on results
  for select using (auth.role() = 'authenticated');

create policy "results_admin_write" on results
  for all using (is_admin());


-- ── feedback policies ────────────────────────────────────────
create policy "feedback_insert_own" on feedback
  for insert with check (auth.uid() = player_id);

create policy "feedback_select_admin" on feedback
  for select using (is_admin());

create policy "feedback_update_admin" on feedback
  for update using (is_admin());


-- =============================================================
-- STORAGE BUCKET
-- =============================================================
-- Run in Supabase Storage tab or via this SQL:
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "avatars_upload" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
  );

-- Allow admin to upload to any folder
create policy "avatars_admin_upload" on storage.objects
  for all using (
    bucket_id = 'avatars'
    and is_admin()
  );

-- Public read
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Allow users to update/delete their own avatars
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
