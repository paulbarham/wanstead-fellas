-- Block signups for players who owe money past the grace period.
--
-- Rules:
--   Invoice goes out the day after the last Thursday of each month.
--   2-week grace period.
--   After grace expires (= last Thursday + 16 days), any unpaid amounts
--   from that month or earlier block the player from confirming signups.
--   Existing confirmed signups stay. Admin overrides bypass the block.

CREATE OR REPLACE FUNCTION last_thursday_of_month(d date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  WITH eom AS (SELECT (date_trunc('month', d::timestamp) + INTERVAL '1 month - 1 day')::date AS dt)
  SELECT (dt - ((EXTRACT(DOW FROM dt)::int - 4 + 7) % 7))::date FROM eom;
$$;

CREATE OR REPLACE FUNCTION is_player_blocked(p_player_id uuid, p_as_of date DEFAULT CURRENT_DATE)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hit boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM (
      SELECT match_date FROM fines
        WHERE player_id = p_player_id AND paid = false AND match_date IS NOT NULL
      UNION ALL
      SELECT match_date FROM wtp_games
        WHERE player_id = p_player_id AND paid = false
    ) AS owed
    WHERE p_as_of > (last_thursday_of_month(match_date) + INTERVAL '16 days')::date
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
  WHERE CURRENT_DATE > (last_thursday_of_month(match_date) + INTERVAL '16 days')::date
)
SELECT player_id, SUM(amount)::numeric AS past_grace_owed
FROM past_grace
GROUP BY player_id
HAVING SUM(amount) > 0;

GRANT SELECT ON v_blocked_players TO authenticated;

CREATE OR REPLACE FUNCTION caller_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE auth_user_id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION enforce_unpaid_signup_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF caller_is_admin() THEN
    RETURN NEW;
  END IF;
  IF is_player_blocked(NEW.player_id) THEN
    RAISE EXCEPTION 'PLAYER_BLOCKED_UNPAID'
      USING ERRCODE = 'P0001',
            HINT    = 'Player has unpaid amounts past the 2-week grace period.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS availability_block_unpaid ON public.availability;
CREATE TRIGGER availability_block_unpaid
  BEFORE INSERT OR UPDATE OF status ON public.availability
  FOR EACH ROW EXECUTE FUNCTION enforce_unpaid_signup_block();
