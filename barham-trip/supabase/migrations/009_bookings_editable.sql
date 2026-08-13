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
  ('Hotel Julian — San Francisco', '8–12 Aug (4 nights).', 4),
  ('Alcatraz cruise tickets', 'Sells out weeks ahead — book as early as possible. Departs Pier 33.', 5),
  ('Muir Woods parking / shuttle reservation', 'Timed reservation mandatory — no turn-ups. Book the parking or the shuttle in advance.', 6),
  ('Hampton Inn San Simeon, Cambria', '12–13 Aug (1 night).', 9),
  ('Days Inn by Wyndham Santa Monica', '13–14 Aug (1 night).', 10),
  ('Hampton Inn & Suites Santa Monica', '14–16 Aug (2 nights).', 11),
  ('Universal Studios Hollywood tickets', 'Dated tickets; consider the Express pass for August crowds.', 12),
  ('SpringHill Suites LA Burbank/Downtown', '16–23 Aug (7 nights).', 13),
  ('Disneyland tickets + park reservation', 'Needs BOTH a dated ticket and a park reservation. Set up Genie+ the night before.', 14),
  ('Six Flags Magic Mountain tickets', 'Buy online in advance; the teens'' day.', 15),
  ('W Las Vegas', '23–24 Aug (1 night).', 16),
  ('Luxor Hotel & Casino', '24–29 Aug (5 nights).', 17),
  ('Grand Canyon West day tour', 'Book the Skywalk / West Rim package and confirm the pickup or self-drive parking.', 18),
  ('LAFC vs San Diego FC tickets ×6', 'MLS regular season: Sat 15 Aug 2026, 7:30 PM PT, BMO Stadium (Los Angeles). Son Heung-min''s LAFC host San Diego FC. Book asap — Son fixtures are selling fast. Starts ~$52 pp on TickPick; officially via Ticketmaster. Uber from Santa Monica (~25-30 min).', 19),
  ('Las Vegas Raiders vs 49ers tickets ×2', 'NFL preseason Week 3: Thu 27 Aug 2026, 5:00 PM PT, Allegiant Stadium. Paul + Amelia only. On sale via Ticketmaster (official) — resale on StubHub / TickPick / Gametime usually cheaper for preseason. Budget $150–300 for 2 lower-bowl seats; can wait ~1 week out for prices to drop.', 20)
) as v(name, note, sort)
where not exists (select 1 from public.bookings);
