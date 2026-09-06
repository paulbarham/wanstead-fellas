-- get_match_hooks(date) — the match report hook engine.
--
-- BACK-FILLED INTO THE REPO. Applied via the Supabase MCP as migration
-- `create_get_match_hooks` (version 20260906185349) before mig 090, but the
-- .sql file never landed in git. Numbered 089a/089b rather than 092/093 so the
-- file order still matches the real apply order — these ran between 089 and 090.
-- Already applied in production; re-running is a no-op (create or replace).
--
-- Returns ranked, pre-verified talking points for a match night: standings,
-- night totals, notable scorelines, scorers, keepers, parent/child match-ups,
-- returns from absence, debuts, MOTM/DOTD, fines, no-shows, injuries, recent
-- rulings, and how the balancer's prediction actually landed.
--
-- This is the ONLY permitted source of pitch events for generate-match-report.
-- The model may dress a hook in house style; it may never assert something the
-- hooks did not give it.

create or replace function public.get_match_hooks(p_match_date date)
returns table (family text, priority int, headline text, facts jsonb)
language sql stable as $fn$

with target as (
  select id as match_id, match_date, predicted_order from matches where match_date = p_match_date
),
tm as (
  select t.id, t.name, t.captain_id, t.bibs
  from teams t join target g on g.match_id = t.match_id
),
fx as (
  select f.* from fixtures f join target g on g.match_id = f.match_id
),
rl as (
  select team1_id as tid, team2_id as oid, score1 as gf, score2 as ga from fx
  union all
  select team2_id, team1_id, score2, score1 from fx
),
stand as (
  select tm.id, tm.name,
         sum(case when gf > ga then 3 when gf = ga then 1 else 0 end) as pts,
         count(*) filter (where gf > ga) as w,
         count(*) filter (where gf = ga) as d,
         count(*) filter (where gf < ga) as l,
         sum(gf) as gf, sum(ga) as ga, sum(gf) - sum(ga) as gd,
         count(*) filter (where ga = 0) as cs
  from rl join tm on tm.id = rl.tid
  group by tm.id, tm.name
),
ranked as (
  select *, rank() over (order by pts desc, gd desc, gf desc) as pos from stand
),
roster as (
  select tp.player_id, tm.id as team_id, tm.name as team
  from team_players tp join tm on tm.id = tp.team_id
),
pl as (
  select p.id, trim(p.name || ' ' || coalesce(p.surname, '')) as nm from profiles p
),
gk as (
  select tm.id as team_id, tm.name as team, (tf.slots->>'gk')::uuid as gk_id
  from team_formations tf join tm on tm.id = tf.team_id
  where tf.slots ? 'gk'
),
gl as (
  select g.player_id, sum(g.goals_count) as gls, bool_or(g.own_goal) as og
  from goals g join target t on t.match_id = g.match_id
  group by g.player_id
),
hist as (
  select r.player_id, max(m2.match_date) as last_before
  from roster r
  join team_players tp2 on tp2.player_id = r.player_id
  join teams t2 on t2.id = tp2.team_id
  join matches m2 on m2.id = t2.match_id
  cross join target g
  where m2.match_date < g.match_date
  group by r.player_id
),
prior_goals as (
  select g.player_id, sum(g.goals_count) as prior
  from goals g join matches m2 on m2.id = g.match_id
  cross join target t
  where m2.match_date < t.match_date and m2.match_date >= date_trunc('year', t.match_date)
  group by g.player_id
),
pred as (
  select (e->>'position')::int as position, e->>'team_name' as team_name
  from target t, jsonb_array_elements(coalesce(t.predicted_order, '[]'::jsonb)) e
)

select 'standings'::text, 100,
       ranked.name || ' finished ' || ranked.pos || ' on ' || ranked.pts || ' points',
       jsonb_build_object('team', ranked.name, 'position', ranked.pos, 'points', ranked.pts,
                          'w', ranked.w, 'd', ranked.d, 'l', ranked.l,
                          'gf', ranked.gf, 'ga', ranked.ga, 'clean_sheets', ranked.cs)
from ranked

