-- Belt & braces against football-data.org drifting on late-updated fields.
--
-- Backstory (2 Jul 2026): Belgium 3-2 Senegal in the R32. Tielemans buried
-- a penalty at 124:44 to win it — the FD API's `duration` flag was still
-- 'REGULAR' when cron pulled the result, our sync stored `team1_90`, and
-- the API later corrected to `EXTRA_TIME` but we never re-checked. Points
-- scored wrong for 7 players until an admin flagged it manually.
--
-- Root cause: cup-results-sync.index.ts had a one-shot guard
-- (`ours.actual_outcome != null → continue`) that stopped it from ever
-- reconciling a settled match with fresher API data.
--
-- Fix:
--   * Add `outcome_locked_by_admin boolean` — set to true whenever an admin
--     manually overrides the outcome (either via the CupAdminPage or ad-hoc
--     SQL). Locked matches are never touched by the sync.
--   * Belt: the sync re-checks any match settled less than 48h ago (long
--     enough for FD to typically publish corrections, short enough that a
--     lingering drift shows up as a bug not a feature).
--   * Braces: the manual admin lock — unlimited-window override.
--
-- The 48h window is enforced in the edge function (deployed alongside).
-- This migration just adds the column + backfills Belgium-Senegal as locked
-- since it was already manually corrected before this shipped.

ALTER TABLE cup_matches
  ADD COLUMN IF NOT EXISTS outcome_locked_by_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN cup_matches.outcome_locked_by_admin IS
  'When true, cup-results-sync will never overwrite score1/score2/actual_outcome. Set by CupAdminPage (or ad-hoc SQL) when an admin manually corrects an outcome. Prevents the FD auto-sync from silently reverting a hand-fix.';

-- Lock Belgium-Senegal (already hand-corrected 2 Jul from team1_90 → team1_et)
-- so a future FD sync can't ever revert.
UPDATE cup_matches
SET outcome_locked_by_admin = true
WHERE team1 = 'Belgium' AND team2 = 'Senegal';
