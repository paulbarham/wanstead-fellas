-- Rescale MoW scoring from 5/3/0 to 3/1/0.
--
-- Admin call (2 Aug 2026): the 5-vs-3 gap for exact score was too tight —
-- an exact-caller and a get-the-winner-right caller landed within 40% of
-- each other on a settled week. Widening the ratio to 3-vs-1 makes the
-- exact score genuinely worth the risk (3x, not 1.67x). Result-only stays
-- worth something so a right-winner call isn't wasted.
--
-- New scale:
--   Exact scoreline  → 3 pts (was 5)
--   Right H/D/A only → 1 pt  (was 3)
--   Wrong result     → 0 pts (unchanged)
--
-- Migration also rescores every already-settled prediction so the season
-- leaderboard reflects the new scale immediately — no half-and-half state.

-- ── 1. Loosen the CHECK constraint so we can carry the intermediate 1
--       through the rescore step, then tighten to the new domain. Done in
--       two passes because a single ALTER can't be conditional on values.
alter table public.mow_predictions
  drop constraint if exists mow_predictions_points_awarded_check;

alter table public.mow_predictions
  add constraint mow_predictions_points_awarded_check
  check (points_awarded is null or points_awarded in (0, 1, 3));

-- ── 2. Rewrite the settle trigger so any future score-in uses the new scale.
create or replace function public.settle_mow_predictions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_new_result char;
begin
  if (new.home_score is not distinct from old.home_score)
     and (new.away_score is not distinct from old.away_score) then
    return new;
  end if;

  if new.home_score is null or new.away_score is null then
    update public.mow_predictions p
       set points_awarded = null
      from public.mow_fixtures f
     where f.pool_fixture_id = new.id
       and p.mow_fixture_id = f.id;
    return new;
  end if;

  v_new_result := case
    when new.home_score > new.away_score then 'H'
    when new.home_score < new.away_score then 'A'
    else 'D'
  end;

  update public.mow_predictions p
     set points_awarded = case
       when p.home_score = new.home_score and p.away_score = new.away_score then 3
       when (case
               when p.home_score > p.away_score then 'H'
               when p.home_score < p.away_score then 'A'
               else 'D'
             end) = v_new_result then 1
       else 0
     end
    from public.mow_fixtures f
   where f.pool_fixture_id = new.id
     and p.mow_fixture_id = f.id;

  return new;
end;
$$;

-- ── 3. Rescore already-settled predictions (5 → 3, 3 → 1, 0 stays 0).
--       Uses the pool fixture's final score as the source of truth so we
--       don't rely on old point values being correct — a fresh recomputation
--       from scores + picks.
update public.mow_predictions p
   set points_awarded = case
     when p.home_score = pf.home_score and p.away_score = pf.away_score then 3
     when (case when p.home_score > p.away_score then 'H'
                when p.home_score < p.away_score then 'A' else 'D' end)
        = (case when pf.home_score > pf.away_score then 'H'
                when pf.home_score < pf.away_score then 'A' else 'D' end) then 1
     else 0
   end
  from public.mow_fixtures f
  join public.mow_pool_fixtures pf on pf.id = f.pool_fixture_id
 where p.mow_fixture_id = f.id
   and p.points_awarded is not null
   and pf.home_score is not null
   and pf.away_score is not null;

-- ── 4. View aggregate: result-only bucket switches from `= 3` to `= 1`.
--       Everything else (exact_count, total_pts, wrong_count) recomputes
--       automatically once the underlying rows are rescored.
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
      else make_date(extract(year from current_date)::int - 1, 8, 1)
    end)
)
select
  s.player_id,
  (pr.name || ' ' || pr.surname)             as display_name,
  count(*)::int                              as picks_settled,
  sum(s.points_awarded)::int                 as total_pts,
  count(*) filter (where s.is_exact)::int    as exact_count,
  count(*) filter (where s.points_awarded = 1)::int as result_only_count,
  count(*) filter (where s.points_awarded = 0)::int as wrong_count
from settled s
join public.profiles pr on pr.id = s.player_id
group by s.player_id, pr.name, pr.surname
order by total_pts desc, exact_count desc, pr.name;

-- ── 5. Refresh the table comment so future readers see the correct scale.
comment on table public.mow_predictions is
  'One prediction per player per weekly MoW. Scored 3 for exact, 1 for correct H/D/A, 0 otherwise (rescale mig 074 · was 5/3/0).';
