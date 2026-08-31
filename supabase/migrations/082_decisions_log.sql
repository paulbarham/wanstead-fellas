-- Decisions log — v1
--
-- Append-only record of the admin decisions that shape the group:
-- half-sub arrangements, house-rule changes, dispute resolutions,
-- roster bans, finance one-offs. Currently these live in CLAUDE.md's
-- "Known data quirks" section that nobody except Claude touches; when
-- the admin baton passes, the new person has zero context.
--
-- effective_from / effective_to are first-class columns so subscription
-- arrangements (which change season-to-season) survive re-seeds and
-- house rules can be retired without losing the history.
--
-- Categories:
--   subs         — Felix shares Guy's sub, half-subs, mid-season joiners
--   house_rules  — no slide tackles, fine ladder, 9:10pm cutoff, etc.
--   disputes     — resolution notes
--   roster       — bans, half-year sub-outs
--   finance      — block-start cutoffs, credit adjustments, pitch rate changes
--   other        — anything that doesn't fit
--
-- Follow-ups (separate roadmap rows):
--   * Seed migration from CLAUDE.md quirks (populate historical rows)
--   * Public house rules derived view at /help/house-rules
--   * Auto-generated admin baton handover PDF from the log

CREATE TABLE IF NOT EXISTS public.decisions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decided_at         timestamptz NOT NULL DEFAULT now(),
  decided_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category           text NOT NULL CHECK (category IN (
                       'subs','house_rules','disputes','roster','finance','other'
                     )),
  summary            text NOT NULL,
  details            text,
  related_player_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  effective_from     date,
  effective_to       date,
  archived           boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.decisions IS
  'Append-only log of admin decisions. Effective_from/to particularly matters for subs (arrangements change season-to-season, mid-season joiners get prorated periods).';

CREATE INDEX IF NOT EXISTS decisions_category_active_idx
  ON public.decisions (category) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS decisions_effective_idx
  ON public.decisions (effective_from, effective_to);
CREATE INDEX IF NOT EXISTS decisions_related_player_idx
  ON public.decisions (related_player_id) WHERE related_player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS decisions_decided_at_idx
  ON public.decisions (decided_at DESC);

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

-- Public read for currently-effective house rules only.
-- Powers /help/house-rules (deferred to a follow-up ship).
CREATE POLICY decisions_read_house_rules ON public.decisions
  FOR SELECT
  USING (
    category = 'house_rules'
    AND NOT archived
    AND (effective_to IS NULL OR effective_to > current_date)
  );

-- Admin full read.
CREATE POLICY decisions_admin_read ON public.decisions
  FOR SELECT
  USING (is_admin());

-- Admin insert.
CREATE POLICY decisions_admin_insert ON public.decisions
  FOR INSERT
  WITH CHECK (is_admin());

-- Admin update within a 24h grace window (typos, wrong dates).
-- After that the row is frozen — the audit trail is the point.
CREATE POLICY decisions_admin_update_grace ON public.decisions
  FOR UPDATE
  USING (is_admin() AND created_at > now() - interval '24 hours')
  WITH CHECK (is_admin() AND created_at > now() - interval '24 hours');

-- No delete policy — deliberately. To retire a decision, set archived=true
-- during the grace window (or add a NEW decision superseding it).


-- ─────────────────────────────────────────────────────────────────────
-- club_subscriptions.decision_id — link each sub row to its
-- originating decision. "Why does Aaron pay £47.50" becomes one join
-- away instead of buried in notes.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.club_subscriptions
  ADD COLUMN IF NOT EXISTS decision_id uuid
    REFERENCES public.decisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS club_subscriptions_decision_idx
  ON public.club_subscriptions (decision_id) WHERE decision_id IS NOT NULL;

COMMENT ON COLUMN public.club_subscriptions.decision_id IS
  'FK to the decisions row that established this sub arrangement (half-sub, shared sub, mid-season proration). Null for standard £95/season rows.';