union all
select 'night_totals', 90,
       (select count(*) from fx) || ' games, ' || (select sum(gf) from rl) || ' goals, '
       || (select sum(cs) from stand) || ' clean sheets',
       jsonb_build_object('games', (select count(*) from fx),
                          'goals', (select sum(gf) from rl),
                          'clean_sheets', (select sum(cs) from stand),
                          'goalless_games', (select count(*) from fx where score1 = 0 and score2 = 0),
                          'players', (select count(*) from roster))

union all
select 'scoreline', 80,
       t1.name || ' ' || fx.score1 || '-' || fx.score2 || ' ' || t2.name
       || ' (margin ' || abs(fx.score1 - fx.score2) || ')',
       jsonb_build_object('winner', case when fx.score1 > fx.score2 then t1.name else t2.name end,
                          'loser',  case when fx.score1 > fx.score2 then t2.name else t1.name end,
                          'score', fx.score1 || '-' || fx.score2,
                          'margin', abs(fx.score1 - fx.score2))
from fx join tm t1 on t1.id = fx.team1_id join tm t2 on t2.id = fx.team2_id
where abs(fx.score1 - fx.score2) >= 3

union all
select 'scorer',
       case when gl.gls >= 3 then 95 when gl.gls = 2 then 70 else 50 end,
       pl.nm || ' scored ' || gl.gls || ' for ' || roster.team,
       jsonb_build_object('player', pl.nm, 'team', roster.team, 'goals', gl.gls,
                          'own_goal', gl.og,
                          'season_before', coalesce(pg.prior, 0),
                          'season_after', coalesce(pg.prior, 0) + gl.gls,
                          'hat_trick', gl.gls >= 3)
from gl join pl on pl.id = gl.player_id
        join roster on roster.player_id = gl.player_id
        left join prior_goals pg on pg.player_id = gl.player_id

union all
select 'keeper',
       case when s.ga = 0 then 75 else 55 end,
       pl.nm || ' kept goal for ' || gk.team || ', conceded ' || s.ga
       || case when s.cs > 0 then ' (' || s.cs || ' clean sheet(s))' else '' end,
       jsonb_build_object('player', pl.nm, 'team', gk.team, 'conceded', s.ga, 'clean_sheets', s.cs)
from gk join pl on pl.id = gk.gk_id join stand s on s.id = gk.team_id

union all
select 'family', 85,
       pp.nm || ' and ' || cc.nm || ' on opposing teams (' || rp.team || ' v ' || rc.team || ')',
       jsonb_build_object('parent', pp.nm, 'parent_team', rp.team,
                          'child', cc.nm, 'child_team', rc.team,
                          'parent_pos', sp.pos, 'child_pos', sc.pos,
                          'child_in_goal', exists (select 1 from gk where gk.gk_id = lp.child_id),
                          'parent_in_goal', exists (select 1 from gk where gk.gk_id = lp.parent_id),
                          'head_to_head', (select rp.team || ' ' ||
                                             case when f2.team1_id = rp.team_id then f2.score1 || '-' || f2.score2
                                                  else f2.score2 || '-' || f2.score1 end || ' ' || rc.team
                                           from fx f2
                                           where (f2.team1_id = rp.team_id and f2.team2_id = rc.team_id)
                                              or (f2.team1_id = rc.team_id and f2.team2_id = rp.team_id)
                                           limit 1))
from linked_profiles lp
join roster rp on rp.player_id = lp.parent_id
join roster rc on rc.player_id = lp.child_id
join pl pp on pp.id = lp.parent_id
join pl cc on cc.id = lp.child_id
join ranked sp on sp.id = rp.team_id
join ranked sc on sc.id = rc.team_id
where rp.team_id <> rc.team_id

union all
select 'return',
       case when (select match_date from target) - hist.last_before >= 42 then 80 else 60 end,
       pl.nm || ' back after ' || (((select match_date from target) - hist.last_before) / 7) || ' weeks away',
       jsonb_build_object('player', pl.nm, 'team', r.team,
                          'last_played', hist.last_before,
                          'weeks_away', ((select match_date from target) - hist.last_before) / 7,
                          'goals_tonight', coalesce(g2.gls, 0),
                          'team_position', s.pos)
