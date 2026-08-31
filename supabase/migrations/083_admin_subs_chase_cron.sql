-- Monthly admin push: "N unpaid subs · £X outstanding".
--
-- Fires on the 1st of every month at 08:00 UTC (09:00 BST / 08:00 GMT).
-- The edge function is silent when the current season has zero unpaid
-- rows — no wasted "all paid, well done" pings.
--
-- Requires vault secret `subs_chase_url` to be set to the edge fn URL
-- (SUPABASE_URL/functions/v1/admin-subs-chase-monthly), same pattern as
-- feature_announce_url in mig 079.

-- Ensure pg_net + pg_cron extensions available (both already in use).
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Dispatcher: pulls URL from vault, POSTs with the current season key.
-- No args → the edge fn computes season itself from `now()` UTC.
create or replace function public.call_admin_subs_chase_monthly()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'subs_chase_url'
  limit 1;

  if v_url is null or v_url = '' then
    raise notice 'vault secret subs_chase_url not set — admin-subs-chase-monthly skipped';
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

-- Cron: 08:00 UTC on the 1st of every month. That's 09:00 BST in summer,
-- 08:00 GMT in winter — either way well after the monthly stats round-up
-- (GH Actions, 07:00 BST) so admin gets the round-up first, chase second.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'admin-subs-chase-monthly') then
    perform cron.unschedule('admin-subs-chase-monthly');
  end if;
end $$;

select cron.schedule(
  'admin-subs-chase-monthly',
  '0 8 1 * *',
  $$select public.call_admin_subs_chase_monthly()$$
);
