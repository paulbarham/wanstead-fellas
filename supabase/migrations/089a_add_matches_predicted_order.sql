-- matches.predicted_order — the balancer's pre-match call, frozen at announcement.
--
-- BACK-FILLED INTO THE REPO. Applied via the Supabase MCP as migration
-- `add_matches_predicted_order` (version 20260906185308) before mig 090, but the
-- .sql file never landed in git. Numbered 089a/089b rather than 092/093 so the
-- file order still matches the real apply order — these ran between 089 and 090.
-- Already applied in production; re-running is a no-op.
--
-- Written by AdminTeamBuilder.publish() from the same predictTable() call that
-- renders the "LIKELY FINAL TABLE" block in the announcement, so what the group
-- is told is exactly what Friday's report grades. Without it the 'algorithm'
-- hook in get_match_hooks() has nothing to compare against and goes silent.

alter table public.matches add column if not exists predicted_order jsonb;

comment on column public.matches.predicted_order is
  'Pre-match predicted finishing order, written at team-announcement time as [{"position":1,"team_name":"..."}]. Feeds the algorithm-accuracy hook in get_match_hooks().';

-- Backfill 2026-09-03 from the report that already recorded predicted vs actual
update public.matches m
set predicted_order = (
  select jsonb_agg(jsonb_build_object('position', (row_elem->>'position')::int,
                                      'team_name', row_elem->>'predicted')
                   order by (row_elem->>'position')::int)
  from public.results r, jsonb_array_elements(r.predictions->'rows') row_elem
  where r.match_id = m.id
)
where m.match_date = '2026-09-03'
  and m.predicted_order is null
  and exists (select 1 from public.results r
              where r.match_id = m.id and jsonb_typeof(r.predictions->'rows') = 'array');
