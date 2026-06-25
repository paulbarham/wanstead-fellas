-- Per-player debut-date override on profiles.
--
-- Background: v_player_match_history (migration 031) derives first_match_date
-- from team_players → teams → matches, which only includes app-era games.
-- That works for anyone whose first appearance is recorded in the app, but
-- misclassifies veterans who've been playing pre-app and have no historical
-- team_players rows — e.g. Charlie Nicholls-Petrie, who's been on the books
-- since May 2026 but only got his first published team slot on 25 Jun.
--
-- Adds a nullable debut_at column to profiles:
--   - NULL  → fall back to actual recorded first match (current behaviour)
--   - date  → that's their effective first match; takes precedence
--
-- The view is recreated to LEFT JOIN from profiles so players with a debut_at
-- override but no team_players row still appear (e.g. brand-new profile for a
-- known veteran who hasn't been picked yet).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS debut_at date;

COMMENT ON COLUMN profiles.debut_at IS
  'Override for "first time playing for the club". NULL = derive from team_players history; set = use this date verbatim. Use for pre-app veterans whose history was never imported.';

CREATE OR REPLACE VIEW v_player_match_history AS
SELECT
  p.id AS player_id,
  COALESCE(p.debut_at, MIN(m.match_date)) AS first_match_date,
  MAX(m.match_date) AS last_match_date,
  COUNT(DISTINCT m.id)::int AS matches_played
FROM profiles p
LEFT JOIN team_players tp ON tp.player_id = p.id
LEFT JOIN teams t         ON t.id = tp.team_id
LEFT JOIN matches m       ON m.id = t.match_id
GROUP BY p.id, p.debut_at
HAVING COUNT(DISTINCT m.id) > 0 OR p.debut_at IS NOT NULL;

GRANT SELECT ON v_player_match_history TO authenticated;

-- Backfill: Charlie Nicholls-Petrie has played for the club for years pre-app
-- but the team_players table only knows about tonight (25 Jun 2026), so the
-- export would flag him as a debutant. Mark him as a known veteran using a
-- 'pre-app' sentinel date (1 Jan 2024 — well before any app data).
UPDATE profiles
SET debut_at = '2024-01-01'
WHERE LOWER(TRIM(name || ' ' || COALESCE(surname,''))) = 'charlie nicholls-petrie'
  AND debut_at IS NULL;
