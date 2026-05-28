-- WTP game charges must be unique per (player, match) — the publish flow
-- upserts wtp_games rows when teams are published, relying on a UNIQUE
-- constraint to safely retry without double-charging a player for the same
-- match. The constraint was missing, so the upsert (onConflict:
-- 'player_id,match_date') failed with Postgres 42P10 and the whole publish
-- transaction rolled back. Table is currently empty so no dedupe required.

alter table wtp_games
  add constraint wtp_games_player_match_unique
  unique (player_id, match_date);
