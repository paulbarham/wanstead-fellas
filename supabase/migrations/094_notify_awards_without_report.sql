-- Widen the results push to cover award nights with no report, and move the
-- send state to where it actually belongs.
--
-- ── The regression this fixes ─────────────────────────────────────────────
-- Mig 093 made dispatch_report_notifications the single delivery path and
-- required a non-empty results.summary. Both old triggers were dropped. Net
-- effect: a night with awards but no write-up notifies nobody. Pre-093 the
-- voting-close trigger would at least have fired the awards-only copy.
--
-- Not hypothetical. 2026-05-21 has 4 award_results rows, a results row with
-- scorers and status 'published', and no summary. Under 093 that night would
-- have gone out silent.
--
-- Note the shape of that row: the results row EXISTS. So "no report" has to
-- mean "no summary", not "no results row" — AdminMatchEntry creates a row for
-- the scorers on the night whether or not a report is ever written.
--
-- ── Where the send state lives: voting_windows, not results ───────────────
-- Mig 093 put notified_at on results. That no longer works, because the thing
-- being notified may have no results row worth the name. The options were a
-- second state column (results.notified_at plus something for report-less
-- nights) or moving it. A second column is exactly the smeared, two-things-
-- must-agree state that made the 077 handshake fragile in the first place, so:
-- one column, on voting_windows.
--
-- It is the right home on the merits:
--   * The push is per MATCH NIGHT ("the ballot has resolved"), not per report.
--   * A voting window always exists for any night that can send — the gate is
--     results_published, which only a window has. Verified: 0 of the award
--     sets on this database exist without a voting window.
--   * A results row may have no summary (2026-05-21), and 5 of the 21 results
--     rows have no voting window at all — those can never send anyway, before
--     or after this change.
--
-- results.notified_at is dropped. It shipped yesterday, nothing else reads it.

-- ── 1. state moves ────────────────────────────────────────────────────────
alter table public.voting_windows
  add column if not exists notified_at timestamptz;

comment on column public.voting_windows.notified_at is
  'When the club-wide results push was sent for this match night (report + awards, or awards only). NULL = not yet sent. Set only by dispatch_report_notifications(). This is what makes delivery exactly-once.';

-- Carry the audit across where mig 093 had already stamped a report row;
-- otherwise fall back to closes_at. Anything already resolved is stamped so
-- that widening the predicate below cannot retro-notify old nights — most
-- importantly 2026-05-21, which the new predicate WOULD otherwise pick up.
update public.voting_windows vw
set notified_at = coalesce(
      (select res.notified_at from public.results res where res.match_id = vw.match_id),
      vw.closes_at,
      now())
where vw.results_published is true
  and vw.notified_at is null;

alter table public.results drop column if exists notified_at;
drop index if exists public.results_pending_notify_idx;

create index if not exists voting_windows_pending_notify_idx
  on public.voting_windows (match_id) where notified_at is null;

-- ── 2. the widened dispatcher ─────────────────────────────────────────────
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
  -- How long to wait for a report before giving up and sending awards-only.
  --
  -- This grace period is load-bearing, not padding. The generator writes its
  -- draft at 10:05 Friday and this cron also runs at :05 — without a wait, a
  -- run that lands first would see "no summary", fire the awards-only push,
  -- stamp the window, and permanently suppress the push for the report that
  -- appears sixty seconds later. Six hours also covers a hand-written report:
  -- voting closes 10:00, so nothing goes out awards-only before 16:00.
  v_report_grace constant interval := interval '6 hours';
begin
  if session_user <> 'postgres' and not public.is_admin() then
    raise exception 'dispatch_report_notifications: admins only'
      using errcode = '42501';
  end if;

  for r in
    select vw.match_id,
           res.id as result_id,
           res.closer,
           (res.status = 'published'
            and res.summary is not null
            and res.summary <> '') as has_report
    from public.voting_windows vw
    left join public.results res on res.match_id = vw.match_id
    where vw.results_published is true
      and vw.notified_at is null
      and (
        -- (a) a PUBLISHED report with a summary — send at once, report copy.
        (res.status = 'published' and res.summary is not null and res.summary <> '')
        -- (b) no report content at all — send awards-only, once the grace
        --     period has passed. Covers both "no results row" and the
        --     2026-05-21 shape: a row carrying only scorers.
        or (
          (res.id is null or res.summary is null or res.summary = '')
          and vw.closes_at < now() - v_report_grace
        )
      )
    order by vw.match_id
    for update of vw skip locked
  loop
    -- Claim first. The notified_at guard is the exactly-once lock and holds
    -- for both the report and the awards-only path.
    update public.voting_windows
    set notified_at = now()
    where match_id = r.match_id and notified_at is null;

    if not found then
      continue;
    end if;

    -- Awards signpost only makes sense when there is a report to sign-post
    -- from. On an awards-only night there is no closer to append to, and the
    -- push itself is already the announcement.
    if r.has_report then
      select exists (select 1 from public.award_results ar where ar.match_id = r.match_id)
        into v_has_awards;

      if v_has_awards and (r.closer is null or r.closer !~* 'motm') then
        v_closer := trim(both ' ' from coalesce(r.closer, '') || ' ' || v_awards_line);
        update public.results set closer = v_closer where id = r.result_id;
      end if;
    end if;

    -- The edge function picks its own copy from whether a summary exists:
    -- report present -> the awards-led report copy; absent -> the awards-only
    -- copy. Both are correct as written, so nothing extra is passed here.
    perform public.call_send_vote_notifications(r.match_id, 'results');
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

comment on function public.dispatch_report_notifications() is
  'Sends the one club-wide push per match night: report + awards when a published report with a summary exists, awards-only when none has appeared within the grace period. Exactly-once via voting_windows.notified_at. Scheduled every 10 minutes, offset from compute-award-results.';

-- A pending DRAFT deliberately matches neither branch: it has a summary (so
-- it is not "no report"), but is not published (so it is not branch (a)). It
-- waits, indefinitely if need be, rather than firing an awards-only push that
-- would stamp the window and rob the report of its own. The admin is already
-- being pushed about the unreviewed draft.

revoke execute on function public.dispatch_report_notifications() from public, anon;
grant  execute on function public.dispatch_report_notifications() to authenticated;
