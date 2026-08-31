-- Rivalry cards — the derived data
--
-- v_player_pair_stats: for every canonical pair of players (A < B), for
-- every season they shared a pitch, count the fixtures they played and
-- the W/D/L record from A's perspective. Split by same-team vs
-- opposing-team so we can render "Duos" (same_team=true) and "Rivals"
-- (same_team=false) as distinct lists.
--
-- Powers three surfaces (roadmap 🎬 Match narrative & rituals):
--   * Profile "Duos & rivals" card — top 3 duos + top 3 rivals per player
--   * Stats "Duo of the Month" hero — highest win-rate pair (≥3 games) this month
--   * Team publish inline chips on Tonight tab — "You + Sheridan: 8W-2L this season"
--
-- No new schema, just a MATERIALIZED VIEW over fixtures + team_players.
-- ~200 matches × ~C(20,2) ≈ 40k rows tops; per-season aggregation keeps
-- it small. Refreshed nightly via pg_cron; refresh cost is trivial at
-- this scale but CONCURRENTLY keeps client reads non-blocking as we grow.
--
-- Season: April → March (matches WF's season model). season_start_year
-- 2026 = the '2026-27' season key used in club_subscriptions etc.

-- First materialized view in the codebase — no unique-index-on-matview
-- precedent to copy. The unique index is REQUIRED for REFRESH CONCURRENTLY.

create materialized view public.v_player_pair_stats as
with fixture_players as (
  -- Every player on every fixture of every completed match, with their side.
  -- Team merges (4-team nights merged to 10v10) leave one clean fixture per
  -- match_id — no special case needed, verified against 2026-08-13 and
  -- 2026-08-27 which came through as team_count=2, fixture_count=1.
  select
    f.id           as fixture_id,
    m.id           as match_id,
    m.match_date,
    case when extract(month from m.match_date) >= 4
         then extract(year from m.match_date)::int
         else extract(year from m.match_date)::int - 1
    end            as season_start_year,
    tp.player_id,
    case when tp.team_id = f.team1_id then 1
         when tp.team_id = f.team2_id then 2
    end            as side,
    f.score1,
    f.score2
  from public.fixtures f
  join public.matches m       on m.id = f.match_id
  join public.teams t         on t.match_id = f.match_id
                              and (t.id = f.team1_id or t.id = f.team2_id)
  join public.team_players tp on tp.team_id = t.id
  where m.status = 'completed'
),
pair_events as (
  -- One row per (fixture, pair). Canonical order A < B so each pair
  -- appears exactly once. a_side captures which side player A was on
  -- so we can compute the result from A's perspective.
  select
    least(fp1.player_id, fp2.player_id)    as player_a_id,
    greatest(fp1.player_id, fp2.player_id) as player_b_id,
    fp1.fixture_id,
    fp1.match_id,
    fp1.season_start_year,
    (fp1.side = fp2.side)                  as same_team,
    case when fp1.player_id = least(fp1.player_id, fp2.player_id)
         then fp1.side else fp2.side end   as a_side,
    fp1.score1,
    fp1.score2
  from fixture_players fp1
  join fixture_players fp2
    on fp2.fixture_id = fp1.fixture_id
   and fp2.player_id > fp1.player_id
  where fp1.side is not null
    and fp2.side is not null
)
select
  player_a_id,
  player_b_id,
  same_team,
  season_start_year,
  count(*)::int                       as fixtures_played,
  count(distinct match_id)::int       as matches_played,
  count(*) filter (
    where (a_side = 1 and score1 > score2)
       or (a_side = 2 and score2 > score1)
  )::int                              as a_wins,
  count(*) filter (
    where score1 = score2
  )::int                              as a_draws,
  count(*) filter (
    where (a_side = 1 and score1 < score2)
       or (a_side = 2 and score2 < score1)
  )::int                              as a_losses
from pair_events
group by player_a_id, player_b_id, same_team, season_start_year;

-- Unique index — REQUIRED for REFRESH CONCURRENTLY.
create unique index v_player_pair_stats_pk
  on public.v_player_pair_stats (player_a_id, player_b_id, same_team, season_start_year);

create index v_player_pair_stats_a_idx      on public.v_player_pair_stats (player_a_id);
create index v_player_pair_stats_b_idx      on public.v_player_pair_stats (player_b_id);
create index v_player_pair_stats_season_idx on public.v_player_pair_stats (season_start_year);

grant select on public.v_player_pair_stats to authenticated;

-- Player-scoped helper: hides the "am I A or B" branching.
-- Same-team pairs share their result (A won = B won), so no inversion
-- needed. Opposing pairs need inverting when I'm B (my wins = A's losses).
create or replace function public.player_pair_stats_for(
  p_player_id         uuid,
  p_season_start_year int default null
)
returns table (
  partner_id         uuid,
  same_team          boolean,
  season_start_year  int,
  fixtures_played    int,
  matches_played     int,
  wins               int,
  draws              int,
  losses             int
)
language sql
stable
as $$
  select
    case when player_a_id = p_player_id then player_b_id else player_a_id end
      as partner_id,
    same_team,
    season_start_year,
    fixtures_played,
    matches_played,
    -- If same team, A and B share the outcome — no inversion.
    -- If opposing and I'm A, use a_wins.  If opposing and I'm B, invert.
    case when same_team or player_a_id = p_player_id then a_wins else a_losses end
      as wins,
    a_draws as draws,
    case when same_team or player_a_id = p_player_id then a_losses else a_wins end
      as losses
  from public.v_player_pair_stats
  where (player_a_id = p_player_id or player_b_id = p_player_id)
    and (p_season_start_year is null or season_start_year = p_season_start_year);
$$;

grant execute on function public.player_pair_stats_for(uuid, int) to authenticated;

-- Nightly refresh at 04:00 UTC (05:00 BST / 04:00 GMT — quiet time,
-- always after Thursday-evening matches settle).
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-player-pair-stats') then
    perform cron.unschedule('refresh-player-pair-stats');
  end if;
end $$;

select cron.schedule(
  'refresh-player-pair-stats',
  '0 4 * * *',
  $$refresh materialized view concurrently public.v_player_pair_stats$$
);

-- Initial populate (non-concurrent — no rows exist yet)
refresh materialized view public.v_player_pair_stats;