from hist
join roster r on r.player_id = hist.player_id
join pl on pl.id = hist.player_id
join ranked s on s.id = r.team_id
left join gl g2 on g2.player_id = hist.player_id
where (select match_date from target) - hist.last_before >= 21

union all
select 'debut', 85,
       pl.nm || ' made their debut',
       jsonb_build_object('player', pl.nm, 'team', r.team, 'goals_tonight', coalesce(g2.gls, 0))
from roster r
join pl on pl.id = r.player_id
join profiles p on p.id = r.player_id
left join gl g2 on g2.player_id = r.player_id
where p.debut_at = (select match_date from target)

union all
select 'award', 90,
       upper(ar.award_type) || ': ' || pl.nm || ' (' || ar.vote_count || '/' || ar.total_votes || ' votes)',
       jsonb_build_object('award', ar.award_type, 'player', pl.nm,
                          'votes', ar.vote_count, 'total', ar.total_votes,
                          'shared', ar.is_shared, 'admin_override', ar.is_admin_override,
                          'margin_note', case when ar.vote_count::numeric / nullif(ar.total_votes, 0) > 0.6
                                              then 'landslide' else 'tight' end)
from award_results ar
join target t on t.match_id = ar.match_id
join pl on pl.id = ar.player_id

union all
select 'fine', 70,
       pl.nm || ' fined £' || f.amount || ' (' || f.type || ')',
       jsonb_build_object('player', pl.nm, 'type', f.type, 'amount', f.amount, 'notes', f.notes)
from fines f join pl on pl.id = f.player_id
where f.match_date = p_match_date

union all
select 'availability', 65,
       pl.nm || ' signed up (' || a.status || ') but did not appear in a squad',
       jsonb_build_object('player', pl.nm, 'status', a.status)
from availability a join pl on pl.id = a.player_id
where a.match_date = p_match_date
  and a.status = 'confirmed'
  and not exists (select 1 from roster r where r.player_id = a.player_id)

union all
select 'injury', 60,
       pl.nm || ' - ' || i.injury_type ||
       case when i.cleared_at is not null then ' (cleared)' else ' (ongoing)' end,
       jsonb_build_object('player', pl.nm, 'injury', i.injury_type, 'notes', i.notes,
                          'cleared', i.cleared_at is not null,
                          'played_tonight', exists (select 1 from roster r where r.player_id = i.player_id))
from injuries i join pl on pl.id = i.player_id
where i.reported_at >= p_match_date - 21

union all
select 'decision', 55,
       'Ruling: ' || d.summary,
       jsonb_build_object('category', d.category, 'summary', d.summary, 'details', d.details)
from decisions d
where d.archived is not true
  and d.category in ('rules', 'committee', 'fines', 'format')
  and d.decided_at >= p_match_date - 7
  and d.decided_at < p_match_date + 1

union all
select 'algorithm', 90,
       case when (select count(*) from pred p2 join ranked r2 on r2.name = p2.team_name and r2.pos = p2.position)
                 = (select count(*) from pred)
            then 'Balancer called the finishing order exactly'
            else 'Balancer got ' || (select count(*) from pred p2 join ranked r2 on r2.name = p2.team_name and r2.pos = p2.position)
                 || ' of ' || (select count(*) from pred) || ' positions right' end,
       jsonb_build_object(
         'exact_hits', (select count(*) from pred p2 join ranked r2 on r2.name = p2.team_name and r2.pos = p2.position),
         'teams', (select count(*) from pred),
         'rows', (select jsonb_agg(jsonb_build_object('position', p2.position,
                                                      'predicted', p2.team_name,
                                                      'actual', (select r3.name from ranked r3 where r3.pos = p2.position))
                                   order by p2.position) from pred p2))
where exists (select 1 from pred)

order by 2 desc, 1;
$fn$;

comment on function public.get_match_hooks(date) is
  'Match report hook engine. Returns ranked, pre-verified talking points for a match night. The report generator may dress these in house style but must never assert a pitch event that did not arrive as a hook or a captured moment.';
