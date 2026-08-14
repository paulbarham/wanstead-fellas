-- Revert mig 075's suppression — the awards-published trigger fires at
-- voting close regardless of whether results.summary is already set.
--
-- Rationale: even when the summary went out early (like 13 Aug 2026 when
-- the report shipped at 03:50 UTC before voting closed), the awards
-- landing at 10am UK is genuinely new news. Admin's preference is to
-- keep the second buzz — the group notices the awards drop and it acts
-- as a nudge to open the app and see who won MOTM/DOTD. Duplicate copy
-- ("match report is live" twice) is the acceptable cost.
--
-- Follow-up work — decouple the two events cleanly by teaching the
-- edge fn to send a distinct "🏆 Awards published" copy when summary
-- already exists at voting-close time, instead of repeating the
-- report copy. See ROADMAP.
--
-- This migration restores the trigger fn to its mig 048 shape.

create or replace function public.voting_windows_notify_results()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.results_published is true
     and (old.results_published is distinct from true) then
    perform public.call_send_vote_notifications(new.match_id, 'results');
  end if;
  return new;
end;
$$;
