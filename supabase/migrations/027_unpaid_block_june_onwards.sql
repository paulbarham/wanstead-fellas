-- Relax the unpaid-signup block: only charges from BLOCK_START onwards count
-- toward the block. May & earlier amounts still appear in finances (admin can
-- chase them) but don't gate new sign-ups. Set to 2026-06-01 — first month
-- with the auto-charge + visibility in place.

CREATE OR REPLACE FUNCTION is_player_blocked(p_player_id uuid, p_as_of date DEFAULT CURRENT_DATE)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hit boolean;
  block_start constant date := DATE '2026-06-01';
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM (
      SELECT match_date FROM fines
        WHERE player_id = p_player_id AND paid = false AND match_date IS NOT NULL
      UNION ALL
      SELECT match_date FROM wtp_games
        WHERE player_id = p_player_id AND paid = false
    ) AS owed
    WHERE match_date >= block_start
      AND p_as_of > (last_thursday_of_month(match_date) + INTERVAL '16 days')::date
  )
  INTO hit;
  RETURN hit;
END;
$$;

CREATE OR REPLACE VIEW v_blocked_players AS
WITH owed AS (
  SELECT player_id, amount, match_date FROM fines
    WHERE paid = false AND match_date IS NOT NULL
  UNION ALL
  SELECT player_id, amount, match_date FROM wtp_games
    WHERE paid = false
),
past_grace AS (
  SELECT player_id, amount FROM owed
  WHERE match_date >= DATE '2026-06-01'
    AND CURRENT_DATE > (last_thursday_of_month(match_date) + INTERVAL '16 days')::date
)
SELECT player_id, SUM(amount)::numeric AS past_grace_owed
FROM past_grace
GROUP BY player_id
HAVING SUM(amount) > 0;

GRANT SELECT ON v_blocked_players TO authenticated;
