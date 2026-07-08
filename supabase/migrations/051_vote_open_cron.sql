-- Stage 2 of the vote_open notification fix (see migration 050 for context).
--
-- Migration 050 re-labelled the INSERT trigger so team-publish fires
-- 'teams_ready' instead of 'vote_open' — but that left nothing firing
-- 'vote_open' when opens_at is actually reached. This migration adds the
-- pg_cron job that closes that loop.
--
-- Job runs every minute (cheap; delay from opens_at ≤ 60s). Scans for
-- voting_windows rows where opens_at ≤ now() AND notified_open_at IS NULL,
-- fires the vote_open push, stamps notified_open_at so the row is
-- idempotent (re-run safe).
--
-- Same infra as the existing compute-award-results (every 10m) and
-- cup-results-sync (every 30m) crons.

CREATE OR REPLACE FUNCTION public.fanout_vote_open_ready()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT match_id
    FROM public.voting_windows
    WHERE opens_at <= now()
      AND notified_open_at IS NULL
    ORDER BY opens_at
    LIMIT 50   -- backstop in case something ever gets stuck
  LOOP
    PERFORM public.call_send_vote_notifications(r.match_id, 'vote_open');
    UPDATE public.voting_windows
      SET notified_open_at = now()
      WHERE match_id = r.match_id;
  END LOOP;
END;
$$;

-- Idempotent schedule: drop any existing job of this name, then create.
SELECT cron.unschedule('fanout-vote-open')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fanout-vote-open');

SELECT cron.schedule(
  'fanout-vote-open',
  '* * * * *',
  'SELECT public.fanout_vote_open_ready();'
);
