-- Match of the Week — schema + settle trigger + leaderboard views.
--
-- Committee-approved Predictor game #1 (see docs/ROADMAP.md · Predictor
-- games — season formats). One PL/EFL fixture per week, auto-picked from
-- a pre-seeded pool weighted by `profiles.favourite_club` affinity so a
-- Millwall fan's derby gets airtime alongside Arsenal v City.
--
-- Prediction shape: pick a scoreline.
--   Exact scoreline     → 5 pts
--   Correct H/D/A only  → 3 pts
--   Wrong               → 0 pts
--
-- Lock time: kickoff (app-enforced; RLS also blocks upserts once results
-- are in via the settle trigger's own no-op guard).
--
-- Three tables:
--   mow_pool_fixtures — every candidate fixture the picker can choose from
--                       (seeded once per season from openfootball JSON;
--                       kept in sync for scores by mow-fetch-results fn).
--   mow_fixtures      — the one chosen fixture per week.
--   mow_predictions   — one pick per fella per weekly fixture.

create table if not exists public.mow_pool_fixtures (
  id                   uuid primary key default gen_random_uuid(),
  season               text not null,
  competition          text not null check (competition in ('PL','ELC','EL1','EL2')),
  gameweek             int,
  home_club            text not null,
  away_club            text not null,
  kickoff_at           timestamptz not null,
  home_score           int,
  away_score           int,
  fd_match_id          bigint,
  results_fetched_at   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (competition, home_club, away_club, kickoff_at)
);

create index if not exists mow_pool_fixtures_kickoff_idx  on public.mow_pool_fixtures (kickoff_at);
create index if not exists mow_pool_fixtures_home_idx     on public.mow_pool_fixtures (home_club);
create index if not exists mow_pool_fixtures_away_idx     on public.mow_pool_fixtures (away_club);
create index if not exists mow_pool_fixtures_comp_kick_idx on public.mow_pool_fixtures (competition, kickoff_at);

create or replace function public.set_mow_pool_fixtures_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists mow_pool_fixtures_touch on public.mow_pool_fixtures;
create trigger mow_pool_fixtures_touch
before update on public.mow_pool_fixtures
for each row execute function public.set_mow_pool_fixtures_updated_at();

create table if not exists public.mow_fixtures (
  id                     uuid primary key default gen_random_uuid(),
  week_start             date not null unique,
  pool_fixture_id        uuid not null references public.mow_pool_fixtures(id) on delete restrict,
  pick_note              text,
  published_at           timestamptz not null default now(),
  push_sent_at           timestamptz,
  result_push_sent_at    timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists mow_fixtures_week_idx on public.mow_fixtures (week_start desc);

create table if not exists public.mow_predictions (
  id                  uuid primary key default gen_random_uuid(),
  mow_fixture_id      uuid not null references public.mow_fixtures(id) on delete cascade,
  player_id           uuid not null references public.profiles(id)     on delete cascade,
  home_score          int  not null check (home_score >= 0 and home_score <= 20),
  away_score          int  not null check (away_score >= 0 and away_score <= 20),
  points_awarded      int  check (points_awarded in (0, 3, 5)),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (mow_fixture_id, player_id)
);

create index if not exists mow_predictions_player_idx  on public.mow_predictions (player_id);
create index if not exists mow_predictions_fixture_idx on public.mow_predictions (mow_fixture_id);

create or replace function public.set_mow_predictions_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists mow_predictions_touch on public.mow_predictions;
create trigger mow_predictions_touch
before update on public.mow_predictions
for each row execute function public.set_mow_predictions_updated_at();

-- Settle predictions when the underlying pool fixture gets its final score.
-- Runs for every mow_fixtures row that references the scored pool fixture
-- (usually one, but leaves room for future replays / historic backfill).
create or replace function public.settle_mow_predictions()
returns trigger language plpgsql security definer as $$
declare
  v_result char;
  v_new_result char;
  v_old_result char;
begin
  -- No-op if score didn't change (INSERT with nulls, or unchanged UPDATE).
  if (new.home_score is not distinct from old.home_score)
     and (new.away_score is not distinct from old.away_score) then
    return new;
  end if;

  -- Score cleared → reset any settled predictions on this fixture.
  if new.home_score is null or new.away_score is null then
    update public.mow_predictions p
       set points_awarded = null
      from public.mow_fixtures f
     where f.pool_fixture_id = new.id
       and p.mow_fixture_id = f.id;
    return new;
  end if;

  -- Compute H/D/A from the final score.
  v_new_result := case
    when new.home_score > new.away_score then 'H'
    when new.home_score < new.away_score then 'A'
    else 'D'
  end;

  update public.mow_predictions p
     set points_awarded = case
       when p.home_score = new.home_score and p.away_score = new.away_score then 5
       when (case
               when p.home_score > p.away_score then 'H'
               when p.home_score < p.away_score then 'A'
               else 'D'
             end) = v_new_result then 3
       else 0
     end
    from public.mow_fixtures f
   where f.pool_fixture_id = new.id
     and p.mow_fixture_id = f.id;

  return new;
end;
$$;
drop trigger if exists mow_pool_fixtures_settle on public.mow_pool_fixtures;
create trigger mow_pool_fixtures_settle
after update of home_score, away_score on public.mow_pool_fixtures
for each row execute function public.settle_mow_predictions();

-- ── Leaderboard views ─────────────────────────────────────────────────────
--
-- Season leaderboard: total pts across every settled MoW this season.
-- Season boundary is "the max week_start's calendar year, mapped Aug→Jul"
-- so a July-preseason preview doesn't blend with the previous run.

create or replace view public.v_mow_season_leaderboard as
with settled as (
  select
    p.player_id,
    p.points_awarded,
    (p.home_score = pf.home_score and p.away_score = pf.away_score) as is_exact
  from public.mow_predictions p
  join public.mow_fixtures    f  on f.id = p.mow_fixture_id
  join public.mow_pool_fixtures pf on pf.id = f.pool_fixture_id
  where p.points_awarded is not null
    and f.week_start >= (case
      when extract(month from current_date) >= 8
        then make_date(extract(year from current_date)::int,     8, 1)
      else make_date(extract(year from current_date)::int - 1,   8, 1)
    end)
)
select
  s.player_id,
  pr.name || ' ' || coalesce(pr.surname,'') as display_name,
  count(*)::int                              as picks_settled,
  sum(s.points_awarded)::int                 as total_pts,
  count(*) filter (where s.is_exact)::int    as exact_count,
  count(*) filter (where s.points_awarded = 3)::int as result_only_count,
  count(*) filter (where s.points_awarded = 0)::int as wrong_count
from settled s
join public.profiles pr on pr.id = s.player_id
group by s.player_id, pr.name, pr.surname
order by total_pts desc, exact_count desc, pr.name;

-- Weekly view: everything for the current (most-recent) MoW.
create or replace view public.v_mow_weekly_leaderboard as
with latest as (
  select id, pool_fixture_id, week_start
  from public.mow_fixtures
  order by week_start desc
  limit 1
)
select
  l.id                                    as mow_fixture_id,
  l.week_start,
  p.player_id,
  pr.name || ' ' || coalesce(pr.surname,'') as display_name,
  p.home_score,
  p.away_score,
  p.points_awarded
from latest l
join public.mow_predictions p on p.mow_fixture_id = l.id
join public.profiles pr       on pr.id = p.player_id
order by p.points_awarded desc nulls last, pr.name;

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table public.mow_pool_fixtures enable row level security;
alter table public.mow_fixtures      enable row level security;
alter table public.mow_predictions   enable row level security;

drop policy if exists mow_pool_fixtures_select on public.mow_pool_fixtures;
create policy mow_pool_fixtures_select on public.mow_pool_fixtures
  for select using (auth.role() = 'authenticated');

drop policy if exists mow_pool_fixtures_admin on public.mow_pool_fixtures;
create policy mow_pool_fixtures_admin on public.mow_pool_fixtures
  for all using (is_admin());

drop policy if exists mow_fixtures_select on public.mow_fixtures;
create policy mow_fixtures_select on public.mow_fixtures
  for select using (auth.role() = 'authenticated');

drop policy if exists mow_fixtures_admin on public.mow_fixtures;
create policy mow_fixtures_admin on public.mow_fixtures
  for all using (is_admin());

drop policy if exists mow_predictions_select on public.mow_predictions;
create policy mow_predictions_select on public.mow_predictions
  for select using (auth.role() = 'authenticated');

drop policy if exists mow_predictions_own_insert on public.mow_predictions;
create policy mow_predictions_own_insert on public.mow_predictions
  for insert with check (player_id = my_profile_id());

drop policy if exists mow_predictions_own_update on public.mow_predictions;
create policy mow_predictions_own_update on public.mow_predictions
  for update using (player_id = my_profile_id())
             with check (player_id = my_profile_id());

drop policy if exists mow_predictions_admin on public.mow_predictions;
create policy mow_predictions_admin on public.mow_predictions
  for all using (is_admin());

grant select on public.v_mow_season_leaderboard to authenticated;
grant select on public.v_mow_weekly_leaderboard to authenticated;

comment on table public.mow_pool_fixtures is
  'Full season fixture pool the MoW picker chooses from. Seeded per-season from openfootball; scores backfilled by mow-fetch-results.';
comment on table public.mow_fixtures is
  'The one chosen MoW per calendar week (week_start = Monday). References a pool fixture.';
comment on table public.mow_predictions is
  'One prediction per player per weekly MoW. Scored 5 for exact, 3 for correct H/D/A, 0 otherwise.';
