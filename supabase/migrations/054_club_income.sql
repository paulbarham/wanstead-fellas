-- Club Income — captures income that doesn't fit the sub / WTP / fine
-- shape:
--   * Off-app / pre-app carry-over amounts collected during transitions
--   * One-off spreadsheet fines that pre-date the auto-fine flow
--   * Donations, deposits, prize money, tournament winnings, etc.
--
-- The Club Finances panel folds this into the cash-position calc so
-- the app's balance matches the bank pot. Every entry needs a source
-- + note so the audit trail is clear.

CREATE TABLE IF NOT EXISTS public.club_income (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL,
  source     text NOT NULL CHECK (source IN ('carry_over', 'spreadsheet_fine', 'donation', 'deposit', 'prize', 'other')),
  amount     numeric NOT NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_income_date_idx ON public.club_income (date);
CREATE INDEX IF NOT EXISTS club_income_source_idx ON public.club_income (source);

ALTER TABLE public.club_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY club_income_admin_all ON public.club_income
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.auth_user_id = auth.uid() AND profiles.is_admin = true)
  );

-- Seed the 2026-27 reconciliation entry so the app's balance matches
-- the bank pot on 12 Jul 2026. Comprises: pre-transition carry-over
-- debts settled after 1 Apr + fines tracked on a manual spreadsheet
-- before the auto-fine flow shipped.
INSERT INTO public.club_income (date, source, amount, notes) VALUES
  ('2026-04-01', 'carry_over', 331.00, 'Season-transition reconciliation · off-app carry-over debts + pre-app spreadsheet fines. Aligns app to Wanstead Fellas Treasury bank pot on 12 Jul 2026 (£3,089.10). Cross-checked against every bank transaction from 18 Mar onwards.');
