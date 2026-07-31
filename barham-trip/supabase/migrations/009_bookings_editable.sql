-- Editable, shared bookings checklist (replaces the static JSON list for the UI).
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  sort int not null default 0,
  checked boolean default false,
  checked_by uuid references public.members(id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz default now()
);

alter table public.bookings enable row level security;

drop policy if exists "bookings read" on public.bookings;
create policy "bookings read" on public.bookings
  for select using (auth.uid() is not null);

drop policy if exists "bookings write" on public.bookings;
create policy "bookings write" on public.bookings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;
alter table public.bookings replica identity full;

-- TEMPLATE seed (only if the table is empty). Replace with your bookings, or
-- just add them in-app once you're signed in.
insert into public.bookings (name, note, sort)
select v.name, v.note, v.sort from (values
  ('Flights', 'Seats, dates, confirmation ref.', 0),
  ('Hotel — First Place', 'Nights, address, ref.', 1),
  ('Travel insurance', 'Family policy covering the whole trip.', 2)
) as v(name, note, sort)
where not exists (select 1 from public.bookings);
