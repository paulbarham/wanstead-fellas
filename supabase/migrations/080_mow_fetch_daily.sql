-- Widen the MoW results-fetch cron from Monday-only to daily.
--
-- Bug surfaced 24 Aug 2026: Brentford v Spurs (Sat 22 Aug) sat "pending"
-- in the app for 2 days because the fetch cron was `0 7 * * 1` and
-- `0 15 * * 1` — Monday-only. That was fine when MoW picks were
-- Saturday-only, but the pool now includes Fri/Sat/Sun and occasional
-- midweek Championship games, so Monday-only leaves the group staring
-- at stale "pending" screens for up to 3 days.
--
-- New cadence: daily 08:00 + 16:00 UTC. Two shots per day so a
-- 502 from football-data.org's free tier (documented failure mode)
-- doesn't leave results stale for 24h. Fires at ~09:00/17:00 UK BST
-- so results land before most fellas open the app in the evening.
--
-- Football-data.org free tier: 10 calls/min limit; 14 fetches/week is
-- negligible.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mow-fetch-results-cron-am') then
    perform cron.unschedule('mow-fetch-results-cron-am');
  end if;
  if exists (select 1 from cron.job where jobname = 'mow-fetch-results-cron-pm') then
    perform cron.unschedule('mow-fetch-results-cron-pm');
  end if;
end $$;

select cron.schedule(
  'mow-fetch-results-cron-am',
  '0 8 * * *',
  $cron$select call_mow_fetch_results();$cron$
);

select cron.schedule(
  'mow-fetch-results-cron-pm',
  '0 16 * * *',
  $cron$select call_mow_fetch_results();$cron$
);
