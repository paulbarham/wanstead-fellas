-- Auto-promote the next eligible reserve whenever a confirmed signup leaves.
-- Closes the gap discovered on 24 Jun 2026 when Charlie Nicholls-Petrie sat
-- on the waiting list at 31/32 because the drop that freed a slot bypassed
-- the frontend's pickPromotion logic.
--
-- Mirrors that frontend logic exactly:
--   - wtp_priority players promoted before plain wtp
--   - within tier, oldest signup first (FIFO by created_at ASC)
--   - blocked players (unpaid past grace) skipped — would be rejected by the
--     enforce_unpaid_signup_block trigger anyway, but skipping here means
--     the next eligible reserve gets the slot cleanly
--
-- Fires AFTER UPDATE/DELETE so the seat is genuinely vacant when we count.
-- Won't recurse infinitely: the promoted UPDATE only moves a row INTO
-- confirmed (OLD.status='waiting'), which is the early-return path below.

CREATE OR REPLACE FUNCTION auto_promote_top_reserve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_match_date date;
  promoted_id uuid;
BEGIN
  -- Did a confirmed seat just vacate?
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'confirmed' THEN RETURN OLD; END IF;
    ref_match_date := OLD.match_date;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only fire when the row transitions OUT of confirmed (not on stat changes
    -- like a waiting→confirmed promotion, which would otherwise re-enter here).
    IF OLD.status <> 'confirmed' OR NEW.status = 'confirmed' THEN RETURN NEW; END IF;
    ref_match_date := OLD.match_date;
  ELSE
    RETURN NULL;
  END IF;

  -- Pick the top eligible waiting player.
  SELECT a.id INTO promoted_id
  FROM availability a
  JOIN profiles p ON p.id = a.player_id
  WHERE a.match_date = ref_match_date
    AND a.status = 'waiting'
    AND NOT is_player_blocked(a.player_id)
  ORDER BY
    CASE WHEN COALESCE(p.player_type, 'wtp') = 'wtp_priority' THEN 0 ELSE 1 END,
    a.created_at ASC
  LIMIT 1;

  IF promoted_id IS NOT NULL THEN
    UPDATE availability SET status = 'confirmed' WHERE id = promoted_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS availability_auto_promote ON public.availability;
CREATE TRIGGER availability_auto_promote
  AFTER UPDATE OR DELETE ON public.availability
  FOR EACH ROW EXECUTE FUNCTION auto_promote_top_reserve();
