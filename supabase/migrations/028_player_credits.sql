-- Player credit balance — overpayments and goodwill, separate from fines
-- and wtp_games so the chase math stays clean.
-- Net balance = SUM(unpaid fines + unpaid wtp_games) - SUM(credits.amount)
--   net > 0  → owes money  (red)
--   net < 0  → in credit   (green)
--   net = 0  → all square

CREATE TABLE credits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount      numeric NOT NULL CHECK (amount > 0),
  notes       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX credits_player_idx ON credits(player_id);

ALTER TABLE credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or admin credits" ON credits FOR SELECT
  USING (
    caller_is_admin()
    OR player_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Admin insert credits" ON credits FOR INSERT
  WITH CHECK (caller_is_admin());

CREATE POLICY "Admin update credits" ON credits FOR UPDATE
  USING (caller_is_admin());

CREATE POLICY "Admin delete credits" ON credits FOR DELETE
  USING (caller_is_admin());

GRANT SELECT ON credits TO authenticated;
GRANT INSERT, UPDATE, DELETE ON credits TO authenticated;
