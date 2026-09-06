-- Match report automation, part 2 of 2: the Friday schedule.
--
--   09:55 UK  weekly-context         caches the week's football + news
--   10:05 UK  generate-match-report  writes the draft, pushes Paul only
--
-- ── On the clock ──────────────────────────────────────────────────────────
-- pg_cron runs in UTC. The hard constraint is that the generator must fire
-- AFTER voting_windows.closes_at, which is 10:00 Europe/London — the entire
-- reason this job exists. 10:05 UTC satisfies that in both halves of the year:
--
--   BST (Mar-Oct)  10:05 UTC = 11:05 London  ✓ an hour after close
--   GMT (Oct-Mar)  10:05 UTC = 10:05 London  ✓ five minutes after close
--
-- Scheduling at 09:55 UTC instead would land at 09:55 London through the
-- winter — before the ballot closes — and quietly reintroduce the exact bug
-- this whole feature exists to kill. Belt and braces: generate-match-report
-- also re-checks closes_at itself and refuses to run early.
--
-- weekly-context at 09:00 UTC is 10:00 BST / 09:00 GMT, comfortably ahead of
-- the generator in both cases. It has no correctness constraint of its own —
-- it just needs to be warm first.
--
-- Requires two vault secrets holding the function URLs, same pattern as
-- feature_announce_url / subs_chase_url / monthly_review_url:
--   weekly_context_url    https://<ref>.supabase.co/functions/v1/weekly-context
--   generate_report_url   https://<ref>.supabase.co/functions/v1/generate-match-report

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ── weekly-context ────────────────────────────────────────────────────────
create or replace function public.call_weekly_context()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'weekly_context_url'
  limit 1;

  if v_url is null or v_url = '' then
    raise notice 'vault secret weekly_context_url not set — weekly-context skipped';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

-- ── generate-match-report ─────────────────────────────────────────────────
create or replace function public.call_generate_match_report()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'generate_report_url'
  limit 1;

  if v_url is null or v_url = '' then
    raise notice 'vault secret generate_report_url not set — generate-match-report skipped';
    return;
  end if;

  -- Generous timeout: this is a thinking model writing ~800 words against a
  -- large prompt. The function is idempotent (it refuses to overwrite an
  -- existing draft without force) so a pg_net timeout on our side can't
  -- produce a duplicate report.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
end;
$$;

-- ── schedule ──────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-context') then
    perform cron.unschedule('weekly-context');
  end if;
  if exists (select 1 from cron.job where jobname = 'generate-match-report') then
    perform cron.unschedule('generate-match-report');
  end if;
end $$;

-- Friday = day-of-week 5.
select cron.schedule(
  'weekly-context',
  '0 9 * * 5',
  $$select public.call_weekly_context()$$
);

select cron.schedule(
  'generate-match-report',
  '5 10 * * 5',
  $$select public.call_generate_match_report()$$
);
