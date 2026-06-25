-- Delegate role hardening: the `can_enter_results` delegate (migration 033)
-- has full write access to the `results` table because that's how goal scorers
-- get saved. But the `results` row also stores the post-match narrative
-- (report_text, highlights, summary, key_highlights, team_awards, banter,
-- app_watch, player_of_tournament, conclusion, closer, predictions, fines_admin).
-- Those are admin-only — Ross enters scores, admin writes the report.
--
-- Enforcing this in the UI alone would still leave the API surface open to a
-- delegate hitting PostgREST directly with their own JWT. This trigger is the
-- backstop: for any writer who is NOT an admin (and not the service role),
-- preserve narrative fields on UPDATE and force them blank on INSERT. The
-- scorers field stays writable since that's what the delegate is here to do.
--
-- Admin and service_role writes are passed through unchanged.

CREATE OR REPLACE FUNCTION results_protect_narrative()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin or service role: unrestricted
  IF is_admin() OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Delegate writer: scrub narrative fields
  IF TG_OP = 'INSERT' THEN
    NEW.report_text          := NULL;
    NEW.highlights           := NULL;
    NEW.summary              := NULL;
    NEW.predictions          := NULL;
    NEW.key_highlights       := NULL;
    NEW.team_awards          := NULL;
    NEW.fines_admin          := NULL;
    NEW.banter               := NULL;
    NEW.app_watch            := NULL;
    NEW.player_of_tournament := NULL;
    NEW.conclusion           := NULL;
    NEW.closer               := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.report_text          := OLD.report_text;
    NEW.highlights           := OLD.highlights;
    NEW.summary              := OLD.summary;
    NEW.predictions          := OLD.predictions;
    NEW.key_highlights       := OLD.key_highlights;
    NEW.team_awards          := OLD.team_awards;
    NEW.fines_admin          := OLD.fines_admin;
    NEW.banter               := OLD.banter;
    NEW.app_watch            := OLD.app_watch;
    NEW.player_of_tournament := OLD.player_of_tournament;
    NEW.conclusion           := OLD.conclusion;
    NEW.closer               := OLD.closer;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS results_protect_narrative ON public.results;
CREATE TRIGGER results_protect_narrative
  BEFORE INSERT OR UPDATE ON public.results
  FOR EACH ROW EXECUTE FUNCTION results_protect_narrative();
