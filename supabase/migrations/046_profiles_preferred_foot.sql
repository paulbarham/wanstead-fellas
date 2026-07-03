-- Add preferred_foot to profiles. Player-set, nullable, three values:
--   'left', 'right', 'both'
-- Nullable so we can nudge unset players on Next Game (same pattern as
-- preferred_position_primary). Once ~80% of the squad have it set the
-- balancer can use it as a soft constraint (spread lefties across
-- teams so at least one side gets balanced service).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_foot TEXT
  CHECK (preferred_foot IN ('left', 'right', 'both'));
