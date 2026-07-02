-- WTP auto-charge fires on match completion, not on signup or team publish.
--
-- Migration 043 moved the trigger from availability → team_players so the
-- charge only fired on publish (fixed Father Emmanuel's phantom £5 on
-- 2 Jul 2026, plus stopped charges landing on players who confirm but
-- end up on the reserve list).
--
-- Same-day admin feedback (2 Jul 2026): four other WTPs (Charlie NP,
-- Daryll Petrie, Ed Adamson, Rob Hall) still had £5 wtp_games rows for
-- tonight's game — created by the OLD availability trigger BEFORE we
-- switched. They were showing on people's finances tabs even though the
-- match hasn't been played yet. User wanted consistency: no WTP charge
-- should show for a game until AFTER it's been played.
--
-- New rule: the trigger fires when matches.status flips to 'completed'.
-- At that point, insert a wtp_games row for every WTP-tier player still
-- in team_players for that match. Idempotent (ON CONFLICT DO NOTHING),
-- so re-marking a match completed doesn't duplicate.
--
-- Reversal safety: if an admin flips status back to something other
-- than 'completed' (e.g. re-opens the result to edit), any UNPAID rows
-- for that match get reaped. Paid rows are never touched.

DROP TRIGGER IF EXISTS team_players_auto_charge_wtp ON public.team_players;

CREATE OR REPLACE FUNCTION auto_charge_wtp_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  WTP_FEE constant numeric := 5;
BEGIN
  -- Match just completed → create charges for every WTP in the roster
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO wtp_games (player_id, match_date, amount, paid)
    SELECT tp.player_id, NEW.match_date, WTP_FEE, false
    FROM team_players tp
    JOIN teams t   ON t.id = tp.team_id
    JOIN profiles p ON p.id = tp.player_id
    WHERE t.match_id = NEW.id
      AND COALESCE(p.player_type, 'wtp') IN ('wtp', 'wtp_priority')
    ON CONFLICT (player_id, match_date) DO NOTHING;
  END IF;

  -- Match un-completed (result reopened for editing) → reap unpaid rows
  IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    DELETE FROM wtp_games
    WHERE match_date = OLD.match_date
      AND paid = false
      AND player_id IN (
        SELECT tp.player_id FROM team_players tp
        JOIN teams t ON t.id = tp.team_id
        WHERE t.match_id = OLD.id
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_auto_charge_wtp ON public.matches;
CREATE TRIGGER matches_auto_charge_wtp
  AFTER UPDATE OF status ON public.matches
  FOR EACH ROW EXECUTE FUNCTION auto_charge_wtp_on_completion();

-- Clean slate for tonight (2 Jul): wipe any unpaid pre-match rows that
-- were created before this migration by the old availability/team_players
-- triggers or by the AdminTeamBuilder publish upsert. Charges will be
-- created fresh by the new trigger when tonight's match is marked
-- 'completed'. Paid rows are left alone.
DELETE FROM wtp_games
WHERE match_date = '2026-07-02'
  AND paid = false;
