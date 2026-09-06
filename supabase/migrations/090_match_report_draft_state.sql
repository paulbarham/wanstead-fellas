-- Match report automation, part 1 of 2: draft state + weekly context cache.
--
-- Context. Match reports have historically been written by hand around
-- midnight on Thursday — i.e. BEFORE the voting window closes at 10:00 UK on
-- Friday. Consequence: MOTM and DOTD have never once appeared in a report,
-- because at write time the ballot was still open. The automation flips the
-- order: the generator runs at 10:05 Friday, after voting_windows.closes_at,
-- so the awards are on file and land in the report.
--
-- Because a machine now writes the first draft, reports need a review gate.
-- results.status is that gate:
--
--   'draft'      generator wrote it, only admins can see it
--   'published'  admin reviewed + published it, group can see it, push fires
--
-- Three pieces here:
--   1. results.status + backfill
--   2. weekly_context — the Friday news/results cache the generator reads
--   3. re-point the report push at the PUBLISH event, not the summary write
--
-- Part 2 (mig 091) schedules the two edge functions.

-- ── 1. results.status ─────────────────────────────────────────────────────
alter table public.results
  add column if not exists status text not null default 'draft';

-- Everything that exists today was written by hand and is live. The column
-- default only applies going forward, to rows the generator inserts.
update public.results set status = 'published' where status <> 'published';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'results_status_check'
  ) then
    alter table public.results
      add constraint results_status_check check (status in ('draft', 'published'));
  end if;
end $$;

create index if not exists results_status_idx on public.results (status);

-- Players see published reports only; admins (can_manage_results) see drafts
-- too, which is what the review screen reads. Enforced here as well as in the
-- client queries so a draft can't leak through a route we forgot to filter.
drop policy if exists results_select on public.results;
create policy results_select on public.results
  for select
  using (
    auth.role() = 'authenticated'
    and (status = 'published' or public.can_manage_results())
  );

-- ── 2. weekly_context ─────────────────────────────────────────────────────
-- One row per week, written Friday 09:55 by the `weekly-context` edge fn.
-- items is an array of { kind, headline, detail, source } — football results
-- pulled from football-data.org, plus 2-3 notable non-football items. The
-- report generator reads this for FRAMING only; it is never a source of
-- pitch events.
create table if not exists public.weekly_context (
  week_start date primary key,
  items      jsonb       not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.weekly_context enable row level security;

drop policy if exists weekly_context_select on public.weekly_context;
create policy weekly_context_select on public.weekly_context
  for select using (auth.role() = 'authenticated');

drop policy if exists weekly_context_admin_write on public.weekly_context;
create policy weekly_context_admin_write on public.weekly_context
  for all using (public.is_admin());

-- ── 3. push fires on PUBLISH, not on the draft write ──────────────────────
-- Supersedes the firing condition in mig 077. The two-trigger "whichever
-- lands second wins" design is unchanged — the only change is that the
-- report-side event is now "a PUBLISHED report exists" rather than "summary
-- became non-empty". Without this the 10:05 generator would push the group
-- its own unreviewed draft five minutes after voting closes.
create or replace function public.results_notify_report_live()
returns trigger
language plpgsql
security definer
as $$
declare
  v_voting_closed boolean;
  v_was_live boolean;
begin
  -- Was this row already a live, published report before this statement?
  v_was_live := tg_op = 'UPDATE'
                and old.status = 'published'
                and old.summary is not null
                and old.summary <> '';

  -- Is it one now?
  if new.status = 'published'
     and new.summary is not null
     and new.summary <> ''
     and not v_was_live
  then
    select coalesce(results_published, false) into v_voting_closed
      from public.voting_windows
     where match_id = new.match_id;

    if coalesce(v_voting_closed, false) then
      perform public.call_send_vote_notifications(new.match_id, 'results');
    else
      raise notice 'results_notify_report_live: voting still open for match %, deferring push', new.match_id;
    end if;
  end if;
  return new;
end;
$$;

-- The trigger was AFTER INSERT OR UPDATE **OF summary** (mig 056). The
-- publish event is now a pure status flip with the summary already on file,
-- which that column list would not fire on. Widen it to status as well.
drop trigger if exists results_notify_report_live_trg on public.results;
create trigger results_notify_report_live_trg
  after insert or update of summary, status on public.results
  for each row execute function public.results_notify_report_live();

-- Voting-close side: only counts a report that is actually published.
create or replace function public.voting_windows_notify_results()
returns trigger
language plpgsql
security definer
as $$
declare
  v_has_report boolean;
begin
  if new.results_published is true
     and (old.results_published is distinct from true) then
    select (summary is not null and summary <> '' and status = 'published')
      into v_has_report
      from public.results
     where match_id = new.match_id;

    if coalesce(v_has_report, false) then
      perform public.call_send_vote_notifications(new.match_id, 'results');
    else
      raise notice 'voting_windows_notify_results: no published report for match %, deferring push', new.match_id;
    end if;
  end if;
  return new;
end;
$$;

-- ── 4. delegates must not be able to publish ──────────────────────────────
-- results_protect_narrative (mig 04x) blanks the narrative columns for
-- non-admin writers so a match-night delegate can enter scorers without
-- touching the report. status is a new narrative-adjacent column and needs
-- the same treatment, otherwise a delegate could flip a draft live.
--
-- On INSERT it is pinned to 'published' rather than the column default:
-- a delegate submitting scorers must stay immediately visible on the Match
-- tab, exactly as it behaves today. Only the generator writes drafts.
create or replace function public.results_protect_narrative()
returns trigger
language plpgsql
security definer
as $$
BEGIN
  IF is_admin() OR auth.role() = 'service_role' OR current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.report_text          := NULL;
    NEW.highlights           := NULL;
    NEW.summary              := NULL;
    NEW.predictions          := NULL;
    NEW.key_highlights       := NULL;
    NEW.team_awards          := NULL;
    NEW.fines_admin          := NULL;
    NEW.banter               := NULL;
    NEW.app_watch            := NULL;
    NEW.player_of_tournament := NULL;
    NEW.conclusion           := NULL;
    NEW.closer               := NULL;
    NEW.status               := 'published';
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.report_text          := OLD.report_text;
    NEW.highlights           := OLD.highlights;
    NEW.summary              := OLD.summary;
    NEW.predictions          := OLD.predictions;
    NEW.key_highlights       := OLD.key_highlights;
    NEW.team_awards          := OLD.team_awards;
    NEW.fines_admin          := OLD.fines_admin;
    NEW.banter               := OLD.banter;
    NEW.app_watch            := OLD.app_watch;
    NEW.player_of_tournament := OLD.player_of_tournament;
    NEW.conclusion           := OLD.conclusion;
    NEW.closer               := OLD.closer;
    NEW.status               := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;
