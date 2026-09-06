-- Decouple publishing from notifying. One push, when the report AND the
-- awards are both final.
--
-- ── What was actually wrong ───────────────────────────────────────────────
-- The mig 077 handshake was two triggers, each deferring to the other, with
-- NO persisted state. In the common path it did deliver: publishing while
-- voting was open deferred, and compute_award_results (cron, every 10 min)
-- then set voting_windows.results_published = true, which fired
-- voting_windows_notify_results, which sent the push. So "the group is never
-- notified" was not true in general.
--
-- What WAS true, and is why this migration exists:
--
--   * No send state existed. Nothing anywhere recorded that a push had gone
--     out, so exactly-once was a property of the trigger pair being exactly
--     right, not something the data could enforce. Re-publishing a row, or
--     results_published being flipped true a second time, would have sent
--     again with nothing to stop it.
--   * The handshake was implicit and brittle. Mig 090 had to widen the
--     trigger's column list from `UPDATE OF summary` to `OF summary, status`
--     purely to keep it working — a silent break one column away.
--   * A match with no voting_windows row could never notify at all: neither
--     trigger has anything to fire on.
--   * Publishing was coupled to voting. Publishing on the night meant the
--     push waited on a mechanism the publisher couldn't see.
--
-- ── The new shape ─────────────────────────────────────────────────────────
--   publish        any time, including match night. Nothing else required.
--   awards final   compute_award_results sets voting_windows.results_published
--   deliver        a cron picks up (published AND awards final AND not yet
--                  notified), stamps results.notified_at, sends ONE push
--
-- Triggers no longer send anything. Delivery has exactly one owner.

-- ── 1. send state ─────────────────────────────────────────────────────────
alter table public.results
  add column if not exists notified_at timestamptz;

comment on column public.results.notified_at is
  'When the club-wide "match report is live" push was sent for this row. NULL = not yet sent. Set only by dispatch_report_notifications(). Its presence is what makes delivery exactly-once.';

-- Every row that exists today predates this mechanism and has already had
-- whatever push it was going to get. Stamp them all so none re-notify the
-- moment the cron below is scheduled. created_at is the honest approximation
-- of when they went out; the exact minute is not recoverable and does not
-- matter — all that matters is that it is NOT NULL.
update public.results
set notified_at = coalesce(created_at, now())
where notified_at is null;

create index if not exists results_pending_notify_idx
  on public.results (match_id) where notified_at is null;

-- ── 2. triggers stop sending ──────────────────────────────────────────────
-- Both of these called call_send_vote_notifications directly. Neither does
-- now — the cron is the single delivery path. They are replaced with no-op
-- bodies rather than dropped outright so that any path still reaching them
-- (a trigger re-added by hand, an old migration replayed) cannot send.
--
-- NOTE: voting_windows_notify_results is included deliberately. It is the
-- other half of the 077 handshake and also sent. Neutralising only the
-- results-side trigger would have left the voting-close path live and
-- produced two pushes per report.
drop trigger if exists results_notify_report_live_trg on public.results;
drop trigger if exists voting_windows_notify_results_trg on public.voting_windows;

create or replace function public.results_notify_report_live()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Superseded by dispatch_report_notifications() (mig 093). Publishing now
  -- records intent by leaving results.notified_at NULL; the cron delivers.
  raise notice 'results_notify_report_live is a no-op since mig 093 — delivery is owned by dispatch_report_notifications()';
  return new;
end;
$$;

create or replace function public.voting_windows_notify_results()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Superseded by dispatch_report_notifications() (mig 093).
  raise notice 'voting_windows_notify_results is a no-op since mig 093 — delivery is owned by dispatch_report_notifications()';
  return new;
end;
$$;

-- voting_windows_notify_open (the "vote now" push at window open) is a
-- DIFFERENT trigger and is deliberately untouched.

-- ── 3. delivery ───────────────────────────────────────────────────────────
create or replace function public.dispatch_report_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_sent int := 0;
  v_has_awards boolean;
  v_closer text;
  v_awards_line constant text := '📟 MOTM & DOTD winners are up on the Match tab.';
begin
  -- Callable by the scheduler or an admin, nobody else. Same reasoning as
  -- mig 092: this function is in public, so PostgREST exposes it, and it is
  -- SECURITY DEFINER owned by postgres — which means current_user is
  -- 'postgres' on every path including an anonymous request. session_user is
  -- the discriminator that actually separates cron from web.
  if session_user <> 'postgres' and not public.is_admin() then
    raise exception 'dispatch_report_notifications: admins only'
      using errcode = '42501';
  end if;

  for r in
    select res.id, res.match_id, res.closer
    from public.results res
    join public.voting_windows vw on vw.match_id = res.match_id
    where res.status = 'published'
      and res.summary is not null
      and res.summary <> ''
      and res.notified_at is null
      -- results_published is the finality signal, NOT "award_results has
      -- rows". compute_award_results sets it even when nobody voted, and a
      -- zero-turnout night must still get its report push — gating on the
      -- existence of award rows would silently swallow those.
      and vw.results_published is true
    order by res.id
    -- Skip rows another concurrent run already has. Belt and braces: the
    -- notified_at guard on the UPDATE below is the real exactly-once lock.
    for update of res skip locked
  loop
    -- Claim it first. If another session got there between the SELECT and
    -- here, the guard makes this a no-op and we send nothing.
    update public.results
    set notified_at = now()
    where id = r.id and notified_at is null;

    if not found then
      continue;
    end if;

    -- Awards fill-in. The winners themselves are NOT copied into the report
    -- body: award_results already renders on the Match and History tabs, and
    -- CLAUDE.md is explicit that re-packaging MOTM/DOTD inside the report
    -- reads as self-congratulatory. What the report gains is the pointer,
    -- matching the existing house closer (see the 27 Aug report).
    select exists (select 1 from public.award_results ar where ar.match_id = r.match_id)
      into v_has_awards;

    if v_has_awards and (r.closer is null or r.closer !~* 'motm') then
      v_closer := trim(both ' ' from coalesce(r.closer, '') || ' ' || v_awards_line);
      update public.results set closer = v_closer where id = r.id;
    end if;

    -- Same transaction as the stamp: net.http_post queues the request in a
    -- table, so if this rolls back the send rolls back with it. No window
    -- where we have stamped but not sent, or sent but not stamped.
    perform public.call_send_vote_notifications(r.match_id, 'results');
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

comment on function public.dispatch_report_notifications() is
  'Sends the one club-wide match-report push per match, when the report is published AND voting_windows.results_published is true AND results.notified_at is null. Stamps notified_at to guarantee exactly-once. Scheduled every 10 minutes, offset from compute-award-results.';

revoke execute on function public.dispatch_report_notifications() from public, anon;
grant  execute on function public.dispatch_report_notifications() to authenticated;

-- ── 4. schedule ───────────────────────────────────────────────────────────
-- compute-award-results runs at */10 (:00, :10, :20 …). This runs five
-- minutes behind it rather than on the same tick, so results_published is
-- already set by the time we look — sharing a minute would leave the order
-- of two independent jobs up to chance and delay delivery by a full cycle
-- whenever it lost the race.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'dispatch-report-notifications') then
    perform cron.unschedule('dispatch-report-notifications');
  end if;
end $$;

select cron.schedule(
  'dispatch-report-notifications',
  '5,15,25,35,45,55 * * * *',
  $$select public.dispatch_report_notifications()$$
);
