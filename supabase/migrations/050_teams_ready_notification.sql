-- Split the single "vote_open" notification into two distinct events:
--   * teams_ready — fires when a voting_windows row is INSERTed more than
--     15 minutes before opens_at (i.e. at team-publish time, which is
--     typically 24h ahead of the match).
--   * vote_open   — fires when opens_at is reached. This migration only
--     re-LABELS the trigger; the cron that actually fires vote_open at
--     opens_at time lands in migration 051 (Stage 2).
--
-- Background: since migration 038 (auto-generate fixtures on team publish)
-- the voting_windows row is created at team publish time, but the INSERT
-- trigger still fires with topic 'vote_open' — so subscribers get the
-- "cast your MOTM/DOTD picks" push ~24h before the match. This migration
-- moves the wrong-timed push out of the way and puts the right-timed one
-- (teams_ready) in its place. Stage 2 restores vote_open at the correct
-- time.
--
-- Adds notified_open_at to voting_windows so the Stage 2 cron is
-- idempotent — it will look for rows where opens_at <= now() AND
-- notified_open_at IS NULL, fire the push, stamp notified_open_at.
-- Past matches are backfilled so the cron doesn't retroactively spam.

ALTER TABLE public.voting_windows
  ADD COLUMN IF NOT EXISTS notified_open_at timestamptz;

-- Backfill: past matches (opens_at already in the past) get notified_open_at
-- set to their opens_at so the Stage 2 cron doesn't retroactively fire them.
-- Future rows (like the 9 Jul row) stay NULL so the cron fires them at the
-- correct time.
UPDATE public.voting_windows
SET notified_open_at = opens_at
WHERE opens_at <= now()
  AND notified_open_at IS NULL;

CREATE OR REPLACE FUNCTION public.voting_windows_notify_open()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.opens_at <= now() + interval '15 minutes' THEN
    -- Voting is opening now or has just opened — fire the vote_open push
    -- immediately and stamp notified_open_at so the Stage 2 cron skips
    -- this row.
    PERFORM public.call_send_vote_notifications(NEW.match_id, 'vote_open');
    UPDATE public.voting_windows
      SET notified_open_at = now()
      WHERE match_id = NEW.match_id;
  ELSE
    -- Row inserted well ahead of opens_at — this is a team-publish event.
    -- Fire the teams_ready push instead; the Stage 2 cron will handle the
    -- vote_open push at the correct time.
    PERFORM public.call_send_vote_notifications(NEW.match_id, 'teams_ready');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS voting_windows_notify_open_trg ON public.voting_windows;
CREATE TRIGGER voting_windows_notify_open_trg
  AFTER INSERT ON public.voting_windows
  FOR EACH ROW EXECUTE FUNCTION public.voting_windows_notify_open();
