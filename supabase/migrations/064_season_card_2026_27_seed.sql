-- Seed the 2026-27 Season Card + its 7 markets + PL / Championship club
-- options. Player + manager options land via the `season-card-seed-options`
-- edge fn once deployed (needs football-data.org squads endpoint).
--
-- Timing (all UK):
--   lock_at            = Fri 14 Aug 2026 19:00 UK (best-guess T-1h before
--                        the first PL 2026-27 kickoff; admin can UPDATE
--                        once the fixture list is confirmed).
--   edit_window_start  = Wed 2 Sept 2026 00:00 (day after summer transfer
--                        window closes, typically 1 Sept 23:00 UK).
--   edit_window_end    = Fri 4 Sept 2026 00:00 (2 full days to rework).
--
-- default_rank on club options is a preseason favourites-first ordering
-- (my judgement — admin can re-rank via UPDATE for launch).

insert into public.season_cards (season, lock_at, edit_window_start, edit_window_end)
values (
  '2026-27',
  '2026-08-14 18:00:00+00',
  '2026-09-02 00:00:00+00',
  '2026-09-04 00:00:00+00'
)
on conflict (season) do nothing;

with sc as (
  select id from public.season_cards where season = '2026-27' limit 1
)
insert into public.season_card_markets
  (season_card_id, key, title, help_text, num_picks, slot_labels, option_type, display_order)
select id, key, title, help_text, num_picks, slot_labels, option_type, display_order
from sc, (
  values
    (1, 'pl_winner',             'Premier League Champion',
        'One club — the 2026-27 title-winner.',
        1, null::text[], 'pl_club'),
    (2, 'top4_others',           'Top 4 — Places 2–4',
        '3 ordered slots. 3 pts exact position · 1 pt right club wrong slot.',
        3, array['2nd','3rd','4th'], 'pl_club'),
    (3, 'relegated',             'Relegated',
        '3 ordered slots (18th / 19th / 20th). 3 pts exact · 1 pt right club wrong slot.',
        3, array['18th','19th','20th'], 'pl_club'),
    (4, 'top_scorer',            'Golden Boot',
        'PL top scorer at season end.',
        1, null::text[], 'pl_player'),
    (5, 'most_assists',          'Playmaker',
        'Most PL assists at season end.',
        1, null::text[], 'pl_player'),
    (6, 'first_sacked',          'First manager sacked',
        'First PL manager to leave their post — including mutual consent.',
        1, null::text[], 'pl_manager'),
    (7, 'championship_promoted', 'Championship — Promoted',
        '3 ordered slots (Champion / Runner-up / Playoff Winner). 3 pts exact · 1 pt right club wrong slot.',
        3, array['Champion','Runner-up','Playoff Winner'], 'championship_club')
) as m(display_order, key, title, help_text, num_picks, slot_labels, option_type)
on conflict (season_card_id, key) do nothing;

-- ── PL club options (2026-27 season) ────────────────────────────────────
-- default_rank is a preseason favourites ordering. Admin can re-rank via
-- UPDATE season_card_options SET default_rank = ... anytime before lock.
-- Every PL club is added to the pool (used by pl_winner, top4_others,
-- relegated markets).

with sc as (
  select id from public.season_cards where season = '2026-27' limit 1
)
insert into public.season_card_options
  (season_card_id, option_type, option_key, display_name, default_rank)
select id, 'pl_club', slug, name, rank from sc, (
  values
    ( 1, 'man_city',           'Manchester City'),
    ( 2, 'arsenal',            'Arsenal'),
    ( 3, 'liverpool',          'Liverpool'),
    ( 4, 'chelsea',            'Chelsea'),
    ( 5, 'tottenham',          'Tottenham Hotspur'),
    ( 6, 'man_utd',            'Manchester United'),
    ( 7, 'newcastle',          'Newcastle United'),
    ( 8, 'aston_villa',        'Aston Villa'),
    ( 9, 'brighton',           'Brighton & Hove Albion'),
    (10, 'crystal_palace',     'Crystal Palace'),
    (11, 'fulham',             'Fulham'),
    (12, 'everton',            'Everton'),
    (13, 'brentford',          'Brentford'),
    (14, 'nottingham_forest',  'Nottingham Forest'),
    (15, 'bournemouth',        'AFC Bournemouth'),
    (16, 'leeds',              'Leeds United'),
    (17, 'sunderland',         'Sunderland'),
    (18, 'coventry',           'Coventry City'),
    (19, 'hull',               'Hull City'),
    (20, 'ipswich',            'Ipswich Town')
) as c(rank, slug, name)
on conflict (season_card_id, option_type, option_key) do nothing;

-- ── Championship club options ───────────────────────────────────────────
-- Ordered by preseason promotion favourites (recent PL relegatees at top).

with sc as (
  select id from public.season_cards where season = '2026-27' limit 1
)
insert into public.season_card_options
  (season_card_id, option_type, option_key, display_name, default_rank)
select id, 'championship_club', slug, name, rank from sc, (
  values
    ( 1, 'west_ham',      'West Ham United'),
    ( 2, 'wolves',        'Wolverhampton Wanderers'),
    ( 3, 'burnley',       'Burnley'),
    ( 4, 'middlesbrough', 'Middlesbrough'),
    ( 5, 'southampton',   'Southampton'),
    ( 6, 'sheff_united',  'Sheffield United'),
    ( 7, 'norwich',       'Norwich City'),
    ( 8, 'birmingham',    'Birmingham City'),
    ( 9, 'preston',       'Preston North End'),
    (10, 'watford',       'Watford'),
    (11, 'bristol_city',  'Bristol City'),
    (12, 'stoke',         'Stoke City'),
    (13, 'millwall',      'Millwall'),
    (14, 'qpr',           'Queens Park Rangers'),
    (15, 'swansea',       'Swansea City'),
    (16, 'cardiff',       'Cardiff City'),
    (17, 'derby',         'Derby County'),
    (18, 'blackburn',     'Blackburn Rovers'),
    (19, 'wba',           'West Bromwich Albion'),
    (20, 'portsmouth',    'Portsmouth'),
    (21, 'charlton',      'Charlton Athletic'),
    (22, 'wrexham',       'Wrexham'),
    (23, 'bolton',        'Bolton Wanderers'),
    (24, 'lincoln',       'Lincoln City')
) as c(rank, slug, name)
on conflict (season_card_id, option_type, option_key) do nothing;
