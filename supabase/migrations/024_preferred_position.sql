-- Player-set preferred position — primary + optional secondary. Lets players
-- own their identity on the card and gives the balancer a positional
-- constraint to work with. Four positions only to keep it Sunday-league
-- simple. Backfilled from the existing admin-set `position` column so the
-- 26 players who already have one don't see "unset".

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_position_primary text
    CHECK (preferred_position_primary IS NULL OR preferred_position_primary IN ('GK','DEF','MID','ATT')),
  ADD COLUMN IF NOT EXISTS preferred_position_secondary text
    CHECK (preferred_position_secondary IS NULL OR preferred_position_secondary IN ('GK','DEF','MID','ATT'));

-- Secondary can't equal primary.
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_position_distinct;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_preferred_position_distinct
    CHECK (preferred_position_secondary IS NULL OR preferred_position_secondary <> preferred_position_primary);

-- Backfill from existing admin-set `position`.
UPDATE profiles SET preferred_position_primary = CASE
  WHEN position = 'GK' THEN 'GK'
  WHEN position = 'DF' THEN 'DEF'
  WHEN position IN ('MF','MD') THEN 'MID'
  WHEN position = 'ST' THEN 'ATT'
  ELSE NULL
END
WHERE preferred_position_primary IS NULL AND position IS NOT NULL;
