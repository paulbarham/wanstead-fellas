-- Squad ratings audit — populate results (30 Aug worksheet)
--
-- Applies the hand-filled ratings from primer 27 (squad-ratings audit).
-- Two flavours of change:
--
--   1. NEW RATINGS — 18 previously flat-7 profiles get their six card_*
--      stats set, plus overall_rating from the audit worksheet, plus
--      preferred_position_primary where the audit set it (5 players who
--      previously had no position: Marshall Winter, Gavin Fulcher, Bodhi
--      Quinlan-May, James Lightbody, Daniel K).
--
--      Critical per CLAUDE.md's known data quirks: setting overall_rating
--      alone leaves the balancer seeing flat 7 attrs because effectiveAttrs
--      only reads the card path when card_pace is non-null. Setting the six
--      card_* stats is what actually flips the switch.
--
--      Neil Perry (keeper) — per admin call, the same 6 values are also
--      applied to gk_pace / gk_reflexes / gk_handling / gk_distribution /
--      gk_positioning / gk_physicality (positional mapping — card PAC → gk_pace,
--      card SHO → gk_reflexes, etc). Keeps his GK-specific rating engine
--      from seeing NULLs.
--
--      Emmanuel (no surname on profile) deliberately skipped for now.
--
--   2. OVERALL REVISIONS — 4 already-rated profiles get an overall_rating
--      adjustment based on the audit's reasoning (POSSIBLY UNDER/OVER-RATED).
--      Note: not touching card_* for these — the balancer will keep reading
--      whatever card_* they already have (mostly NULL for the older squad
--      members reviewed here). Overall_rating still flows through to the
--      admin RTG chip and star cap logic per mig 084.
--
-- All named via lower(name || ' ' || coalesce(surname,'')) matches which
-- were pre-checked to resolve 1:1 for every row in this migration.

-- ─────────────────────────────────────────────────────────────────────
-- Helper: since 22 UPDATEs get repetitive, use a single VALUES CTE.
-- The CTE holds every new-rating row; a single UPDATE ... FROM applies them.
-- ─────────────────────────────────────────────────────────────────────

with audit as (
  select * from (values
    -- name_lower, pos_new (null = no change),
    -- pac, sho, pas, dri, def, phy, ovr
    ('max farley',        null::text, 9, 8, 8, 9, 3, 3, 8),
    ('marshall winter',   'ATT',      8, 8, 7, 7, 4, 4, 7),
    ('father emmanuel',   null::text, 7, 7, 7, 5, 6, 7, 7),
    ('ollie hoad',        null::text, 6, 6, 7, 6, 7, 7, 7),
    ('gavin fulcher',     'MID',      7, 7, 6, 6, 8, 9, 7),
    ('sam yeats',         null::text, 8, 8, 7, 6, 7, 8, 8),
    ('matthew sharpe',    null::text, 6, 5, 5, 5, 5, 7, 5),
    ('fraser day',        null::text, 7, 8, 9, 7, 6, 7, 8),
    ('rob hall',          null::text, 6, 5, 5, 5, 6, 7, 6),
    ('chris hughes',      null::text, 6, 6, 6, 6, 6, 6, 6),
    ('kevin sweeney',     null::text, 6, 6, 6, 6, 7, 7, 6),
    ('ed adamson',        null::text, 7, 7, 6, 6, 6, 6, 6),
    ('bodhi quinlan-may', 'MID',      7, 7, 8, 6, 6, 6, 7),
    ('neil perry',        null::text, 6, 7, 6, 6, 6, 6, 6),
    ('phil mowat',        null::text, 6, 6, 6, 6, 7, 7, 6),
    ('stuart jack',       null::text, 7, 7, 7, 7, 7, 7, 7),
    ('james lightbody',   'MID',      8, 7, 7, 7, 7, 7, 7),
    ('daniel k',          'MID',      8, 6, 5, 5, 6, 7, 5)
  ) as t(name_lower, pos_new, pac, sho, pas, dri, def_, phy, ovr)
)
update profiles p
set
  card_pace          = a.pac,
  card_shooting      = a.sho,
  card_passing       = a.pas,
  card_dribbling     = a.dri,
  card_defence       = a.def_,
  card_physicality   = a.phy,
  overall_rating     = a.ovr,
  preferred_position_primary = coalesce(a.pos_new::text, p.preferred_position_primary)
from audit a
where lower(trim(p.name || ' ' || coalesce(p.surname,''))) = a.name_lower;

-- ─────────────────────────────────────────────────────────────────────
-- Neil Perry — mirror the six card values into the gk_* columns.
-- Positional mapping (card_pace → gk_pace, card_shooting → gk_reflexes,
-- card_passing → gk_handling, card_dribbling → gk_distribution,
-- card_defence → gk_positioning, card_physicality → gk_physicality).
-- Keeps his GK-specific rating engine from seeing NULLs. Admin can
-- tune individually later if needed.
-- ─────────────────────────────────────────────────────────────────────

update profiles set
  gk_pace         = 6,
  gk_reflexes     = 7,
  gk_handling     = 6,
  gk_distribution = 6,
  gk_positioning  = 6,
  gk_physicality  = 6
where lower(trim(name || ' ' || coalesce(surname,''))) = 'neil perry';

-- ─────────────────────────────────────────────────────────────────────
-- OVERALL REVISIONS — 4 already-rated profiles.
-- (Callum Finch, Michael Farley, Pete Healey, Gary Edwards, Rory Wilson
-- were reviewed and left unchanged — no UPDATE needed for those.)
-- ─────────────────────────────────────────────────────────────────────

update profiles set overall_rating = 8
where lower(trim(name || ' ' || coalesce(surname,''))) = 'paul finch';

update profiles set overall_rating = 7
where lower(trim(name || ' ' || coalesce(surname,''))) = 'mark pearson';

update profiles set overall_rating = 7
where lower(trim(name || ' ' || coalesce(surname,''))) = 'peter may';

update profiles set overall_rating = 8
where lower(trim(name || ' ' || coalesce(surname,''))) = 'noah higgins';

-- ─────────────────────────────────────────────────────────────────────
-- Log the whole exercise as a single decision row for the audit trail.
-- ─────────────────────────────────────────────────────────────────────

insert into decisions (category, summary, details, effective_from, decided_by)
values (
  'roster',
  'Squad ratings audit populated (mig 088)',
  E'Populated 18 previously default-rated profiles with all six card_* stats + overall_rating from the 30 Aug audit worksheet (primer 27). ' ||
  E'Also set preferred_position_primary for 5 players who had none (Marshall Winter → ATT, Gavin Fulcher → MID, Bodhi Quinlan-May → MID, James Lightbody → MID, Daniel K → MID). ' ||
  E'Neil Perry (GK) received matching gk_* values in positional mapping alongside his card_*. ' ||
  E'Emmanuel (surname missing) deliberately skipped for now. ' ||
  E'Overall revisions: Paul Finch 7→8, Mark Pearson 6→7, Peter May 8→7 (overrated), Noah Higgins 9→8 (overrated). ' ||
  E'Left unchanged after review: Callum Finch, Michael Farley, Pete Healey, Gary Edwards, Rory Wilson.',
  current_date,
  (select id from profiles where lower(trim(name || ' ' || coalesce(surname,''))) = 'paul barham' limit 1)
);
