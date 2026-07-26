-- pg_cron install for Match of the Week weekly automation.
--
-- Two schedules:
--   * mow-pick-weekly-cron: Mon 08:00 UTC (~09:00 UK winter / summer BST
--     will be 09:00 vs 08:00 — near enough for a "Monday morning" nudge).
--     Picks the featured fixture for the coming weekend if not already
--     picked. Idempotent — mow_fixtures.week_start unique, so re-run
--     safely returns { status: "already_picked" }.
--   * mow-fetch-results-cron: Mon 07:00 UTC + Mon 15:00 UTC. Pulls last-week
--     scores from football-data.org and cascades points via the settle
--     trigger. Two runs give a safety net if the 07:00 feed was slow (FD's
--     free-tier occasionally 502s early morning).
--
-- One-off setup (values live in Vault so the project ref isn't in source):
--   1. Deploy the two edge fns via the Dashboard.
--   2. In Supabase Dashboard → Vault, create secrets:
--        mow_pick_url   = https://<project-ref>.supabase.co/functions/v1/mow-pick-weekly
--        mow_fetch_url  = https://<project-ref>.supabase.co/functions/v1/mow-fetch-results
--      (substitute your project ref). If unset, the cron helpers are silent
--      no-ops and the RAISE NOTICE surfaces in pg logs.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Helper: invoke mow-pick-weekly ─────────────────────────────────────────
create or replace function public.call_mow_pick_weekly()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'mow_pick_url'
  limit 1;

  if v_url is null or v_url = '' then
    raise notice 'vault secret mow_pick_url not set — mow-pick-weekly skipped';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

-- ── Helper: invoke mow-fetch-results ───────────────────────────────────────
create or replace function public.call_mow_fetch_results()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'mow_fetch_url'
  limit 1;

  if v_url is null or v_url = '' then
    raise notice 'vault secret mow_fetch_url not set — mow-fetch-results skipped';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

-- ── Unschedule previous incarnations so this migration re-runs cleanly ─────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mow-pick-weekly-cron') then
    perform cron.unschedule('mow-pick-weekly-cron');
  end if;
  if exists (select 1 from cron.job where jobname = 'mow-fetch-results-cron-am') then
    perform cron.unschedule('mow-fetch-results-cron-am');
  end if;
  if exists (select 1 from cron.job where jobname = 'mow-fetch-results-cron-pm') then
    perform cron.unschedule('mow-fetch-results-cron-pm');
  end if;
end $$;

-- ── Schedules ──────────────────────────────────────────────────────────────
-- Results poll runs before the picker so a Sunday PM game that finished
-- late gets settled before we announce next week's fixture (means the
-- "your points came in!" push and "next MoW published" push don't collide).
select cron.schedule(
  'mow-fetch-results-cron-am',
  '0 7 * * 1',
  $cron$select call_mow_fetch_results();$cron$
);
select cron.schedule(
  'mow-pick-weekly-cron',
  '0 8 * * 1',
  $cron$select call_mow_pick_weekly();$cron$
);
select cron.schedule(
  'mow-fetch-results-cron-pm',
  '0 15 * * 1',
  $cron$select call_mow_fetch_results();$cron$
);
