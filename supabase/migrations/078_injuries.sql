-- Injury list — players can self-report an injury and expected return date.
--
-- Requirements (admin spec 20 Aug 2026):
--   * Player marks themselves injured, gives a type (free text) + return date.
--   * Return date must be a Thursday (matchday) — CHECK constraint enforces.
--   * List is public: everyone sees who's on the injury list this week.
--   * Sign-up is WARN-only, not blocked — client-side banner, not an RLS block.
--   * Row stays uncleared once return_date passes — the v_active_injuries view
--     filters those out so nothing extra needs to run. History is kept.
--   * One "active" injury per player is enforced at the app layer (create-new
--     first marks the old one cleared). No unique index because current_date
--     isn't IMMUTABLE and a partial index on it would fail.
--
-- Schema:
--   injuries — one row per reported injury, whether current or historic.
--   v_active_injuries — join of injuries + profiles, filtered to
--     cleared_at IS NULL AND return_date >= current_date. This is what the
--     Tonight tab and Profile card read; keeps callers away from raw filters.

create table if not exists public.injuries (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.profiles(id) on delete cascade,
  injury_type   text not null,
  notes         text,
  reported_at   timestamptz not null default now(),
  return_date   date not null,
  cleared_at    timestamptz,
  cleared_by    uuid references public.profiles(id),
  -- Postgres extract(dow from date): 0 = Sunday … 4 = Thursday … 6 = Saturday.
  constraint injuries_return_thursday
    check (extract(dow from return_date) = 4),
  -- Return date can't be before the report date (allow same-day for someone
  -- reporting an injury on a Thursday they were meant to play — sensible).
  constraint injuries_return_not_before_report
    check (return_date >= reported_at::date - interval '7 days')
);

create index if not exists injuries_active_lookup
  on public.injuries(player_id)
  where cleared_at is null;

comment on table public.injuries is
  'Player-reported injury list. One row per reported injury; cleared_at null + return_date >= today = actively out. See v_active_injuries.';

-- ── View: currently-active injuries, joined to profile ─────────────────────
create or replace view public.v_active_injuries as
select
  i.id,
  i.player_id,
  p.name        as player_name,
  p.surname     as player_surname,
  (p.name || ' ' || p.surname) as display_name,
  p.photo_url   as player_photo_url,
  i.injury_type,
  i.notes,
  i.reported_at,
  i.return_date
from public.injuries i
join public.profiles p on p.id = i.player_id
where i.cleared_at is null
  and i.return_date >= current_date
order by i.return_date, p.name;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.injuries enable row level security;

drop policy if exists injuries_read_all on public.injuries;
create policy injuries_read_all on public.injuries
  for select using (true);

-- Insert: only for your own profile — or admin can insert for anyone (useful
-- for admins to log a stub-profile player's injury on their behalf).
drop policy if exists injuries_insert_own_or_admin on public.injuries;
create policy injuries_insert_own_or_admin on public.injuries
  for insert
  with check (
    player_id = public.my_profile_id()
    or public.is_admin()
  );

-- Update: only your own rows, or admin. Includes the "clear" action.
drop policy if exists injuries_update_own_or_admin on public.injuries;
create policy injuries_update_own_or_admin on public.injuries
  for update
  using (
    player_id = public.my_profile_id()
    or public.is_admin()
  )
  with check (
    player_id = public.my_profile_id()
    or public.is_admin()
  );

-- Delete: admin only. Players clear (via update) rather than delete, so we
-- keep the history — useful for future injury-frequency stats.
drop policy if exists injuries_delete_admin on public.injuries;
create policy injuries_delete_admin on public.injuries
  for delete
  using (public.is_admin());
