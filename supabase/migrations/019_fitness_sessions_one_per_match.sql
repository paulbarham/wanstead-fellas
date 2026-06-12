-- One fitness session per player per match. A second upload (e.g. uploading
-- Polar after GPX, or re-importing a corrected file) now upserts onto the
-- existing row rather than stacking, so the Match Fitness panel and the
-- Distance/Game leaderboard don't double-count distance for the same night.
--
-- Safe to add: a precheck confirmed no existing (profile_id, match_date)
-- duplicates in prod.

create unique index if not exists fitness_sessions_profile_match_unique
  on public.fitness_sessions (profile_id, match_date);
