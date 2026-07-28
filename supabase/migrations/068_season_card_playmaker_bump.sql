-- Bump the Playmaker (most_assists) market to 15 pts.
--
-- Original scoring in mig 063/064 set every single-pick market to
-- points_per_exact = 10. On review with the admin (28 Jul 2026), the
-- Playmaker market is meaningfully harder to call than PL Winner or
-- Golden Boot — no obvious favourite year to year, and the assists
-- race swings on late-season form / setpiece changes. Rewarding the
-- harder call with a bigger payoff.
--
-- All other markets unchanged:
--   PL Winner        10 pts
--   Top 4 Others      3/1 pts per slot (max 9)
--   Relegated         3/1 pts per slot (max 9)
--   Golden Boot      10 pts
--   Playmaker        15 pts ← this migration
--   First Sacked     10 pts
--   Champ Promoted    3/1 pts per slot (max 9)
--   New max: 72 pts (was 67)

update public.season_card_markets
   set points_per_exact = 15
 where key = 'most_assists';
