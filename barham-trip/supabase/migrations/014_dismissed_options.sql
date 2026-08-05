-- Admin-removed suggestions from the day-by-day "recommended / suggested plan".
-- The suggestions themselves live in the bundled itinerary.json; this table just
-- records which ones the admin has hidden, per day, so the removal is shared with
-- everyone and can be restored. Keyed by day number + a slug of the option title.
create table if not exists public.dismissed_options (
  id uuid primary key default gen_random_uuid(),
  day_n int not null,
  option_key text not null,
  dismissed_by uuid references public.members(id) on delete set null,
  created_at timestamptz default now(),
  unique (day_n, option_key)
);

alter table public.dismissed_options enable row level security;

drop policy if exists "dismissed read" on public.dismissed_options;
create policy "dismissed read" on public.dismissed_options
  for select using (auth.uid() is not null);

-- Only the admin can hide or restore a suggestion.
drop policy if exists "dismissed insert" on public.dismissed_options;
create policy "dismissed insert" on public.dismissed_options
  for insert with check (
    dismissed_by = auth.uid()
    and exists (select 1 from public.members m where m.id = auth.uid() and m.is_admin)
  );

drop policy if exists "dismissed delete" on public.dismissed_options;
create policy "dismissed delete" on public.dismissed_options
  for delete using (
    exists (select 1 from public.members m where m.id = auth.uid() and m.is_admin)
  );

-- Realtime so a removal/restore reflects on everyone's phones.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dismissed_options'
  ) then
    alter publication supabase_realtime add table public.dismissed_options;
  end if;
end $$;
alter table public.dismissed_options replica identity full;
