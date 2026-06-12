-- Schedule the cup-results-sync edge function so World Cup results land
-- automatically without the admin needing to enter them.
--
-- The edge function only writes to cup_matches rows where actual_outcome
-- IS NULL — admin entries are sacrosanct and never get overwritten — and
-- when it sets actual_outcome the existing settle_cup_predictions trigger
-- scores everyone's predictions, exactly as it would on a manual entry.
-- Existing predictions on already-settled matches are not touched.
--
-- One-off setup (NOT in source control because they're project-specific):
--   1. Sign up for a free key at https://www.football-data.org/client/register
--   2. In Supabase Dashboard → Edge Functions → cup-results-sync → Secrets,
--      add `FOOTBALL_DATA_API_KEY` = <your key>.
--   3. Tell this migration's helper where to reach the function:
--        alter database postgres set app.cup_sync_url =
--          'https://<project-ref>.supabase.co/functions/v1/cup-results-sync';
--      (substitute the project ref). If unset, the cron is a silent no-op.

create extension if not exists pg_net;

-- Helper called from cron. Reads the function URL from a DB setting so the
-- project ref never has to live in source control. No-ops cleanly if the
-- setting hasn't been configured yet.
create or replace function call_cup_results_sync()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
begin
  v_url := current_setting('app.cup_sync_url', true);
  if v_url is null or v_url = '' then
    raise notice 'app.cup_sync_url not set — cup-results-sync skipped';
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

-- Unschedule any previous incarnation so this migration is rerunnable.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cup-results-sync') then
    perform cron.unschedule('cup-results-sync');
  end if;
end $$;

-- Every 30 min (UTC). With 90–120 min match runtimes, results land within
-- ~30 min of full-time. Cheap if there's nothing to update — one API call
-- and zero DB writes.
select cron.schedule(
  'cup-results-sync',
  '*/30 * * * *',
  $cron$select call_cup_results_sync();$cron$
);
