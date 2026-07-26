-- Seed 20 PL managers for the 2026-27 Season Card.
--
-- football-data.org's free tier returns coach fields all-null (verified
-- 26 Jul 2026 via season-card-seed-options debug), so the automated fetch
-- can't populate the first-sacked market. Hard-seed instead — managers
-- rarely change (2-3 per season on average) and admin can UPDATE
-- display_name / option_key when the next one goes. All my best guesses
-- for 2026-27 preseason — expect a few to be wrong, correct via SQL.
--
-- option_key format: `<club_slug>:<slugified_name>` — collision-safe and
-- lets us keep the same key if a manager returns to the same club.

with sc as (
  select id from public.season_cards where season = '2026-27' limit 1
)
insert into public.season_card_options
  (season_card_id, option_type, option_key, display_name, default_rank, extra)
select sc.id, 'pl_manager', k, n, r, jsonb_build_object('club_slug', c)
from sc, (
  values
    -- (rank inherits from club rank so top-6 managers head the dropdown)
    ('arsenal:mikel_arteta',            'Mikel Arteta (Arsenal)',                  2, 'arsenal'),
    ('aston_villa:unai_emery',          'Unai Emery (Aston Villa)',                8, 'aston_villa'),
    ('bournemouth:andoni_iraola',       'Andoni Iraola (Bournemouth)',            15, 'bournemouth'),
    ('brentford:keith_andrews',         'Keith Andrews (Brentford)',              13, 'brentford'),
    ('brighton:fabian_hurzeler',        'Fabian Hürzeler (Brighton)',              9, 'brighton'),
    ('chelsea:enzo_maresca',            'Enzo Maresca (Chelsea)',                  4, 'chelsea'),
    ('coventry:frank_lampard',          'Frank Lampard (Coventry)',               18, 'coventry'),
    ('crystal_palace:oliver_glasner',   'Oliver Glasner (Crystal Palace)',        10, 'crystal_palace'),
    ('everton:david_moyes',             'David Moyes (Everton)',                  12, 'everton'),
    ('fulham:marco_silva',              'Marco Silva (Fulham)',                   11, 'fulham'),
    ('hull:sergej_jakirovic',           'Sergej Jakirović (Hull)',                19, 'hull'),
    ('ipswich:kieran_mckenna',          'Kieran McKenna (Ipswich)',               20, 'ipswich'),
    ('leeds:daniel_farke',              'Daniel Farke (Leeds)',                   16, 'leeds'),
    ('liverpool:arne_slot',             'Arne Slot (Liverpool)',                   3, 'liverpool'),
    ('man_city:pep_guardiola',          'Pep Guardiola (Man City)',                1, 'man_city'),
    ('man_utd:ruben_amorim',            'Rúben Amorim (Man Utd)',                  6, 'man_utd'),
    ('newcastle:eddie_howe',            'Eddie Howe (Newcastle)',                  7, 'newcastle'),
    ('nottingham_forest:nuno_es',       'Nuno Espírito Santo (Nott. Forest)',     14, 'nottingham_forest'),
    ('sunderland:regis_le_bris',        'Régis Le Bris (Sunderland)',             17, 'sunderland'),
    ('tottenham:thomas_frank',          'Thomas Frank (Tottenham)',                5, 'tottenham')
) as m(k, n, r, c)
on conflict (season_card_id, option_type, option_key) do nothing;
