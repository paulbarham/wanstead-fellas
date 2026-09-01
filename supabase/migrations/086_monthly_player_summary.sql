-- Monthly personal review — the per-player summary RPC.
--
-- Powers the /profile/monthly/:month in-app page + the 1st-of-month
-- push notification. Returns ONE row per player per month, computed on
-- demand from the raw tables (no snapshot storage).
--
-- Design principle: positive-only. No rank/percentile comparisons.
-- "Your best game", "your favourite teammate", "your streak" — never
-- "you finished 15th in scoring".
--
-- If the player has zero apps in the month, all counters return 0 and
-- best_game / favourite_teammate come back as null. Frontend uses that
-- to render a "See you Thursday" fallback rather than an empty card.
--
-- Best game algorithm: match with highest personal impact score
--   goals_scored + (motm ? 3 : 0) + (dotd ? 2 : 0)
-- Ties broken by goals scored desc, then most recent.
--
-- Streak algorithm: consecutive months (counting back from p_month_start
-- inclusive) with ≥1 appearance. Works via row_number() + ordinal-month
-- equality — count(*) naturally stops at the first gap because every row
-- below the gap fails the check.

create or replace function public.monthly_player_summary(
  p_player_id  uuid,
  p_month_start date default date_trunc('month', current_date)::date
)
returns table (
  player_id                    uuid,
  month_start                  date,
  apps                         int,
  goals                        int,
  own_goals                    int,
  motm_wins                    int,
  dotd_nods                    int,
  wins                         int,
  draws                        int,
  losses                       int,
  best_game_match_id           uuid,
  best_game_date               date,
  best_game_goals              int,
  best_game_motm               boolean,
  best_game_dotd               boolean,
  favourite_teammate_id        uuid,
  favourite_teammate_fixtures  int,
  streak_months                int
)
language sql
stable
as $$
  with month_bounds as (
    select p_month_start as from_date,
           (p_month_start + interval '1 month')::date as to_date
  ),
  matches_in_month as (
    select m.id, m.match_date
    from public.matches m, month_bounds mb
    where m.status = 'completed'
      and m.match_date >= mb.from_date
      and m.match_date <  mb.to_date
  ),
  my_appearances as (
    select distinct t.match_id, mim.match_date
    from public.team_players tp
    join public.teams t              on t.id = tp.team_id
    join matches_in_month mim        on mim.id = t.match_id
    where tp.player_id = p_player_id
  ),
  my_goals as (
    select g.match_id,
           sum(coalesce(g.goals_count, 1)) filter (where not g.own_goal)::int as goals,
           sum(coalesce(g.goals_count, 1)) filter (where g.own_goal)::int     as own_goals
    from public.goals g
    join matches_in_month mim on mim.id = g.match_id
    where g.player_id = p_player_id
    group by g.match_id
  ),
  my_awards as (
    select ar.match_id, ar.award_type
    from public.award_results ar
    join matches_in_month mim on mim.id = ar.match_id
    where ar.player_id = p_player_id
  ),
  my_fixture_events as (
    -- Every fixture the player featured in this month, with which side.
    select
      f.id       as fixture_id,
      f.match_id,
      case when tp.team_id = f.team1_id then 1
           when tp.team_id = f.team2_id then 2 end as side,
      f.score1,
      f.score2,
      f.team1_id,
      f.team2_id
    from public.fixtures f
    join matches_in_month mim   on mim.id = f.match_id
    join public.teams t         on t.match_id = f.match_id
                                and (t.id = f.team1_id or t.id = f.team2_id)
    join public.team_players tp on tp.team_id = t.id
                                and tp.player_id = p_player_id
  ),
  totals as (
    select
      (select count(*) from my_appearances)::int                             as apps,
      coalesce((select sum(goals)     from my_goals), 0)::int                as goals,
      coalesce((select sum(own_goals) from my_goals), 0)::int                as own_goals,
      (select count(*) from my_awards where award_type = 'motm')::int        as motm_wins,
      (select count(*) from my_awards where award_type = 'dotd')::int        as dotd_nods,
      (select count(*) from my_fixture_events
        where (side = 1 and score1 > score2)
           or (side = 2 and score2 > score1))::int                           as wins,
      (select count(*) from my_fixture_events where score1 = score2)::int    as draws,
      (select count(*) from my_fixture_events
        where (side = 1 and score1 < score2)
           or (side = 2 and score2 < score1))::int                           as losses
  ),
  best_game_impact as (
    select
      mim.id                                                                 as match_id,
      mim.match_date,
      coalesce((select goals from my_goals mg where mg.match_id = mim.id), 0)::int as goals,
      exists(select 1 from my_awards ma where ma.match_id = mim.id and ma.award_type = 'motm') as motm,
      exists(select 1 from my_awards ma where ma.match_id = mim.id and ma.award_type = 'dotd') as dotd
    from my_appearances ap
    join matches_in_month mim on mim.id = ap.match_id
  ),
  best_game as (
    select
      match_id, match_date, goals, motm, dotd,
      goals
        + (case when motm then 3 else 0 end)
        + (case when dotd then 2 else 0 end) as impact
    from best_game_impact
    order by impact desc, goals desc, match_date desc
    limit 1
  ),
  teammate_counts as (
    -- Partner they shared a fixture with the most times this month.
    -- Excludes the player themselves and dedupes to shared fixture events.
    select
      tp_other.player_id       as partner_id,
      count(distinct mfe.fixture_id)::int as shared_fixtures
    from my_fixture_events mfe
    join public.team_players tp_other
      on tp_other.team_id = case when mfe.side = 1 then mfe.team1_id else mfe.team2_id end
     and tp_other.player_id <> p_player_id
    group by tp_other.player_id
    order by shared_fixtures desc
    limit 1
  ),
  player_months as (
    select distinct date_trunc('month', m.match_date)::date as ms
    from public.matches m
    join public.teams t         on t.match_id = m.id
    join public.team_players tp on tp.team_id = t.id
    where tp.player_id = p_player_id
      and m.status = 'completed'
      and m.match_date < (p_month_start + interval '1 month')::date
  ),
  ranked_months as (
    select
      ms,
      (extract(year from ms)::int * 12 + extract(month from ms)::int) as ms_ord,
      row_number() over (order by ms desc)                            as rn
    from player_months
    where ms <= p_month_start
  ),
  target_ord as (
    select (extract(year from p_month_start)::int * 12 + extract(month from p_month_start)::int) as t_ord
  ),
  streak_calc as (
    -- Consecutive months ending at p_month_start: for each rank position N,
    -- check that ms_ord = target - (N-1). count(*) naturally stops at the
    -- first gap because rows past the gap fail the equation.
    select count(*)::int as months
    from ranked_months rm, target_ord tord
    where rm.ms_ord = tord.t_ord - (rm.rn - 1)
  )
  select
    p_player_id,
    p_month_start,
    t.apps,
    t.goals,
    t.own_goals,
    t.motm_wins,
    t.dotd_nods,
    t.wins,
    t.draws,
    t.losses,
    (select match_id       from best_game)                                 as best_game_match_id,
    (select match_date     from best_game)                                 as best_game_date,
    coalesce((select goals from best_game), 0)::int                        as best_game_goals,
    coalesce((select motm  from best_game), false)                         as best_game_motm,
    coalesce((select dotd  from best_game), false)                         as best_game_dotd,
    (select partner_id from teammate_counts)                               as favourite_teammate_id,
    coalesce((select shared_fixtures from teammate_counts), 0)::int        as favourite_teammate_fixtures,
    coalesce((select months from streak_calc), 0)::int                     as streak_months
  from totals t;
$$;

grant execute on function public.monthly_player_summary(uuid, date) to authenticated;
