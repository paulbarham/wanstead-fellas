-- Adoption tracker for preferred_position_primary. Lists every player who's
-- played in the trailing 8 weeks (plus all subscribers, who may have skipped
-- but are still considered "active") with their position state and last
-- appearance. Admin uses this to chase the unset list.
CREATE OR REPLACE VIEW v_position_adoption AS
WITH recent AS (
  SELECT player_id,
         COUNT(*) recent_apps,
         MAX(match_date) last_app
  FROM availability
  WHERE status = 'confirmed'
    AND match_date >= CURRENT_DATE - INTERVAL '56 days'
  GROUP BY player_id
)
SELECT
  p.id, p.name, p.surname, p.player_type,
  p.preferred_position_primary,
  p.preferred_position_secondary,
  COALESCE(r.recent_apps, 0) AS recent_apps,
  r.last_app,
  CASE
    WHEN p.preferred_position_primary IS NOT NULL THEN 'set'
    ELSE 'unset'
  END AS status
FROM profiles p
LEFT JOIN recent r ON r.player_id = p.id
WHERE r.player_id IS NOT NULL OR p.player_type = 'subscribed'
ORDER BY (CASE WHEN p.preferred_position_primary IS NULL THEN 0 ELSE 1 END),
         recent_apps DESC, p.surname;

GRANT SELECT ON v_position_adoption TO authenticated;
