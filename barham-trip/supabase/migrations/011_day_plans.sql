-- Family-curated activities slotted onto a specific day's itinerary. Shared and
-- collaborative: anyone can add an activity to a day, tick it off, or remove one
-- the group decides against. Separate from the static seed suggestions in the
-- bundled itinerary.json — this is the plan the family actually builds.
create table if not exists public.day_plans (
  id uuid primary key default gen_random_uuid(),
  day_n int not null,
  title text not null,
  note text,
  done boolean not null default false,
  added_by uuid references public.members(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.day_plans enable row level security;

drop policy if exists "day_plans read" on public.day_plans;
create policy "day_plans read" on public.day_plans
  for select using (auth.uid() is not null);

-- Insert as yourself; anyone in the family can then tick or remove it (the plan
-- is a shared decision).
drop policy if exists "day_plans insert" on public.day_plans;
create policy "day_plans insert" on public.day_plans
  for insert with check (auth.uid() is not null and added_by = auth.uid());

drop policy if exists "day_plans update" on public.day_plans;
create policy "day_plans update" on public.day_plans
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "day_plans delete" on public.day_plans;
create policy "day_plans delete" on public.day_plans
  for delete using (auth.uid() is not null);

-- Realtime so plan changes appear on everyone's phones.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_plans'
  ) then
    alter publication supabase_realtime add table public.day_plans;
  end if;
end $$;
alter table public.day_plans replica identity full;
