-- Feature-interest event log — lightweight click tracker for gauging
-- appetite before we build a feature. Purpose-built for the Predictor
-- shell rollout (24 Jul 2026): Match of the Week and Season Card land
-- as "coming soon" tiles inside the Predictor tab. We want a real read
-- on how many distinct fellas click into them before we commit build
-- budget to the actual game logic.
--
-- Kept deliberately generic (event text column) so future soft-launches
-- can reuse the same table without a schema change per feature. Query
-- via SQL for now; no admin UI planned.
--
--   event examples: 'predictor.mow.view', 'predictor.season.view'

create table if not exists public.feature_interest_events (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid references public.profiles(id) on delete set null,
  event       text not null,
  created_at  timestamptz not null default now()
);

create index if not exists feature_interest_events_event_idx
  on public.feature_interest_events (event, created_at desc);
create index if not exists feature_interest_events_player_idx
  on public.feature_interest_events (player_id);

alter table public.feature_interest_events enable row level security;

-- Authenticated players may INSERT their own events (for their own player_id).
-- Nobody but the service role (used by admin SQL) reads — this is telemetry,
-- not something we surface back to the player themselves.
create policy feature_interest_events_insert_own
  on public.feature_interest_events
  for insert
  to authenticated
  with check (
    player_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.feature_interest_events is
  'Lightweight click/view telemetry for coming-soon features. Query via SQL for demand signal; no public read policy.';
