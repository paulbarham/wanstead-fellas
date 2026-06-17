-- Final guard for the per-match sign-up cap.
--
-- The client computes `signedUpCount < SIGNUP_CAP` and routes new sign-ups
-- to either 'confirmed' or 'waiting' accordingly. With multiple players
-- tapping in close succession (each holding a slightly stale snapshot of
-- the list) it's possible for two of them to both believe a slot is free
-- and both end up confirmed — pushing the count past 32. Hit this on
-- 2026-06-17 with Gary + Corin landing at 34 confirmed / 0 waiting.
--
-- This trigger is a server-side backstop: any insert or update that would
-- leave more than 32 confirmed rows for a given match_date silently flips
-- the new row to 'waiting'. No exception, so the client's optimistic
-- update doesn't error out — the subsequent fetchData() refresh just shows
-- the row as waiting, which is the correct state.
--
-- Bump-then-insert (the wtp_priority / subscribed signup paths) still
-- works because the UPDATE that demotes a wtp to waiting completes before
-- the INSERT runs, so the trigger sees the lower count and allows the
-- confirmed status through.

create or replace function enforce_signup_confirmed_cap()
returns trigger
language plpgsql
as $$
declare
  cap constant int := 32;
  current_confirmed int;
begin
  if new.status <> 'confirmed' then return new; end if;
  -- Exclude this row from the count when it's an UPDATE so changing
  -- something other than status doesn't double-count.
  select count(*) into current_confirmed
    from availability
    where match_date = new.match_date
      and status = 'confirmed'
      and (TG_OP = 'INSERT' or id <> new.id);
  if current_confirmed >= cap then
    new.status := 'waiting';
  end if;
  return new;
end;
$$;

drop trigger if exists availability_enforce_cap on public.availability;
create trigger availability_enforce_cap
  before insert or update on public.availability
  for each row execute function enforce_signup_confirmed_cap();
