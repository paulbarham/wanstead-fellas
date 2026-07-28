-- Correct the ordered-triple markets to score 3 exact / 1 partial per slot.
--
-- Migration 064 seeded the market rows without setting points_per_exact,
-- so they inherited the schema default (10) from mig 063. That was
-- correct for the four single-pick markets but wrong for the three
-- triple-pick markets (top4_others, relegated, championship_promoted),
-- which the design + help_text described as "3 pts exact, 1 pt right
-- club wrong slot". User flagged the mismatch on 28 Jul when the
-- "10/1 pts" label appeared in the UI.
--
-- Correcting the DB in place — no predictions have been settled yet.
--
-- After this migration:
--   Singles:      PL Winner 10 · Golden Boot 10 · Playmaker 15 · First Sacked 10
--   Triples:      Top 4 Others · Relegated · Champ Promoted → 3 exact / 1 partial
--   Season max:   10 + 10 + 15 + 10 + 3*(3+3+3) = 45 + 27 = 72 pts

update public.season_card_markets
   set points_per_exact = 3
 where num_picks = 3;
