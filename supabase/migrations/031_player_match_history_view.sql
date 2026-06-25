-- Per-player match history: first/last appearance + count, derived from
-- the canonical team_players → teams → matches join.
--
-- Surfaces two needs:
--   1. Debutant detection in the AdminTeamBuilder WhatsApp export (a player
--      is a debutant for an upcoming match if their first_match_date is on
--      or after that match's date).
--   2. Cheap "matches played" lookups elsewhere (Stats, profile cards).
--
-- Replaces a nested PostgREST join that was returning empty results in
-- production, leaving the export to treat every player as a debutant.
CREATE OR REPLACE VIEW v_player_match_history AS
SELECT
  tp.player_id,
  MIN(m.match_date) AS first_match_date,
  MAX(m.match_date) AS last_match_date,
  COUNT(DISTINCT m.id)::int AS matches_played
FROM team_players tp
JOIN teams t   ON t.id = tp.team_id
JOIN matches m ON m.id = t.match_id
GROUP BY tp.player_id;

GRANT SELECT ON v_player_match_history TO authenticated;
