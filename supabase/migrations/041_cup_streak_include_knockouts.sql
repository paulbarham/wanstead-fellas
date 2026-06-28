-- Cup predictor: extend streak across knockouts.
--
-- Previously streaks were group-stage only (the eligible_matches CTE
-- filtered `WHERE NOT is_knockout`). User intent on 28 Jun: streak should
-- continue across knockouts using "right team to progress" as the rule.
--
-- That's already what the matrix CTE does: it treats `points_awarded > 0`
-- as a hit. In knockouts that includes both the 2-pt 'right team + right
-- method' AND the 1-pt 'right team, wrong method' calls — which is exactly
-- "you got the team that went through correct". Wrong team (0 pts) breaks
-- the streak.
--
-- Fix: drop the NOT is_knockout filter from the eligible-matches CTE.
-- Everything downstream (asc/desc walks, asymmetric tiebreak from 040)
-- works unchanged.

CREATE OR REPLACE VIEW v_cup_leaderboard AS
WITH eligible_matches AS (
  -- Was group_matches with NOT is_knockout. Now: any settled match,
  -- group or knockout. Knockouts contribute via points_awarded > 0
  -- meaning "right team to progress" regardless of method.
  SELECT id, kickoff
  FROM cup_matches
  WHERE actual_outcome IS NOT NULL
),
all_predictors AS (
  SELECT DISTINCT player_id FROM cup_predictions
),
matrix AS (
  SELECT
    ap.player_id,
    em.kickoff,
    em.id AS match_id,
    CASE WHEN COALESCE(cp.points_awarded, 0) > 0 THEN 1 ELSE 0 END AS got
  FROM all_predictors ap
  CROSS JOIN eligible_matches em
  LEFT JOIN cup_predictions cp
    ON cp.player_id = ap.player_id AND cp.match_id = em.id
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
