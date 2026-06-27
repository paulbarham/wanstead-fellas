-- Cup predictor: current_streak column on v_cup_leaderboard.
--
-- Extends migration 037 (best_streak) with the LIVE running streak — the
-- number of consecutive correct group-stage picks ending at the MOST
-- RECENT settled match.
--
-- Distinction:
--   * best_streak    = personal best across the whole group stage so far
--   * current_streak = how many in a row you're on RIGHT NOW (0 if your
--                      latest settled pick was wrong or missed)
--
-- UI uses current_streak in the main leaderboard's STRK column (with 🔥 if
-- alive) so the table reads "who's hot tonight", and surfaces best_streak
-- in a separate Hall-of-Fame panel for season-long bragging rights.
--
-- Algorithm: same matrix CTE as best_streak. For each player, walk picks
-- in REVERSE kickoff order, count rows seen until the first non-correct
-- pick. That count is the current streak (zero if the most recent pick
-- itself was wrong/missing).

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
best AS (
  SELECT
    ap.player_id,
    COALESCE(MAX(r.run_length), 0)::int AS best_streak
  FROM all_predictors ap
  LEFT JOIN runs r ON r.player_id = ap.player_id
  GROUP BY ap.player_id
),
current AS (
  -- Walk in REVERSE kickoff order; count rows seen before the first non-
  -- correct pick. Implemented by computing zero_count over the desc-ordered
  -- window and counting rows where zero_count is still 0.
  SELECT
    player_id,
    COUNT(*)::int AS current_streak
  FROM (
    SELECT
      player_id,
      got,
      SUM(CASE WHEN got = 0 THEN 1 ELSE 0 END)
        OVER (PARTITION BY player_id ORDER BY kickoff DESC ROWS UNBOUNDED PRECEDING) AS zero_count
    FROM matrix
  ) reverse_walk
  WHERE zero_count = 0
  GROUP BY player_id
)
SELECT
  p.id       AS player_id,
  p.name,
  p.surname,
  COALESCE(SUM(cp.points_awarded), 0)::int                   AS points,
  COUNT(*) FILTER (WHERE cp.points_awarded > 0)::int         AS correct,
  COUNT(*) FILTER (WHERE cp.points_awarded IS NOT NULL)::int AS settled_picks,
  COALESCE(b.best_streak, 0)                                 AS best_streak,
  COALESCE(c.current_streak, 0)                              AS current_streak
FROM profiles p
JOIN cup_predictions cp ON cp.player_id = p.id
LEFT JOIN best b    ON b.player_id = p.id
LEFT JOIN current c ON c.player_id = p.id
GROUP BY p.id, p.name, p.surname, b.best_streak, c.current_streak
HAVING COUNT(*) > 0;

GRANT SELECT ON v_cup_leaderboard TO authenticated;
