-- Delegate role: `can_enter_results`
--
-- Adds a narrow delegate permission so a trusted non-admin (currently Ross
-- Marks) can enter full-time scores and goal scorers without picking up the
-- rest of the admin surface (player edits, finance, families, feedback,
-- cup-admin, fines, profile overrides, etc).
--
-- The score-entry surface (AdminMatchEntry.tsx) writes to four tables:
--   fixtures · goals · results · matches.status
--
-- Strategy:
--   * Helper `can_manage_results()` = is_admin() OR profiles.can_enter_results
--   * Replace the catch-all admin_write policy on fixtures/goals/results to
--     check `can_manage_results()` instead of `is_admin()` — these tables are
--     entirely about a single match's outcome, so parity with admin is fine.
--   * For `matches`, KEEP admin-only write for INSERT/DELETE (creating and
--     deleting matches is a publish/admin concern) and add a separate UPDATE
--     policy for delegates so they can flip status='completed' on save.
--
-- The result: Ross can save a result against tonight's match via the existing
-- AdminMatchEntry UI. He cannot create matches, delete them, edit profiles,
-- assign fines, manage the cup, or see the /admin dashboard (those gates
-- still check is_admin only in the React layer).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_enter_results boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.can_enter_results IS
  'Delegate permission: enter full-time scores and goal scorers (writes to fixtures, goals, results, and matches.status). Does NOT grant any other admin capability.';

CREATE OR REPLACE FUNCTION can_manage_results()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_admin() OR COALESCE(
    (SELECT can_enter_results FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1),
    false
  );
$$;

-- Replace admin_write on fixtures / goals / results
DROP POLICY IF EXISTS fixtures_admin_write ON fixtures;
CREATE POLICY fixtures_admin_write ON fixtures FOR ALL TO authenticated
  USING (can_manage_results())
  WITH CHECK (can_manage_results());

DROP POLICY IF EXISTS goals_admin_write ON goals;
CREATE POLICY goals_admin_write ON goals FOR ALL TO authenticated
  USING (can_manage_results())
  WITH CHECK (can_manage_results());

DROP POLICY IF EXISTS results_admin_write ON results;
CREATE POLICY results_admin_write ON results FOR ALL TO authenticated
  USING (can_manage_results())
  WITH CHECK (can_manage_results());

-- matches: keep admin_write (covers INSERT/DELETE), add UPDATE-only for delegates
-- (RLS uses OR semantics across policies, so admin still gets full access)
CREATE POLICY matches_results_update ON matches FOR UPDATE TO authenticated
  USING (can_manage_results())
  WITH CHECK (can_manage_results());

-- Grant Ross Marks the delegate permission
UPDATE profiles
SET can_enter_results = true
WHERE LOWER(TRIM(name || ' ' || COALESCE(surname,''))) = 'ross marks';
