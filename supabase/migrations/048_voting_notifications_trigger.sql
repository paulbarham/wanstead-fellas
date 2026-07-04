-- Trigger send-vote-notifications when a voting window is inserted
-- ("vote_open") or when results_published flips true ("results").
--
-- Follows the same call_cup_results_sync pattern: URL stored in Vault,
-- pg_net POST with a JSON body. The edge function auths itself against
-- Deno.env-provided secrets and short-circuits with a 500 if VAPID_PRIVATE_KEY
-- isn't set (so admins get a clear signal when secrets are missing).

CREATE OR REPLACE FUNCTION public.call_send_vote_notifications(
  p_match_id uuid,
  p_topic text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'vote_notify_url'
  LIMIT 1;

  IF v_url IS NULL OR v_url = '' THEN
    RAISE NOTICE 'vault secret vote_notify_url not set — send-vote-notifications skipped';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('match_id', p_match_id, 'topic', p_topic),
    timeout_milliseconds := 20000
  );
END;
$$;

-- 1. Voting window inserted → notify "vote_open".
--    This fires the moment the admin publishes tonight's teams + results
--    (the AdminMatchEntry Save Result flow creates the voting_windows row).
CREATE OR REPLACE FUNCTION public.voting_windows_notify_open()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_send_vote_notifications(NEW.match_id, 'vote_open');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS voting_windows_notify_open_trg ON public.voting_windows;
CREATE TRIGGER voting_windows_notify_open_trg
  AFTER INSERT ON public.voting_windows
  FOR EACH ROW EXECUTE FUNCTION public.voting_windows_notify_open();

-- 2. Results published → notify "results".
--    compute_award_results() flips results_published=true after tallying;
--    admin overrides also set it via the client. Either path fires this.
CREATE OR REPLACE FUNCTION public.voting_windows_notify_results()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.results_published IS TRUE
     AND (OLD.results_published IS DISTINCT FROM TRUE) THEN
    PERFORM public.call_send_vote_notifications(NEW.match_id, 'results');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS voting_windows_notify_results_trg ON public.voting_windows;
CREATE TRIGGER voting_windows_notify_results_trg
  AFTER UPDATE OF results_published ON public.voting_windows
  FOR EACH ROW EXECUTE FUNCTION public.voting_windows_notify_results();
