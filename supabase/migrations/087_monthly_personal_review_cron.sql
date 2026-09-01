-- Monthly personal review push — 1st of every month at 07:15 UTC
--
-- Fires the edge fn `monthly-personal-review-notify` which pushes a
-- generic "your <month> is in" prompt to every player who had at least
-- one appearance in the just-closed month. The push deep-links to
-- /profile/monthly/YYYY-MM where they see the per-player card.
--
-- 07:15 UTC = 08:15 BST / 07:15 GMT — after the monthly stats round-up
-- (07:00 BST via GH Actions) so the group PDF lands first, then the
-- personal nudge as a follow-up.
--
-- Requires vault secret `monthly_review_url` (same pattern as
-- feature_announce_url / subs_chase_url).
--
-- The zero-apps filter is done inside the edge fn (queries appearances
-- for the month, only pushes to players who turned out). No point
-- pinging inactive players — that's push fatigue for zero payoff.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.call_monthly_personal_review_notify()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'monthly_review_url'
  limit 1;

  if v_url is null or v_url = '' then
    raise notice 'vault secret monthly_review_url not set — monthly-personal-review-notify skipped';
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

do $$
begin
  if exists (select 1 from cron.job where jobname = 'monthly-personal-review-notify') then
    perform cron.unschedule('monthly-personal-review-notify');
  end if;
end $$;

select cron.schedule(
  'monthly-personal-review-notify',
  '15 7 1 * *',
  $$select public.call_monthly_personal_review_notify()$$
);
