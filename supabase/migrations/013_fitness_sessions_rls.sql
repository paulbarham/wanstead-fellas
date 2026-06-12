-- ── fitness_sessions read access ─────────────────────────────
-- The fitness_sessions table already exists with RLS enabled but no
-- policies, so the client could not read any rows. Allow authenticated
-- users to SELECT sessions (consistent with how profiles/cards are
-- readable for viewing other players). No client write access is granted.

alter table fitness_sessions enable row level security;

create policy "fitness_sessions_select" on fitness_sessions
  for select using (auth.role() = 'authenticated');
