-- Club Finances v1: track the two big flows for club solvency —
--   * Subscription income (subscribed players pay £95/season, Apr → Mar)
--   * Pitch hire expenses (£70.17 per match; auto-generated from matches)
--
-- Extra income streams (WTP, fines) already live in wtp_games / fines and
-- roll up into the same Club Finances P&L view via the app. Extra expense
-- streams (equipment, food, tournament fees, etc.) can be added ad-hoc
-- through the same club_expenses table (category != 'pitch_hire').

-- ─────────────────────────────────────────────────────────────────────
-- 1. Subscriptions — one row per (player, season). Backfilled for all
--    currently-subscribed profiles for the 2026-27 season, all initially
--    unpaid so admin can tick them off.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.club_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season     text NOT NULL,           -- '2026-27' etc.
  amount     numeric NOT NULL DEFAULT 95,
  paid       boolean NOT NULL DEFAULT false,
  paid_at    date,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, season)
);

CREATE INDEX IF NOT EXISTS club_subscriptions_season_idx ON public.club_subscriptions (season);
CREATE INDEX IF NOT EXISTS club_subscriptions_player_idx ON public.club_subscriptions (player_id);

ALTER TABLE public.club_subscriptions ENABLE ROW LEVEL SECURITY;

-- Admin-only for now. If we open committee read access later we can add
-- a can_view_finances profile flag + a matching policy.
CREATE POLICY club_subscriptions_admin_all ON public.club_subscriptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.auth_user_id = auth.uid() AND profiles.is_admin = true)
  );

-- Backfill: seed a row for every currently-subscribed player for 2026-27
-- unless one already exists. All initially unpaid.
INSERT INTO public.club_subscriptions (player_id, season, amount, paid)
SELECT p.id, '2026-27', 95, false
FROM public.profiles p
WHERE p.player_type IN ('subscribed', 'subscribed_priority')
ON CONFLICT (player_id, season) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- 2. Expenses — mostly pitch hire, but the category column lets us
--    log ad-hoc items too (equipment, food, tournament fees).
--
--    Pitch hire rows are auto-created for every match — the app trigger
--    below ensures every past + future completed match has a matching
--    £70.17 pitch_hire row. Admin can still edit / add rows manually
--    for one-offs.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.club_expenses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL,
  category   text NOT NULL CHECK (category IN ('pitch_hire', 'equipment', 'food', 'tournament', 'other')),
  amount     numeric NOT NULL,
  notes      text,
  -- Non-null for auto-generated pitch_hire rows; null for admin-entered
  -- one-offs. UNIQUE ensures the trigger + backfill don't duplicate.
  match_id   uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  paid       boolean NOT NULL DEFAULT false,
  paid_at    date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id)
);

CREATE INDEX IF NOT EXISTS club_expenses_date_idx ON public.club_expenses (date);
CREATE INDEX IF NOT EXISTS club_expenses_category_idx ON public.club_expenses (category);

ALTER TABLE public.club_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY club_expenses_admin_all ON public.club_expenses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.auth_user_id = auth.uid() AND profiles.is_admin = true)
  );

-- Auto-generate a £70.17 pitch_hire row for every new matches row.
CREATE OR REPLACE FUNCTION public.autogen_pitch_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.club_expenses (date, category, amount, notes, match_id, paid)
  VALUES (NEW.match_date, 'pitch_hire', 70.17, 'Auto-generated pitch hire', NEW.id, false)
  ON CONFLICT (match_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_autogen_pitch_expense_trg ON public.matches;
CREATE TRIGGER matches_autogen_pitch_expense_trg
  AFTER INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.autogen_pitch_expense();

-- Backfill: create pitch_hire rows for every match in the current season
-- (Apr 2026 → Mar 2027) that doesn't already have one. Season-specific
-- so we don't accidentally rewrite historic pre-app records if any
-- appear later.
INSERT INTO public.club_expenses (date, category, amount, notes, match_id, paid)
SELECT
  m.match_date, 'pitch_hire', 70.17, 'Auto-generated pitch hire (backfill)', m.id, false
FROM public.matches m
WHERE m.match_date BETWEEN '2026-04-01' AND '2027-03-31'
ON CONFLICT (match_id) DO NOTHING;
