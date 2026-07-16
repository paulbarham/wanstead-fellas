-- Make penalty shootouts opt-in per match.
--
-- Rationale: the pens flow (migration 035, primer 20) shipped 9 Jul 2026 as a
-- World Cup one-off. The plan was to keep it "if the squad enjoys it" — feedback
-- landed as "one-off please, not every week". Rather than rip the feature out,
-- flip it to opt-in so any future special night (WC final, cup night, banter
-- week) can be enabled from the Admin Match Entry tab with one toggle.
--
-- Historical data preserved: the 9 Jul match is backfilled `true` so the pens
-- winner + bonus point still render in the standings, result card and history.
-- Every other match — past, present, future — defaults to `false` and the
-- entry UI skips the "pick winner" gate on drawn fixtures.

alter table public.matches
  add column if not exists shootout_enabled boolean not null default false;

comment on column public.matches.shootout_enabled is
  'When true, drawn fixtures on this match need a penalty-shootout winner recorded before results can be submitted, and the winner takes a +1 bonus point. Default false.';

-- Retro-enable the one match that used pens (9 Jul 2026) so its results
-- keep rendering the pens winner and bonus.
update public.matches
   set shootout_enabled = true
 where match_date = '2026-07-09';
