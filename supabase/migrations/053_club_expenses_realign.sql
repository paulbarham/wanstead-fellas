-- Realign club_expenses to match how pitch hire is actually invoiced:
-- one MONTHLY invoice covering all Thursdays that month, at £67.80 per
-- Thursday (not the £70.17 per-match figure I originally guessed). Also
-- adds pre-season equipment (10× footballs, 26 Mar 2026) which wasn't in
-- the v1 model at all.
--
-- Consequences:
--   1. Drop the per-match auto-gen trigger — the per-match granularity
--      doesn't match how the invoice arrives; it's confusing to have two
--      overlapping models.
--   2. Wipe the auto-generated per-match rows and replace with actual
--      monthly invoice rows (one per month, matching bank withdrawals).
--   3. Equipment rows will be added ad-hoc going forward via the admin
--      "Add expense" form (lands in the same commit as this migration).

-- ─── 1. Drop the per-match auto-gen trigger + function ─────────────
DROP TRIGGER IF EXISTS matches_autogen_pitch_expense_trg ON public.matches;
DROP FUNCTION IF EXISTS public.autogen_pitch_expense;

-- ─── 2. Wipe the auto-generated per-match pitch rows ───────────────
DELETE FROM public.club_expenses
WHERE category = 'pitch_hire' AND match_id IS NOT NULL;

-- ─── 3. Insert the actual monthly pitch invoices (2026-27 season) ──
-- Amounts from bank withdrawals (Paul's personal account, reimbursed
-- via subs collected). Paid dates match the withdrawal.
INSERT INTO public.club_expenses (date, category, amount, notes, paid, paid_at) VALUES
  ('2026-04-03', 'pitch_hire', 339.00, 'April pitch hire · 5 Thursdays × £67.80', true, '2026-04-03'),
  ('2026-05-05', 'pitch_hire', 271.20, 'May pitch hire · 4 Thursdays × £67.80',   true, '2026-05-05'),
  ('2026-06-01', 'pitch_hire', 271.20, 'June pitch hire · 4 Thursdays × £67.80',  true, '2026-06-01'),
  ('2026-07-03', 'pitch_hire', 339.00, 'July pitch hire · 5 Thursdays × £67.80',  true, '2026-07-03');

-- ─── 4. Pre-season equipment ───────────────────────────────────────
-- 10× match balls purchased 26 Mar 2026 for the start of the 2026-27
-- season. Dated 1 Apr in the app to sit inside the season window; the
-- notes preserve the actual purchase date for the audit trail.
INSERT INTO public.club_expenses (date, category, amount, notes, paid, paid_at) VALUES
  ('2026-04-01', 'equipment', 81.00, '10× footballs — purchased 26 Mar for start of season', true, '2026-03-26');
