-- Cup predictor: best-streak column on v_cup_leaderboard.
--
-- Tracks each player's longest run of consecutive correct picks across
-- settled GROUP-STAGE matches in kickoff order. A correct pick is
-- points_awarded > 0 (group stage maxes at 1 anyway). The streak is broken
-- by either a wrong pick OR a missed pick (no row in cup_predictions for
-- that match) — same convention as the existing hit-rate display where
-- "missed counts as wrong".
--
-- Knockouts are excluded from the streak entirely: knockout games are
-- spread out and partial-credit (1/2 pts), so a "streak" there is a
-- different concept and would muddy the metric.
--
-- Implementation: classic gaps-and-islands. For each (player, group match)
-- pair we compute got = 1 if correct, 0 otherwise (including missing).
-- Then a running sum of zeros gives each contiguous block of ones its
-- own group id; COUNT() within each group + MAX() per player yields the
-- best streak.

CREATE OR REPLACE VIEW v_cup_leaderboard AS
WITH group_matches AS (
  SELECT id, kickoff
  FROM cup_matches
  WHERE NOT is_knockout
    AND actual_outcome IS NOT NULL
),
all_predictors AS (
  SELECT DISTINCT player_id FROM cup_predictions
),
matrix AS (
  SELECT
    ap.player_id,
    gm.kickoff,
    CASE WHEN COALESCE(cp.points_awarded, 0) > 0 THEN 1 ELSE 0 END AS got
  FROM all_predictors ap
  CROSS JOIN group_matches gm
  LEFT JOIN cup_predictions cp
    ON cp.player_id = ap.player_id AND cp.match_id = gm.id
),
flagged AS (
  SELECT
    player_id,
    got,
    SUM(CASE WHEN got = 0 THEN 1 ELSE 0 END)
      OVER (PARTITION BY player_id ORDER BY kickoff) AS reset_grp
  FROM matrix
),
runs AS (
  SELECT player_id, reset_grp, COUNT(*) AS run_length
  FROM flagged
  WHERE got = 1
  GROUP BY player_id, reset_grp
),
streaks AS (
  SELECT
    ap.player_id,
    COALESCE(MAX(r.run_length), 0)::int AS best_streak
  FROM all_predictors ap
  LEFT JOIN runs r ON r.player_id = ap.player_id
  GROUP BY ap.player_id
)
SELECT
  p.id       AS player_id,
  p.name,
  p.surname,
  COALESCE(SUM(cp.points_awarded), 0)::int                   AS points,
  COUNT(*) FILTER (WHERE cp.points_awarded > 0)::int         AS correct,
  COUNT(*) FILTER (WHERE cp.points_awarded IS NOT NULL)::int AS settled_picks,
  COALESCE(s.best_streak, 0)                                 AS best_streak
FROM profiles p
JOIN cup_predictions cp ON cp.player_id = p.id
LEFT JOIN streaks s ON s.player_id = p.id
GROUP BY p.id, p.name, p.surname, s.best_streak
HAVING COUNT(*) > 0;

GRANT SELECT ON v_cup_leaderboard TO authenticated;
