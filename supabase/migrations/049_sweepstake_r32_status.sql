-- WC2026 introduced R32 (48 teams → 32 knockouts). The sweepstake status
-- enum pre-dates that and only knows about R16 onwards, so R32 losers had
-- nowhere to live and quietly stayed 'alive' on the sweep tab — every
-- eliminated team showing green.
--
-- Fix: allow 'r32_out' in the check constraint, plus a trigger that
-- auto-marks the loser of any knockout match the moment actual_outcome
-- is set. Never rely on manual updates again — this is now event-driven.

-- 1. Extend the constraint
ALTER TABLE public.cup_sweepstake_team_status
  DROP CONSTRAINT IF EXISTS cup_sweepstake_team_status_status_check;

ALTER TABLE public.cup_sweepstake_team_status
  ADD CONSTRAINT cup_sweepstake_team_status_status_check
  CHECK (status IN (
    'alive', 'group_stage_out', 'r32_out', 'r16_out', 'qf_out',
    'sf_out', 'third_place_lost', 'final_lost', 'winner'
  ));

-- 2. Function: mark the losing team as {stage}_out.
--    'draw' is possible in groups but not knockouts — knockouts always
--    resolve via 90/ET/pens, so if we see a knockout row with actual_outcome
--    starting 'team1' or 'team2' we know the loser.
CREATE OR REPLACE FUNCTION public.cup_settle_sweepstake_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loser text;
  v_status text;
BEGIN
  -- Only act when actual_outcome flips to a decisive value and the row is a knockout
  IF NEW.actual_outcome IS NULL OR NEW.is_knockout IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF OLD IS NOT NULL AND OLD.actual_outcome IS NOT DISTINCT FROM NEW.actual_outcome THEN
    RETURN NEW;
  END IF;

  -- Extract the loser
  IF NEW.actual_outcome LIKE 'team1_%' THEN
    v_loser := NEW.team2;
  ELSIF NEW.actual_outcome LIKE 'team2_%' THEN
    v_loser := NEW.team1;
  ELSE
    RETURN NEW; -- draw or unknown shape, do nothing
  END IF;

  -- Map stage → sweep status
  v_status := CASE NEW.stage
    WHEN 'r32'  THEN 'r32_out'
    WHEN 'r16'  THEN 'r16_out'
    WHEN 'qf'   THEN 'qf_out'
    WHEN 'sf'   THEN 'sf_out'
    WHEN 'final' THEN 'final_lost'
    ELSE NULL
  END;

  IF v_status IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.cup_sweepstake_team_status
     SET status = v_status
   WHERE team_name = v_loser;

  -- If it's the final, the other team is the winner
  IF NEW.stage = 'final' THEN
    UPDATE public.cup_sweepstake_team_status
       SET status = 'winner'
     WHERE team_name = CASE WHEN NEW.actual_outcome LIKE 'team1_%' THEN NEW.team1 ELSE NEW.team2 END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cup_settle_sweepstake_status_trg ON public.cup_matches;
CREATE TRIGGER cup_settle_sweepstake_status_trg
  AFTER INSERT OR UPDATE OF actual_outcome ON public.cup_matches
  FOR EACH ROW EXECUTE FUNCTION public.cup_settle_sweepstake_status();
