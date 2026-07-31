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

-- Seed with the current list (only if the table is empty). Notes mirror the
-- original data/itinerary.json bookings; edit freely in-app from here on.
insert into public.bookings (name, note, sort)
select v.name, v.note, v.sort from (values
  ('Flights — LHR → San Francisco / Las Vegas → LHR', 'Six seats. Open-jaw: fly into SFO, home from LAS. Confirm seat allocation for the family together.', 0),
  ('ESTA visa waivers ×6', 'One per traveller including the twins. Apply at least 72 hours before flying; print or screenshot the approvals.', 1),
  ('Rental car — 7-seater SUV', '22-day hire, SFO pickup / LAS drop-off (one-way fee applies). Two booster seats for the twins.', 2),
  ('Travel insurance — family policy', 'Full family cover including the theme-park and Grand Canyon activities and US medical.', 3),
  ('San Francisco hotel — 5 nights', '8–12 Aug. Near the Wharf / Embarcadero for walkability. Family room or two connecting.', 4),
  ('Alcatraz cruise tickets', 'Day 3. Sells out weeks ahead — book as early as possible. Departs Pier 33.', 5),
  ('Muir Woods parking / shuttle reservation', 'Day 4. Timed reservation mandatory — no turn-ups. Book the parking or the shuttle in advance.', 6),
  ('Monterey Bay Aquarium tickets', 'Day 6. Dated online tickets are cheaper and skip the queue.', 7),
  ('Hearst Castle tour', 'Day 8. Timed tour bus from the visitor centre — must be pre-booked.', 8),
  ('Big Sur / Cambria hotel — 1 night', '15 Aug in Cambria or San Simeon. Books out early in summer along this stretch.', 9),
  ('Santa Monica hotel — 4 nights', '16–20 Aug. Walkable to the pier and beach path.', 10),
  ('Universal Studios Hollywood tickets', 'Day 12. Dated tickets; consider the Express pass for August crowds.', 11),
  ('Los Angeles hotel — 5 nights', '20–25 Aug. Central-ish base with parking and a pool for the down-days.', 12),
  ('Disneyland tickets + park reservation', 'Day 15. Needs BOTH a dated ticket and a park reservation. Set up Genie+ the night before.', 13),
  ('Six Flags Magic Mountain tickets', 'Day 17. Buy online in advance; the teens'' day.', 14),
  ('Las Vegas hotel — 4 nights', '25–29 Aug. Family-friendly Strip resort with a big pool complex.', 15),
  ('Grand Canyon West day tour', 'Day 21. Book the Skywalk / West Rim package and confirm the pickup or self-drive parking.', 16),
  ('Las Vegas Raiders tickets', 'NFL game at Allegiant Stadium, Las Vegas — check the August fixtures fall within our Vegas dates (26–29 Aug) and book seats together.', 17)
) as v(name, note, sort)
where not exists (select 1 from public.bookings);
