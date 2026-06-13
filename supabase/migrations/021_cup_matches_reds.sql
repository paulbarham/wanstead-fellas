-- Track red cards per fixture per team so the sweepstake's Most Reds prize
-- can be fully automated. Counts are populated by cup-results-sync which
-- fetches /v4/matches/{id} for each finished fixture (the list endpoint
-- doesn't include card-level data) and tallies RED + YELLOW_RED bookings.
--
-- cards_synced_at lets the cron skip matches we've already processed —
-- once a match is FINISHED, no more cards happen, so a single fetch is
-- enough. Re-fetch only if the row is updated back to a non-final state
-- (admins can clear this column manually if they suspect bad data).

alter table public.cup_matches
  add column if not exists reds1 int not null default 0,
  add column if not exists reds2 int not null default 0,
  add column if not exists cards_synced_at timestamptz;

create index if not exists cup_matches_cards_unsynced_idx
  on public.cup_matches (id)
  where cards_synced_at is null and actual_outcome is not null;
