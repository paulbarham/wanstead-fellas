-- Stop the duplicate "match report is live" push at voting close.
--
-- Two triggers currently fan out topic='results' pushes:
--   1. results_notify_report_live_trg (mig 056) — fires when results.summary
--      transitions NULL/'' → text. Sends the "📝 Match report is live" copy
--      immediately, however early the admin writes the report.
--   2. voting_windows_notify_results_trg (mig 048) — fires when voting
--      closes and awards get published. Sends the same "results" push,
--      which the edge fn frames as "match report is live" if a summary
--      is on file, or the awards-only fallback if not.
--
-- When admin writes the report BEFORE voting closes (13 Aug 2026 case),
-- both triggers fire and the group gets the same push twice within a
-- few hours. Tag coalescing hides most of it on iOS/Android but the
-- buzz still fires twice.
--
-- Fix: teach the awards-published trigger to short-circuit when a
-- summary already exists — the summary trigger has covered it. If
-- there's no summary yet (admin published awards but hasn't written
-- the report), still fire the awards-only fallback so the group hears
-- the awards landed.

create or replace function public.voting_windows_notify_results()
returns trigger
language plpgsql
security definer
as $$
declare
  v_has_summary boolean;
begin
  if new.results_published is true
     and (old.results_published is distinct from true) then
    select (summary is not null and summary <> '')
      into v_has_summary
      from public.results
     where match_id = new.match_id;

    if coalesce(v_has_summary, false) then
      -- Summary already lit up the "match report is live" push via
      -- results_notify_report_live_trg — skip the duplicate.
      raise notice 'voting_windows_notify_results: summary already present for match %, suppressing dup push', new.match_id;
      return new;
    end if;

    perform public.call_send_vote_notifications(new.match_id, 'results');
  end if;
  return new;
end;
$$;
