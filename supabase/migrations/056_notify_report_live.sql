-- Fire the "match report is live" push when results.summary is populated
-- AFTER voting has already closed and the awards-only notification has gone
-- out. Without this trigger the fanout only fires once (from compute_award_
-- results at 10am Fri), and if the admin drafts the report later the group
-- never gets pinged — they only get the earlier "awards published" copy.
--
-- Fires on:
--   * INSERT of a results row that already carries a summary
--     (delegate flow, or admin writing narrative at submit time)
--   * UPDATE where summary transitions from NULL/'' → NOT NULL
--     (the common case: admin submits scorers first, drafts prose later)
--
-- Deliberately does NOT re-fire on subsequent summary edits — one push per
-- report, not one per typo fix. The edge fn checks results.summary itself
-- and picks the "📝 Match report is live" copy over the awards-only
-- fallback, so the same 'results' topic covers both paths.

CREATE OR REPLACE FUNCTION public.results_notify_report_live()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.summary IS NOT NULL AND NEW.summary <> '' AND (
       TG_OP = 'INSERT'
       OR OLD.summary IS NULL
       OR OLD.summary = ''
     ) THEN
    PERFORM public.call_send_vote_notifications(NEW.match_id, 'results');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS results_notify_report_live_trg ON public.results;
CREATE TRIGGER results_notify_report_live_trg
  AFTER INSERT OR UPDATE OF summary ON public.results
  FOR EACH ROW EXECUTE FUNCTION public.results_notify_report_live();
