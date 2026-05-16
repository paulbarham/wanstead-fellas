-- Migration 007: Phase 3 — MOTM/DOTD voting compute + RLS corrections.
-- The Phase 3 tables/views (goals, votes, award_results, voting_windows,
-- top_scorers, appearances) were applied directly to the project earlier;
-- this migration adds the behaviour layer on top of them.

-- 1. Fix votes RLS: this app maps auth users to profiles via
--    profiles.auth_user_id, so a player's profile id != auth.uid().
--    The original policy (voter_id = auth.uid()) blocked all vote I/O.
drop policy if exists votes_own on public.votes;
create policy votes_own on public.votes
  for all
  using (voter_id = public.my_profile_id())
  with check (voter_id = public.my_profile_id());

-- 2. Admin write paths (consistent with team_players tp_admin_write).
drop policy if exists voting_windows_admin_write on public.voting_windows;
create policy voting_windows_admin_write on public.voting_windows
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists award_results_admin_write on public.award_results;
create policy award_results_admin_write on public.award_results
  for all using (public.is_admin()) with check (public.is_admin());

-- 3. Scheduled result computation. SECURITY DEFINER so it can write
--    award_results / voting_windows regardless of RLS. Idempotent and
--    DST-safe: only acts on windows whose closes_at has passed.
create or replace function public.compute_award_results()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  w record;
  a text;
  max_count int;
  total int;
  shared boolean;
begin
  for w in
    select match_id from voting_windows
    where closes_at <= now() and results_published = false
  loop
    -- An admin override already exists: respect it, just mark published.
    if exists (select 1 from award_results where match_id = w.match_id) then
      update voting_windows set results_published = true where match_id = w.match_id;
      continue;
    end if;

    foreach a in array array['motm','dotd'] loop
      select count(*) into total from votes
        where match_id = w.match_id and award_type = a;
      if total = 0 then
        continue;
      end if;

      select max(c) into max_count from (
        select count(*) c from votes
        where match_id = w.match_id and award_type = a
        group by nominee_id
      ) t;

      select (count(*) > 1) into shared from (
        select nominee_id from votes
        where match_id = w.match_id and award_type = a
        group by nominee_id having count(*) = max_count
      ) t;

      insert into award_results
        (match_id, award_type, player_id, vote_count, total_votes, is_shared, is_admin_override)
      select w.match_id, a, nominee_id, max_count, total, shared, false
      from votes
      where match_id = w.match_id and award_type = a
      group by nominee_id
      having count(*) = max_count;
    end loop;

    update voting_windows set results_published = true where match_id = w.match_id;
  end loop;
end;
$fn$;

-- Safe to expose: only ever publishes results for windows already closed,
-- so it doubles as a client-side backstop if the cron is ever disabled.
revoke all on function public.compute_award_results() from public, anon;
grant execute on function public.compute_award_results() to authenticated;

-- 4. Admin-only vote breakdown. The votes_own policy keeps the standard
--    path anonymous; admins read full data only through this gated
--    SECURITY DEFINER function (spec's anonymity exception).
create or replace function public.admin_vote_breakdown(p_match_id uuid)
returns table (
  award_type text,
  voter_id uuid,
  voter_name text,
  nominee_id uuid,
  nominee_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $fn$
  select v.award_type,
         v.voter_id,
         vp.name || ' ' || vp.surname,
         v.nominee_id,
         np.name || ' ' || np.surname,
         v.created_at
  from votes v
  join profiles vp on vp.id = v.voter_id
  join profiles np on np.id = v.nominee_id
  where v.match_id = p_match_id
    and public.is_admin();
$fn$;

revoke all on function public.admin_vote_breakdown(uuid) from public, anon;
grant execute on function public.admin_vote_breakdown(uuid) to authenticated;

-- 5. Schedule: every 10 minutes, publish any just-closed window.
create extension if not exists pg_cron;

do $cron$
begin
  perform cron.unschedule('compute-award-results');
exception when others then null;
end
$cron$;

select cron.schedule(
  'compute-award-results',
  '*/10 * * * *',
  $cron$ select public.compute_award_results(); $cron$
);
