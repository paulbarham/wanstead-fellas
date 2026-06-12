-- ── Let players add their own match-fitness sessions ─────────────────────────
-- The SELECT policy (013) lets any authenticated user read sessions. To support
-- self-serve tracking (manual entry + TCX/GPX upload parsed client-side), add
-- write policies scoped to the caller's OWN profile, a linked child they manage,
-- or admin. Mirrors the votes_own / avatars ownership shape using the existing
-- my_profile_id() and is_admin() helpers. Reads stay open; writes stay locked
-- to the owner so nobody can fabricate another player's data.

create or replace function public.owns_fitness_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_profile_id = public.my_profile_id()
    or exists (
      select 1 from public.linked_profiles
      where parent_id = public.my_profile_id()
        and child_id = p_profile_id
    )
    or public.is_admin();
$$;

drop policy if exists fitness_sessions_insert on public.fitness_sessions;
create policy fitness_sessions_insert on public.fitness_sessions
  for insert
  with check (public.owns_fitness_profile(profile_id));

drop policy if exists fitness_sessions_update on public.fitness_sessions;
create policy fitness_sessions_update on public.fitness_sessions
  for update
  using (public.owns_fitness_profile(profile_id))
  with check (public.owns_fitness_profile(profile_id));

drop policy if exists fitness_sessions_delete on public.fitness_sessions;
create policy fitness_sessions_delete on public.fitness_sessions
  for delete
  using (public.owns_fitness_profile(profile_id));
