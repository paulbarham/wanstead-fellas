-- Cup predictor: deterministic tiebreak for simultaneous kickoffs.
--
-- Migrations 037 + 038 ordered the streak walks by kickoff alone. When two
-- matches share an exact kickoff time, the order between them is left
-- non-deterministic — and Postgres happened to surface wrong picks (got=0)
-- before correct ones (got=1) in some pairs, undercounting the streak.
--
-- Real example surfaced 28 Jun: Paul Barham had Paraguay-Australia ✓ and
-- Turkey-USA ✕ both kicking off at 26 Jun 03:00 UK. The reverse walk for
-- current_streak landed on Turkey first, broke the streak at 8, and stopped
-- before reaching Paraguay (which would have made it 9, matching reality).
--
-- Fix: tiebreak within a kickoff by `got DESC` — correct picks come first
-- in BOTH the asc walk (best_streak) and the desc walk (current_streak).
-- Semantically: when two matches finish at the same moment, the streak
-- treats every correct one as continuing the run, and only breaks at the
-- wrong one. Matches how a human would count it watching live.

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
      OVER (PARTITION BY player_id ORDER BY kickoff ASC, got DESC, match_id) AS reset_grp
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
