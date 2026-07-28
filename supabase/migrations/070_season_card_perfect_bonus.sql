-- Grand-slam bonus for a perfect Season Card.
--
-- Admin ask 28 Jul: add a bonus for a fella who calls every single market
-- exactly right — however unlikely. Default value is 25 pts, meaningful
-- without single-handedly deciding the leaderboard. Lives on
-- season_cards.perfect_bonus_pts so admin can tune per season.
--
-- "Perfect" means: EVERY market on the card has resolved AND the player
-- scored the max on every one of them. For our 2026-27 shape:
--   4 singles at max (10 + 10 + 15 + 10 = 45)
--   3 triples with all 3 slots exact (3 * 9 = 27)
--   Base max = 72
--   With bonus  = 72 + 25 = 97
--
-- Enforced in the view (no separate table needed) — the bonus applies
-- automatically once the last market is resolved.

alter table public.season_cards
  add column if not exists perfect_bonus_pts int not null default 25;

drop view if exists public.v_season_card_leaderboard;

create view public.v_season_card_leaderboard as
with market_shape as (
  -- Max pts per market + whether it's been resolved yet.
  select
    id                as market_id,
    season_card_id,
    (case when num_picks = 1 then points_per_exact
          else num_picks * points_per_exact end)::int as max_pts,
    (resolved_answers is not null) as is_resolved
  from public.season_card_markets
),
season_totals as (
  -- Season-level aggregates: how many markets exist, how many resolved,
  -- and the running max pts available so far (sum of resolved-market maxes).
  select
    season_card_id,
    count(*)::int                        as markets_total_count,
    count(*) filter (where is_resolved)::int as markets_resolved_count,
    sum(case when is_resolved then max_pts else 0 end)::int as resolved_max_pts
  from market_shape
  group by season_card_id
),
player_settled as (
  -- Per-player total across only-settled predictions.
  select
    p.player_id,
    m.season_card_id,
    coalesce(sum(p.points_awarded), 0)::int as base_pts,
    count(*)::int                            as picks_settled
  from public.season_card_predictions p
  join public.season_card_markets     m on m.id = p.market_id
  where p.points_awarded is not null
  group by p.player_id, m.season_card_id
),
combined as (
  select
    ps.season_card_id,
    ps.player_id,
    ps.base_pts,
    ps.picks_settled,
    st.markets_total_count,
    st.markets_resolved_count,
    st.resolved_max_pts,
    -- Perfect card: every market resolved AND player scored the full max
    -- available. Uses ps.base_pts >= st.resolved_max_pts (not = to be
    -- forgiving of any future scoring-tier edge case) but the season is
    -- only truly perfect once all markets are in.
    (st.markets_resolved_count = st.markets_total_count
      and ps.base_pts >= st.resolved_max_pts) as is_perfect_card,
    sc.perfect_bonus_pts
  from player_settled ps
  join season_totals  st on st.season_card_id = ps.season_card_id
  join public.season_cards sc on sc.id = ps.season_card_id
)
select
  c.season_card_id,
  sc.season,
  c.player_id,
  pr.name || ' ' || coalesce(pr.surname,'')            as display_name,
  (c.base_pts + case when c.is_perfect_card then c.perfect_bonus_pts else 0 end)::int as total_pts,
  c.base_pts,
  case when c.is_perfect_card then c.perfect_bonus_pts else 0 end::int as bonus_pts,
  c.is_perfect_card,
  c.picks_settled
from combined c
join public.season_cards sc on sc.id = c.season_card_id
join public.profiles     pr on pr.id = c.player_id
order by sc.season desc, total_pts desc, pr.name;

grant select on public.v_season_card_leaderboard to authenticated;

comment on column public.season_cards.perfect_bonus_pts is
  'Grand-slam bonus awarded to a player who scores the season max on every market (all singles exact + all triples all-slots-exact). Applied by the v_season_card_leaderboard view once all markets are resolved.';
