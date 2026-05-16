-- Anonymity-preserving participation counter for the open voting window.
-- votes_own RLS hides other players' votes from the standard client, so this
-- SECURITY DEFINER function returns ONLY aggregate counts (no voter ids).
create or replace function public.voting_participation(p_match_id uuid)
returns table (voted int, eligible int)
language sql
security definer
set search_path = public
as $fn$
  select
    (select count(distinct v.voter_id)::int
       from votes v where v.match_id = p_match_id),
    (select count(distinct tp.player_id)::int
       from team_players tp
       join teams t on t.id = tp.team_id
      where t.match_id = p_match_id);
$fn$;

revoke all on function public.voting_participation(uuid) from public, anon;
grant execute on function public.voting_participation(uuid) to authenticated;
