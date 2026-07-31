-- Family-added "things to do" ideas per leg (place). Shared across everyone.
create table if not exists public.trip_ideas (
  id uuid primary key default gen_random_uuid(),
  leg_id text not null,
  title text not null,
  note text,
  added_by uuid references public.members(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.trip_ideas enable row level security;

drop policy if exists "ideas read" on public.trip_ideas;
create policy "ideas read" on public.trip_ideas
  for select using (auth.uid() is not null);

drop policy if exists "ideas insert" on public.trip_ideas;
create policy "ideas insert" on public.trip_ideas
  for insert with check (auth.uid() is not null and added_by = auth.uid());

drop policy if exists "ideas delete own" on public.trip_ideas;
create policy "ideas delete own" on public.trip_ideas
  for delete using (added_by = auth.uid());

-- Realtime so new ideas appear on everyone's phones.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_ideas'
  ) then
    alter publication supabase_realtime add table public.trip_ideas;
  end if;
end $$;
alter table public.trip_ideas replica identity full;
