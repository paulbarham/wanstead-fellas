-- Match-report push: exactly one fire, at max(voting_close, report_completion).
--
-- Admin's stated rule (14 Aug 2026):
--   * Writing the match report on its own must NOT fire a push. If admin
--     drafts the report at 04:00 UTC while voting is still open, the group
--     shouldn't get buzzed then.
--   * The push fires at 10am UK (voting close) IF the report is done by
--     then. That's the "typical Thursday-night → Friday-morning" flow.
--   * If the report isn't done by 10am, the push fires whenever the report
--     is completed AFTER 10am.
--   * Corollary: if voting closes but no report is ever written, no push
--     fires (accepted trade-off — no report, no ping).
--
-- Implementation: two triggers, each defers to the other. Whichever event
-- lands SECOND fires the push. Whichever lands FIRST logs a raise notice
-- and returns without firing.
--
--   summary_write:  fire only if voting_windows.results_published = true
--   voting_close:   fire only if results.summary is non-empty
--
-- Supersedes mig 056 (report-live trigger fired on every summary write)
-- and mig 076 (awards trigger fired unconditionally at voting close).

-- ── summary write ─────────────────────────────────────────────────────────
create or replace function public.results_notify_report_live()
returns trigger
language plpgsql
security definer
as $$
declare
  v_voting_closed boolean;
begin
  -- Fire only on first transition NULL/'' → text (subsequent typo-fix edits
  -- shouldn't re-buzz the group).
  if new.summary is not null and new.summary <> '' and (
       tg_op = 'INSERT'
       or old.summary is null
       or old.summary = ''
     ) then
    select coalesce(results_published, false) into v_voting_closed
      from public.voting_windows
     where match_id = new.match_id;

    if coalesce(v_voting_closed, false) then
      -- Voting is already closed → the awards-published trigger has
      -- already fired (or held for the missing summary). Either way,
      -- we are the second event — fire the push now.
      perform public.call_send_vote_notifications(new.match_id, 'results');
    else
      -- Voting still open. The awards-published trigger will fire when
      -- voting closes and see the summary on file — it will send the
      -- push then. Defer.
      raise notice 'results_notify_report_live: voting still open for match %, deferring push to awards trigger', new.match_id;
    end if;
  end if;
  return new;
end;
$$;

-- ── voting close ──────────────────────────────────────────────────────────
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
    select (summary is not null and summary <> '') into v_has_summary
      from public.results
     where match_id = new.match_id;

    if coalesce(v_has_summary, false) then
      -- Summary already on file → we are the second event, fire now.
      perform public.call_send_vote_notifications(new.match_id, 'results');
    else
      -- No summary yet. The summary-write trigger will see voting closed
      -- when the report lands and fire the push then. Defer.
      raise notice 'voting_windows_notify_results: no summary yet for match %, deferring push to summary trigger', new.match_id;
    end if;
  end if;
  return new;
end;
$$;
