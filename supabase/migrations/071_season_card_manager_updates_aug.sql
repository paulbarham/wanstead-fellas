-- Two PL manager changes since the 28 Jul seed (mig 065). Cross-checked
-- via web on 1 Aug 2026:
--
--   Newcastle:      Eddie Howe        → Matthias Jaissle
--                   (Howe left, Jaissle poached from Al Ahli on 4-year deal)
--   Nott. Forest:   Vítor Pereira     → Oliver Glasner
--                   (Pereira sacked despite PL survival + Europa SF run;
--                    Glasner left Crystal Palace at end of 2025-26)
--
-- Safe to DELETE + INSERT — no first-sacked predictions on the affected
-- rows yet (Season Card doesn't open until 21 Aug PL kickoff).
--
-- Crystal Palace's Pierre Sage was already correct in mig 065 (took over
-- from Glasner in June 2026); no change there.

with sc as (select id from public.season_cards where season = '2026-27' limit 1)
delete from public.season_card_options
where option_type = 'pl_manager'
  and season_card_id = (select id from sc)
  and option_key in ('newcastle:eddie_howe', 'nottingham_forest:vitor_pereira');

with sc as (select id from public.season_cards where season = '2026-27' limit 1)
insert into public.season_card_options
  (season_card_id, option_type, option_key, display_name, default_rank, extra)
values
  ((select id from sc), 'pl_manager', 'newcastle:matthias_jaissle',
   'Matthias Jaissle (Newcastle)', 7,
   jsonb_build_object('club_slug', 'newcastle')),
  ((select id from sc), 'pl_manager', 'nottingham_forest:oliver_glasner',
   'Oliver Glasner (Nott. Forest)', 14,
   jsonb_build_object('club_slug', 'nottingham_forest'))
on conflict (season_card_id, option_type, option_key) do nothing;
