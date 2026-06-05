-- ── Data-driven physical-stat suggestions from fitness_sessions ───────────────
-- Read-only view: aggregates each tracked player's recent sessions into robust
-- metrics, then maps them to suggested 1-10 values for the PHYSICAL base attrs
-- only: Pace (sp), Stamina (st), Work rate (wr). It never writes — the admin
-- "Edit Stats" UI shows these as suggestions to apply by hand.
--
-- Normalisation: with a small squad we can't rank, so we fall back to absolute
-- thresholds (heuristic, tunable). Once >= 8 players are tracked we switch to
-- squad-relative percentiles, which sharpen automatically as more sign up.
-- security_invoker = on so the underlying fitness_sessions RLS applies.

create or replace view public.player_fitness_suggestions
with (security_invoker = on) as
with agg as (
  select
    fs.profile_id,
    count(*)::int                                              as sessions_count,
    max(fs.recorded_start)                                     as last_session,
    -- prefer top speeds from sessions NOT flagged as GPS spikes; fall back to any
    max(fs.max_speed_kmh::numeric)
      filter (where coalesce(fs.raw->>'top_speed_note','') = '') as top_speed_clean,
    max(fs.max_speed_kmh::numeric)                            as top_speed_any,
    -- distance normalised to a per-60-minute rate (games vary in length)
    avg(fs.distance_m::numeric / nullif(fs.duration_s, 0) * 3600.0) as dist_per_hr_m,
    -- seconds sprinting (>15km/h) per minute of play
    avg(coalesce((fs.raw->>'sprint_seconds_over_15kmh')::numeric, 0)
        / nullif(fs.duration_s / 60.0, 0))                    as sprint_per_min,
    avg(fs.avg_hr::numeric)                                    as avg_hr
  from public.fitness_sessions fs
  where fs.recorded_start > now() - interval '365 days'
  group by fs.profile_id
),
m as (
  select agg.*, coalesce(top_speed_clean, top_speed_any) as top_speed_kmh
  from agg
),
ranked as (
  select
    m.*,
    count(*) over ()                                          as tracked_n,
    percent_rank() over (order by top_speed_kmh)              as pr_pace,
    percent_rank() over (order by dist_per_hr_m)              as pr_stamina,
    percent_rank() over (
      order by coalesce(dist_per_hr_m, 0) / 1300.0 + coalesce(sprint_per_min, 0) * 1.5
    )                                                          as pr_wr
  from m
)
select
  profile_id,
  sessions_count,
  last_session,
  round(top_speed_kmh, 1)        as top_speed_kmh,
  round(dist_per_hr_m)           as dist_per_hr_m,
  round(sprint_per_min, 2)       as sprint_per_min,
  round(avg_hr)                  as avg_hr,
  tracked_n,
  case when tracked_n >= 8 then 'relative' else 'absolute' end as method,
  -- Pace (sp) ← top speed
  case when tracked_n >= 8
    then greatest(1, least(10, round(1 + 9 * pr_pace)))::int
    else greatest(1, least(10, round((top_speed_kmh - 18) * 0.55)))::int
  end as sp_suggested,
  -- Stamina (st) ← distance per 60 min
  case when tracked_n >= 8
    then greatest(1, least(10, round(1 + 9 * pr_stamina)))::int
    else greatest(1, least(10, round(dist_per_hr_m / 1100.0)))::int
  end as st_suggested,
  -- Work rate (wr) ← distance + sprint frequency
  case when tracked_n >= 8
    then greatest(1, least(10, round(1 + 9 * pr_wr)))::int
    else greatest(1, least(10, round(dist_per_hr_m / 1300.0 + sprint_per_min * 1.5)))::int
  end as wr_suggested,
  case
    when sessions_count >= 7 then 'high'
    when sessions_count >= 3 then 'medium'
    else 'low'
  end as confidence
from ranked;

grant select on public.player_fitness_suggestions to authenticated;
