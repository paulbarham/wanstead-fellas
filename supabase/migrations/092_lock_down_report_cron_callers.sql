-- Lock down the two match-report cron callers.
--
-- Problem. call_weekly_context() and call_generate_match_report() are in the
-- public schema, so PostgREST exposes them at /rest/v1/rpc/<name>. Both had
-- EXECUTE granted to PUBLIC, anon and authenticated. Both are SECURITY DEFINER
-- and resolve their endpoint from vault themselves, so the "secret" URL is not
-- a gate — an unauthenticated caller could fire either one. Confirmed before
-- this migration: an anon POST to /rest/v1/rpc/call_weekly_context returned
-- HTTP 204, i.e. it actually ran. For call_generate_match_report that is an
-- anonymous trigger for Anthropic spend.
--
-- ── Why the guard is on session_user, not current_user ────────────────────
-- These functions are SECURITY DEFINER and owned by postgres, so INSIDE them
-- current_user is 'postgres' on EVERY path, including an anon web request.
-- A `current_user = 'postgres'` check would therefore permit everyone — it
-- reads like a guard and is a no-op.
--
-- SECURITY DEFINER changes current_user; it does NOT change session_user.
-- Measured on this database (probe function called both ways):
--
--   caller                     current_user   session_user     request.method
--   pg_cron background worker  postgres       postgres         (null)
--   PostgREST, anon key        postgres       authenticator    POST
--
-- So session_user is the discriminator that actually separates the scheduler
-- from the web. Behaviour of the guard below:
--
--   pg_cron                      session_user = postgres      → allowed
--   PostgREST, anon              is_admin() false             → denied
--   PostgREST, authenticated     is_admin() false             → denied
--   PostgREST, admin             is_admin() true              → allowed
--
-- The admin case is kept deliberately: a "regenerate this week's report"
-- button in the admin UI calls the RPC as `authenticated`, and must keep
-- working.
--
-- ── Scope ─────────────────────────────────────────────────────────────────
-- Only the two report functions are changed here. The other seven call_*
-- functions share the same exposure but CANNOT take this guard as-is:
-- call_send_vote_notifications is invoked from inside the results and
-- voting_windows triggers, where session_user is 'authenticator' (an app
-- write) and is_admin() is false for a delegate or the service-role edge
-- function. Adding this guard there would silently kill the match-night and
-- results pushes. They need a different fix — tracked separately.

-- ── weekly-context ────────────────────────────────────────────────────────
create or replace function public.call_weekly_context()
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url text;
begin
  if session_user <> 'postgres' and not public.is_admin() then
    raise exception 'call_weekly_context: admins only'
      using errcode = '42501';
  end if;

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
set search_path = public, vault
as $$
declare
  v_url text;
begin
  if session_user <> 'postgres' and not public.is_admin() then
    raise exception 'call_generate_match_report: admins only'
      using errcode = '42501';
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'generate_report_url'
  limit 1;

  if v_url is null or v_url = '' then
    raise notice 'vault secret generate_report_url not set — generate-match-report skipped';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
end;
$$;

-- ── belt and braces: drop the grants that let anon in at all ──────────────
-- The in-function guard is the real control; this stops an anon request
-- before it ever enters the function body. `authenticated` keeps EXECUTE so
-- an admin regenerate button still works (the guard sorts admin from not).
revoke execute on function public.call_weekly_context()        from public, anon;
revoke execute on function public.call_generate_match_report() from public, anon;

grant execute on function public.call_weekly_context()        to authenticated;
grant execute on function public.call_generate_match_report() to authenticated;
