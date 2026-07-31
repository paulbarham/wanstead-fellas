-- Enable Postgres realtime for the two shared tables so the family panel and
-- the bookings list update live across everyone's phones. Guarded so re-running
-- doesn't error on "table already in publication".
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_status'
  ) then
    alter publication supabase_realtime add table public.booking_status;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_rsvp'
  ) then
    alter publication supabase_realtime add table public.day_rsvp;
  end if;
end $$;

-- REPLICA IDENTITY FULL so realtime payloads include the full row (needed for
-- our client to read booking_key / member_id on updates).
alter table public.booking_status replica identity full;
alter table public.day_rsvp replica identity full;
