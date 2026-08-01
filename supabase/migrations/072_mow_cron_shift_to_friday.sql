-- Shift the MoW picker cron from Mon 08:00 UTC → Fri 08:00 UTC.
--
-- Rationale (admin call, 1 Aug 2026): announce the weekend's MoW as
-- part of the Friday match report drop, not four days ahead on Monday.
-- The earliest possible kickoff each weekend is Friday night, so picking
-- Friday morning still gives everyone plenty of time to lock in a pick.
-- The Monday-ahead cadence created confusion (is this THIS weekend's
-- fixture or NEXT weekend's?) and split the group's attention across the
-- week — this concentrates it around the Thursday match report ritual.
--
-- Also: MatchReport now embeds a "This weekend's MoW" callout that
-- auto-renders from the current fixture, so the announce arrives inside
-- the report body itself (see MowCallout.tsx).
--
-- Results-poll schedule is unchanged (Mon 07:00 + 15:00 UTC) — that
-- needs to run AFTER the games are played, which is over the weekend.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mow-pick-weekly-cron') then
    perform cron.unschedule('mow-pick-weekly-cron');
  end if;
end $$;

-- Fri 08:00 UTC ≈ 09:00 UK during BST, 08:00 UK during GMT. Runs before
-- the earliest possible kickoff (Fri night ~19:30 UK).
select cron.schedule(
  'mow-pick-weekly-cron',
  '0 8 * * 5',
  $cron$select call_mow_pick_weekly();$cron$
);
