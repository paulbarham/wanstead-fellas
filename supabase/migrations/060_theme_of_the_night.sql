-- Theme of the Night Award — a themed third award alongside MOTM and DOTD.
--
-- Concept: admin sets a per-match theme prompt (e.g. "Kevin Keegan tribute",
-- "Most Ronaldinho moment", "Peak dad-strength"). Voting rules identical to
-- MOTM/DOTD — same ballot open at match publish, close 10am Fri, top vote
-- wins. If no theme_prompt is set for a match, the award simply doesn't
-- appear that week (voting UI hides the row, compute_award_results skips).
--
-- Storage:
--   * matches.theme_prompt: nullable text — the prompt shown on the ballot
--     and in the results view. Nullable so historical matches (and any
--     future week where admin doesn't set one) just don't have the award.
--   * votes.award_type / award_results.award_type: enum values extended to
--     include 'theme'. compute_award_results already loops the array of
--     award types; adding 'theme' surfaces it through the whole flow.

alter table public.matches
  add column if not exists theme_prompt text;

comment on column public.matches.theme_prompt is
  'Free-text prompt for the Theme of the Night Award ballot. NULL = no theme award this week.';

-- Extend the votes constraint
alter table public.votes drop constraint if exists votes_award_type_check;
alter table public.votes add constraint votes_award_type_check
  check (award_type = any (array['motm'::text, 'dotd'::text, 'theme'::text]));

-- Extend the award_results constraint
alter table public.award_results drop constraint if exists award_results_award_type_check;
alter table public.award_results add constraint award_results_award_type_check
  check (award_type = any (array['motm'::text, 'dotd'::text, 'theme'::text]));

-- Update compute_award_results to include 'theme' in its tally loop.
-- Whole function replaced so future readers see the full flow in one place.
create or replace function public.compute_award_results()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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
    -- Admin override already exists: respect it, just mark published.
    if exists (select 1 from award_results where match_id = w.match_id) then
      update voting_windows set results_published = true where match_id = w.match_id;
      continue;
    end if;

    -- Loop all three award types. 'theme' produces no rows if nobody voted
    -- (common when admin didn't set a theme_prompt for the match) — the
    -- inner select ... having count(*) = max_count with total = 0 skip
    -- handles that cleanly.
    foreach a in array array['motm','dotd','theme'] loop
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
$$;
