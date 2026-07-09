-- Penalty shootouts for drawn fixtures (World Cup spirit, introduced July 2026).
--
-- Any fixture that finishes level — including a genuine 0-0 — goes to a penalty
-- shootout. The shootout winner takes a single bonus point in the standings, so
-- a drawn fixture pays 1 pt to both teams + 1 bonus to the shootout winner
-- (winner finishes on 2, loser on 1). A regulation win is still worth 3.
--
-- Penalties are NOT goals: no per-player shootout data is captured, so top-scorer
-- stats are untouched. They may inform MOTM/DOTD voting, but that stays free-form.
--
--   shootout_winner = 1    team1 won the shootout
--   shootout_winner = 2    team2 won the shootout
--   shootout_winner = null no shootout (fixture wasn't a draw, or not recorded)
alter table public.fixtures
  add column if not exists shootout_winner smallint
  check (shootout_winner is null or shootout_winner in (1, 2));
