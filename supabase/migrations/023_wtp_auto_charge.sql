-- Auto-charge WTP fees on confirmed signup.
--
-- Every time a wtp/wtp_priority player's availability flips to 'confirmed',
-- insert a £5 wtp_games row (unpaid). If they later drop out before the
-- match, the unpaid row is reaped — but a paid row is never touched, so
-- cash already collected stays recorded even if a slot later vacates.
--
-- Subscribed players are skipped entirely (their monthly sub covers it).

CREATE OR REPLACE FUNCTION auto_charge_wtp_game()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  player_tier text;
  ref_player_id uuid;
  ref_match_date date;
  WTP_FEE constant numeric := 5;
BEGIN
  ref_player_id := COALESCE(NEW.player_id, OLD.player_id);
  ref_match_date := COALESCE(NEW.match_date, OLD.match_date);

  SELECT player_type INTO player_tier
  FROM profiles WHERE id = ref_player_id;

  -- Subscribed players never get a per-game fee.
  IF player_tier IS NULL OR player_tier NOT IN ('wtp', 'wtp_priority') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ADD: signup confirmed (INSERT confirmed, or UPDATE into confirmed)
  IF (TG_OP = 'INSERT' AND NEW.status = 'confirmed')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed') THEN
    INSERT INTO wtp_games (player_id, match_date, amount, paid)
    VALUES (ref_player_id, ref_match_date, WTP_FEE, false)
    ON CONFLICT (player_id, match_date) DO NOTHING;
  END IF;

  -- REMOVE (unpaid only): was confirmed, now isn't, or row deleted entirely
  IF (TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status IS DISTINCT FROM 'confirmed')
     OR (TG_OP = 'DELETE' AND OLD.status = 'confirmed') THEN
    DELETE FROM wtp_games
    WHERE player_id = ref_player_id
      AND match_date = ref_match_date
      AND paid = false;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS availability_auto_charge_wtp ON public.availability;
CREATE TRIGGER availability_auto_charge_wtp
  AFTER INSERT OR UPDATE OR DELETE ON public.availability
  FOR EACH ROW EXECUTE FUNCTION auto_charge_wtp_game();
