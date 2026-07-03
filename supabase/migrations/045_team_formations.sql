-- Team formations. Once teams are published, any player on the team can
-- pick a shape (e.g. 2-3-1) and drag squadmates onto positions on the
-- pitch. Read-only for non-members; freely editable by anyone in the
-- roster — closest thing we have to a captain flag today.
--
-- Storage shape:
--   shape: '2-3-1' | '3-2-1' | '2-2-2' | ... (defense-mid-att; GK implicit)
--   slots: { gk: <uuid>, def_0: <uuid>, def_1: <uuid>, mid_0: <uuid>, ..., att_0: <uuid> }
-- Missing keys = unassigned slot. Player-ids not in the team's roster are
-- allowed to persist (the UI is client-authoritative) but the fetch layer
-- ignores them and re-suggests.

CREATE TABLE IF NOT EXISTS public.team_formations (
  team_id UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  shape TEXT NOT NULL DEFAULT '2-3-1',
  slots JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.team_formations ENABLE ROW LEVEL SECURITY;

-- Anyone can read; teams and their tactical setup are public info
CREATE POLICY team_formations_public_read ON public.team_formations
  FOR SELECT USING (true);

-- Admins can always write
CREATE POLICY team_formations_admin_write ON public.team_formations
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Team members (or a parent acting for a child on the roster) can write
CREATE POLICY team_formations_member_write ON public.team_formations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_players tp
      WHERE tp.team_id = team_formations.team_id
        AND (
          tp.player_id = my_profile_id()
          OR tp.player_id IN (
            SELECT child_id FROM public.linked_profiles WHERE parent_id = my_profile_id()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_players tp
      WHERE tp.team_id = team_formations.team_id
        AND (
          tp.player_id = my_profile_id()
          OR tp.player_id IN (
            SELECT child_id FROM public.linked_profiles WHERE parent_id = my_profile_id()
          )
        )
    )
  );

-- Bump updated_at on every write
CREATE OR REPLACE FUNCTION public.team_formations_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_formations_touch_updated_at ON public.team_formations;
CREATE TRIGGER team_formations_touch_updated_at
  BEFORE UPDATE ON public.team_formations
  FOR EACH ROW EXECUTE FUNCTION public.team_formations_touch();
