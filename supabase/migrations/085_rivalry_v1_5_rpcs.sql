-- Rivalry cards v1.5 — the two RPCs that back the new surfaces.
--
-- v1 (mig 084) exposed v_player_pair_stats + player_pair_stats_for()
-- for the Profile "Duos & rivals" card, aggregated per season.
-- v1.5 needs two more shapes:
--
-- 1. best_duo_from_players(player_ids, season)
--    → given a list of players on a team, return the highest win-rate
--      same-team pair (min 3 fixtures). Powers the "Best duo tonight"
--      caption on each published team card in the Tonight tab.
--    → Reads from the MV — cheap, no on-the-fly aggregation.
--
-- 2. duo_of_the_month(month_start)
--    → highest win-rate duo across a specific calendar month
--      (min 3 fixtures). Powers the Stats "Duo of the Month" hero.
--    → Cannot read from the MV (aggregated per season, not per month),
--      so recomputes from fixtures + team_players on the fly. Cheap:
--      only queries one month of data.

-- ─────────────────────────────────────────────────────────────────────
-- best_duo_from_players — for the "Best duo tonight" team-card caption
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.best_duo_from_players(
  p_player_ids       uuid[],
  p_season_start_year int default null
)
returns table (
  player_a_id     uuid,
  player_b_id     uuid,
  fixtures        int,
  matches         int,
  wins            int,
  draws           int,
  losses          int,
  win_rate        numeric
)
language sql
stable
as $$
  select
    player_a_id,
    player_b_id,
    sum(fixtures_played)::int as fixtures,
    sum(matches_played)::int  as matches,
    sum(a_wins)::int          as wins,
    sum(a_draws)::int         as draws,
    sum(a_losses)::int        as losses,
    (sum(a_wins)::numeric / nullif(sum(fixtures_played), 0)) as win_rate
  from public.v_player_pair_stats
  where same_team
    and player_a_id = any(p_player_ids)
    and player_b_id = any(p_player_ids)
    and (p_season_start_year is null or season_start_year = p_season_start_year)
  group by player_a_id, player_b_id
  having sum(fixtures_played) >= 3
  order by win_rate desc nulls last, sum(fixtures_played) desc
  limit 1;
$$;

grant execute on function public.best_duo_from_players(uuid[], int) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- duo_of_the_month — for the Stats "Duo of the Month" hero
--
-- Recomputes from raw tables so it works for any calendar month, not
-- just the season boundaries the MV aggregates by. p_month_start is
-- the first day of the target month; defaults to the current month.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.duo_of_the_month(
  p_month_start date default date_trunc('month', current_date)::date
)
returns table (
  player_a_id  uuid,
  player_b_id  uuid,
  month_start  date,
  fixtures     int,
  matches      int,
  wins         int,
  draws        int,
  losses       int,
  win_rate     numeric
)
language sql
stable
as $$
  with month_bounds as (
    select
      p_month_start                                as from_date,
      (p_month_start + interval '1 month')::date   as to_date
  ),
  fixture_players as (
    select
      f.id       as fixture_id,
      m.id       as match_id,
      tp.player_id,
      case when tp.team_id = f.team1_id then 1
           when tp.team_id = f.team2_id then 2
      end        as side,
      f.score1,
      f.score2
    from public.fixtures f
    join public.matches m       on m.id = f.match_id
    join month_bounds mb        on m.match_date >= mb.from_date
                                and m.match_date <  mb.to_date
    join public.teams t         on t.match_id = f.match_id
                                and (t.id = f.team1_id or t.id = f.team2_id)
    join public.team_players tp on tp.team_id = t.id
    where m.status = 'completed'
  ),
  duo_events as (
    select
      least(fp1.player_id, fp2.player_id)    as player_a_id,
      greatest(fp1.player_id, fp2.player_id) as player_b_id,
      fp1.fixture_id,
      fp1.match_id,
      case when fp1.player_id = least(fp1.player_id, fp2.player_id)
           then fp1.side else fp2.side end   as a_side,
      fp1.score1,
      fp1.score2
    from fixture_players fp1
    join fixture_players fp2
      on fp2.fixture_id = fp1.fixture_id
     and fp2.player_id  > fp1.player_id
     and fp2.side       = fp1.side          -- SAME team only (duo)
    where fp1.side is not null
      and fp2.side is not null
  ),
  aggregated as (
    select
      duo_events.player_a_id,
      duo_events.player_b_id,
      count(*)::int                    as fixtures,
      count(distinct match_id)::int    as matches,
      count(*) filter (
        where (a_side = 1 and score1 > score2)
           or (a_side = 2 and score2 > score1)
      )::int                           as wins,
      count(*) filter (
        where score1 = score2
      )::int                           as draws,
      count(*) filter (
        where (a_side = 1 and score1 < score2)
           or (a_side = 2 and score2 < score1)
      )::int                           as losses
    from duo_events
    group by duo_events.player_a_id, duo_events.player_b_id
    having count(*) >= 3
  )
  select
    a.player_a_id,
    a.player_b_id,
    p_month_start                                                 as month_start,
    a.fixtures,
    a.matches,
    a.wins,
    a.draws,
    a.losses,
    (a.wins::numeric / nullif(a.fixtures, 0))                     as win_rate
  from aggregated a
  order by win_rate desc, a.fixtures desc
  limit 1;
$$;

grant execute on function public.duo_of_the_month(date) to authenticated;
