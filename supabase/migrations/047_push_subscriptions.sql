-- Push subscriptions. One row per (player, browser) — a single player may
-- have multiple entries (phone + laptop + partner's phone if they've logged
-- in there). The edge function fans notifications out to all rows.
--
-- Endpoint is what the browser gives us; we treat it as opaque and never
-- inspect it. p256dh + auth are the encryption keys per the Web Push spec.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_player_idx
  ON public.push_subscriptions (player_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Player can see, create, and delete their own subscriptions
CREATE POLICY push_subscriptions_own_read ON public.push_subscriptions
  FOR SELECT USING (player_id = my_profile_id());

CREATE POLICY push_subscriptions_own_write ON public.push_subscriptions
  FOR INSERT WITH CHECK (player_id = my_profile_id());

CREATE POLICY push_subscriptions_own_delete ON public.push_subscriptions
  FOR DELETE USING (player_id = my_profile_id());

-- Admin can read all (for the eventual admin diagnostics panel)
CREATE POLICY push_subscriptions_admin_read ON public.push_subscriptions
  FOR SELECT USING (is_admin());
