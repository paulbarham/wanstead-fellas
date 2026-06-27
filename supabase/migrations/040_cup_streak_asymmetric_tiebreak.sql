-- Cup predictor: asymmetric tiebreak for simultaneous-kickoff streaks.
--
-- Migration 039 used `got DESC` (correct picks first) for BOTH the asc walk
-- (best_streak) and the desc walk (current_streak). That made current
-- consistent with intuition — your live streak extends through a tied-kickoff
-- correct pick before being broken by a sibling wrong pick — but BROKE
-- best_streak by orphaning the correct sibling into an earlier reset group.
--
-- Real example: Paul Barham had Paraguay ✓ + Turkey ✕ at 26 Jun 03:00.
-- Walking ASC with got DESC put Paraguay before Turkey, so Paraguay landed
-- in the PREVIOUS reset group, then Turkey reset the counter, then Norway
-- onwards counted as a fresh run of 8. Result: best=8 / current=9, which
-- is impossible (best must be ≥ current).
--
-- Fix: use opposite tiebreaks. Asc walk uses `got ASC` (wrong picks process
-- first within a tied kickoff, so they break the previous streak before
-- the correct sibling starts a new one — Paraguay then belongs to the same
-- forward group as Norway/Senegal/etc). Desc walk keeps `got DESC` (correct
-- picks extend the streak first when walking backwards, before hitting the
-- wrong sibling). Both walks now group Paraguay with the latest streak and
-- the two metrics agree: best=current=9.

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
    gm.id AS match_id,
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
      OVER (PARTITION BY player_id ORDER BY kickoff ASC, got ASC, match_id) AS reset_grp
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
  SELECT
    player_id,
    COUNT(*)::int AS current_streak
  FROM (
    SELECT
      player_id,
      got,
      SUM(CASE WHEN got = 0 THEN 1 ELSE 0 END)
        OVER (PARTITION BY player_id ORDER BY kickoff DESC, got DESC, match_id
              ROWS UNBOUNDED PRECEDING) AS zero_count
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
