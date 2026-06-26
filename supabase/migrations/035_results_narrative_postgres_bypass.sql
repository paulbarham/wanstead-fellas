-- Patch to migration 034's results_protect_narrative trigger.
--
-- The trigger correctly preserves narrative fields for delegate writers
-- (is_admin = false, can_enter_results = true) but unintentionally also
-- blocks legitimate maintenance writes via the SQL editor / Supabase MCP /
-- direct psql, because in those contexts auth.uid() and auth.role() are
-- both NULL — is_admin() returns false and auth.role() = 'service_role'
-- evaluates to NULL.
--
-- Adds current_user = 'postgres' to the bypass set: the superuser is the
-- operational backdoor for migrations and manual maintenance and should
-- always pass through unchanged.

CREATE OR REPLACE FUNCTION results_protect_narrative()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin, service role, or postgres superuser: unrestricted
  IF is_admin() OR auth.role() = 'service_role' OR current_user = 'postgres' THEN
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
