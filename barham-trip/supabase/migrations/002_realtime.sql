-- Enable Postgres realtime for the two shared tables so the family panel and
-- the bookings list update live across everyone's phones.
alter publication supabase_realtime add table public.booking_status;
alter publication supabase_realtime add table public.day_rsvp;

-- REPLICA IDENTITY FULL so realtime payloads include the full row (needed for
-- our client to read booking_key / member_id on updates).
alter table public.booking_status replica identity full;
alter table public.day_rsvp replica identity full;
