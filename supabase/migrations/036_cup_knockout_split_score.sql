-- Cup predictor: split-score for knockouts.
--
-- Previously: 1 point if pick exactly matched actual_outcome, else 0.
-- For knockouts that meant predicting the right team via the wrong route
-- (e.g. you said France in 90 min, they won on pens) was scored identically
-- to picking the losing team — a brutally binary outcome that didn't reward
-- the harder call of "who progresses".
--
-- Now:
--   * Group stage: unchanged. 1 point if pick == actual_outcome, else 0.
--   * Knockouts: 0 if wrong team, 1 if right team / wrong route,
--                2 if right team AND right route.
--
-- v_cup_leaderboard (migration 029) already SUMs points_awarded and counts
-- correct as `points_awarded > 0`, so it picks up the new shape with no
-- change — totals just naturally rise as knockout 2-pointers land.
--
-- Re-settles every existing prediction tied to a settled knockout match so
-- the historical record is consistent with the new rule from day one.
-- (At time of writing: no knockouts settled yet — tournament still in groups
-- — but the backfill is idempotent and future-proofs against any pre-trigger
-- writes.)

CREATE OR REPLACE FUNCTION settle_cup_predictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF new.actual_outcome IS NOT NULL
     AND (old.actual_outcome IS DISTINCT FROM new.actual_outcome) THEN
    UPDATE cup_predictions
       SET points_awarded = CASE
         WHEN NOT new.is_knockout THEN
           -- Group stage: binary
           CASE WHEN pick = new.actual_outcome THEN 1 ELSE 0 END
         ELSE
           -- Knockouts: 0 / 1 / 2 split. Pick + actual share an underscore
           -- format ('team1_90' / 'team2_pen' etc), so split_part(_, '_', 1)
           -- isolates the side prefix.
           CASE
             WHEN pick = new.actual_outcome THEN 2
             WHEN split_part(pick, '_', 1) = split_part(new.actual_outcome, '_', 1) THEN 1
             ELSE 0
           END
       END
     WHERE match_id = new.id;
  ELSIF new.actual_outcome IS NULL AND old.actual_outcome IS NOT NULL THEN
    UPDATE cup_predictions SET points_awarded = NULL WHERE match_id = new.id;
  END IF;
  RETURN new;
END;
$$;

-- Backfill: re-settle every existing knockout prediction under the new rules.
-- No-op for groups; idempotent for knockouts.
UPDATE cup_predictions cp
SET points_awarded = CASE
  WHEN cp.pick = cm.actual_outcome THEN 2
  WHEN split_part(cp.pick, '_', 1) = split_part(cm.actual_outcome, '_', 1) THEN 1
  ELSE 0
END
FROM cup_matches cm
WHERE cp.match_id = cm.id
  AND cm.is_knockout
  AND cm.actual_outcome IS NOT NULL;
