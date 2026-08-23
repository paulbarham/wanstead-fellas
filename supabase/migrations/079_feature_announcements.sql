-- Feature announcements — admin broadcasts a "what's new" push to the
-- whole group, delivered at the next 9am UK from when it's posted.
--
-- Admin spec (20 Aug 2026):
--   * Admin (Paul) posts a title / body / optional deep-link
--   * `scheduled_for` is computed by the client as the next 9am UK
--     from posting time — posted at 8am today → sends at 9am today,
--     posted at 10am → sends at 9am tomorrow
--   * The 15-min pg_cron passes over any row past its scheduled_for,
--     hits the send-feature-announcement edge fn, which fans out to
--     every push_subscription (like the `results` topic already does).
--   * Optimistic single-fire: dispatch marks sent_at immediately so
--     a subsequent cron tick can't double-send. Trade-off: an edge
--     fn error means the announcement is silently dropped — admin
--     can inspect sent_count vs total_subs in the client to spot
--     misfires and manually retry.

create table if not exists public.feature_announcements (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  body           text not null,
  url            text default '/',
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  scheduled_for  timestamptz not null,
  sent_at        timestamptz,
  sent_count     int,
  total_subs     int
);

create index if not exists feature_announcements_pending_lookup
  on public.feature_announcements(scheduled_for)
  where sent_at is null;

comment on table public.feature_announcements is
  '"What''s new" push announcements. Admin-authored, scheduled to next 9am UK, fanned out via send-feature-announcement edge fn.';

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.feature_announcements enable row level security;

-- Everyone can read (in case we build an in-app "what's new" list later —
-- for now the client doesn't surface these, only the push does)
drop policy if exists feature_announcements_read on public.feature_announcements;
create policy feature_announcements_read on public.feature_announcements
  for select using (true);

-- Insert / update / delete: admin only
drop policy if exists feature_announcements_write_admin on public.feature_announcements;
create policy feature_announcements_write_admin on public.feature_announcements
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Edge-fn dispatcher (calls send-feature-announcement) ───────────────────
create or replace function public.call_send_feature_announcement(p_announcement_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'feature_announce_url'
  limit 1;

  if v_url is null or v_url = '' then
    raise notice 'vault secret feature_announce_url not set — send-feature-announcement skipped';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('announcement_id', p_announcement_id),
    timeout_milliseconds := 20000
  );
end;
$$;

-- ── Cron helper: fire everything past its scheduled_for ────────────────────
create or replace function public.dispatch_pending_feature_announcements()
returns int
language plpgsql
security definer
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select id
      from public.feature_announcements
     where sent_at is null and scheduled_for <= now()
     order by scheduled_for
     limit 20
  loop
    -- Optimistic claim BEFORE calling the edge fn so a subsequent cron
    -- tick can't double-send if this call is slow. Edge fn later fills
    -- in sent_count + total_subs.
    update public.feature_announcements
       set sent_at = now()
     where id = r.id;

    perform public.call_send_feature_announcement(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ── Cron: every 15 min, past-scheduled rows dispatch ───────────────────────
-- 15-min tick means "9am UK" delivery lands between 09:00 and 09:15 UK.
-- Fine-grained enough for a morning push; tighter than that isn't worth
-- the extra pg_cron churn.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'dispatch-feature-announcements') then
    perform cron.unschedule('dispatch-feature-announcements');
  end if;
end $$;

select cron.schedule(
  'dispatch-feature-announcements',
  '0,15,30,45 * * * *',
  $cron$select public.dispatch_pending_feature_announcements();$cron$
);
