-- Seed 20 PL managers for the 2026-27 Season Card.
--
-- football-data.org's free tier returns coach fields all-null (verified
-- 26 Jul 2026 via season-card-seed-options debug), so the automated fetch
-- can't populate the first-sacked market. Hard-seed instead — managers
-- rarely change (2-3 per season on average) and admin can UPDATE
-- display_name / option_key when the next one goes.
--
-- Source: Wikipedia 2026-27 Premier League, club official announcements
-- (Chelsea, Man Utd, Liverpool, Fulham), cross-checked via web search on
-- 26 Jul 2026. The 2026 close-season churn was unusually heavy — 10 of
-- 20 clubs replaced their manager between May and Jul 2026.
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
    ('man_city:enzo_maresca',           'Enzo Maresca (Man City)',                 1, 'man_city'),
    ('arsenal:mikel_arteta',            'Mikel Arteta (Arsenal)',                  2, 'arsenal'),
    ('liverpool:andoni_iraola',         'Andoni Iraola (Liverpool)',               3, 'liverpool'),
    ('chelsea:xabi_alonso',             'Xabi Alonso (Chelsea)',                   4, 'chelsea'),
    ('tottenham:roberto_de_zerbi',      'Roberto De Zerbi (Tottenham)',            5, 'tottenham'),
    ('man_utd:michael_carrick',         'Michael Carrick (Man Utd)',               6, 'man_utd'),
    ('newcastle:matthias_jaissle',      'Matthias Jaissle (Newcastle)',            7, 'newcastle'),
    ('aston_villa:unai_emery',          'Unai Emery (Aston Villa)',                8, 'aston_villa'),
    ('brighton:fabian_hurzeler',        'Fabian Hürzeler (Brighton)',              9, 'brighton'),
    ('crystal_palace:pierre_sage',      'Pierre Sage (Crystal Palace)',           10, 'crystal_palace'),
    ('fulham:alvaro_arbeloa',           'Álvaro Arbeloa (Fulham)',                11, 'fulham'),
    ('everton:david_moyes',             'David Moyes (Everton)',                  12, 'everton'),
    ('brentford:keith_andrews',         'Keith Andrews (Brentford)',              13, 'brentford'),
    ('nottingham_forest:oliver_glasner','Oliver Glasner (Nott. Forest)',          14, 'nottingham_forest'),
    ('bournemouth:marco_rose',          'Marco Rose (Bournemouth)',               15, 'bournemouth'),
    ('leeds:daniel_farke',              'Daniel Farke (Leeds)',                   16, 'leeds'),
    ('sunderland:regis_le_bris',        'Régis Le Bris (Sunderland)',             17, 'sunderland'),
    ('coventry:frank_lampard',          'Frank Lampard (Coventry)',               18, 'coventry'),
    ('hull:sergej_jakirovic',           'Sergej Jakirović (Hull)',                19, 'hull'),
    ('ipswich:gary_oneill',             'Gary O''Neill (Ipswich)',                20, 'ipswich')
) as m(k, n, r, c)
on conflict (season_card_id, option_type, option_key) do nothing;
