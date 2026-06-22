-- Cup leaderboard view: one row per predictor with their aggregated points
-- and correct count. Replaces the client-side aggregation that was silently
-- capping at Supabase's default 1000-row limit (we now have >1100 predictions).
CREATE OR REPLACE VIEW v_cup_leaderboard AS
SELECT
  p.id      AS player_id,
  p.name,
  p.surname,
  COALESCE(SUM(cp.points_awarded), 0)::int                         AS points,
  COUNT(*) FILTER (WHERE cp.points_awarded > 0)::int               AS correct,
  COUNT(*) FILTER (WHERE cp.points_awarded IS NOT NULL)::int       AS settled_picks
FROM profiles p
JOIN cup_predictions cp ON cp.player_id = p.id
GROUP BY p.id, p.name, p.surname
HAVING COUNT(*) > 0;

GRANT SELECT ON v_cup_leaderboard TO authenticated;
