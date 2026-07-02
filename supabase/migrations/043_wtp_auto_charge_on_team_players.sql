-- Move WTP auto-charge from availability → team_players.
--
-- Backstory (2 Jul 2026): Father Emmanuel confirmed a signup for tonight's
-- 7v7 draft, hitting the availability confirmed-status branch and the
-- auto_charge_wtp_game trigger from migration 023. That created a £5
-- wtp_games row. But he ended up on the reserve list — 29 confirmed, 28
-- drafted — so he isn't actually playing (unless someone drops), and the
-- £5 showed up on his finances tab as a phantom charge.
--
-- New rule: the £5 only fires when a player is actually in a published
-- team (i.e. a team_players row exists), not when they merely confirm
-- signup. That way reserves never see a charge unless they get subbed in.
--
-- Symmetry: on team_players DELETE (re-publish with different lineup, or
-- late drop-out reshuffle), we reap the unpaid wtp_games row too — same
-- protection the availability version had.
--
-- What DOESN'T change:
--   * The AdminTeamBuilder publish flow already upserts wtp_games rows on
--     publish (belt+braces alongside this trigger). Leaving it in place —
--     the ON CONFLICT DO NOTHING makes it idempotent with the trigger.
--   * Existing wtp_games rows are untouched. Emmanuel's £5 for 2 Jul stays
--     in place; admin will void it after tonight if he doesn't actually
--     play (i.e. isn't promoted from the reserve list).

-- Drop the old trigger from availability
DROP TRIGGER IF EXISTS availability_auto_charge_wtp ON public.availability;

-- Rewrite the function to derive match_date via team_id → matches
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

  -- Look up the match_date via the team's match. Bail if the join fails
  -- (shouldn't happen — team_players has an FK on team_id).
  IF TG_OP = 'DELETE' THEN
    SELECT m.match_date INTO ref_match_date
    FROM teams t JOIN matches m ON m.id = t.match_id
    WHERE t.id = OLD.team_id;
  ELSE
    SELECT m.match_date INTO ref_match_date
    FROM teams t JOIN matches m ON m.id = t.match_id
    WHERE t.id = NEW.team_id;
  END IF;
  IF ref_match_date IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT player_type INTO player_tier
  FROM profiles WHERE id = ref_player_id;

  IF player_tier IS NULL OR player_tier NOT IN ('wtp', 'wtp_priority') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO wtp_games (player_id, match_date, amount, paid)
    VALUES (ref_player_id, ref_match_date, WTP_FEE, false)
    ON CONFLICT (player_id, match_date) DO NOTHING;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM wtp_games
    WHERE player_id = ref_player_id
      AND match_date = ref_match_date
      AND paid = false;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS team_players_auto_charge_wtp ON public.team_players;
CREATE TRIGGER team_players_auto_charge_wtp
  AFTER INSERT OR DELETE ON public.team_players
  FOR EACH ROW EXECUTE FUNCTION auto_charge_wtp_game();
