-- Cup Predictor schema: fixtures + predictions + auto-settle on result entry.
-- See feature primer for the rules. One point per correct outcome. Groups
-- have a 3-way pick (team1 / draw / team2); knockouts have 6 (team_N_90 /
-- team_N_et / team_N_pen, with N in {1,2}). One prediction per fella per
-- match. Locks five minutes before kickoff (enforced at app layer; admin
-- writes still permitted via the admin RLS).

create table if not exists cup_matches (
  id              uuid primary key default gen_random_uuid(),
  -- Stage identifies the round. For group stage we also store group_letter
  -- so we can group fixtures in the UI without parsing strings.
  stage           text not null check (stage in (
    'group_a','group_b','group_c','group_d','group_e','group_f',
    'group_g','group_h','group_i','group_j','group_k','group_l',
    'r32','r16','qf','sf','third_place','final'
  )),
  group_letter    text,
  team1           text not null,
  team2           text not null,
  kickoff         timestamptz not null,
  venue           text,
  is_knockout     boolean not null default false,
  -- For group: 'team1' | 'draw' | 'team2'.
  -- For knockout: 'team1_90' | 'team1_et' | 'team1_pen' | 'team2_*' .
  actual_outcome  text,
  score1          int,
  score2          int,
  created_at      timestamptz not null default now()
);

create index if not exists cup_matches_kickoff_idx on cup_matches(kickoff);
create index if not exists cup_matches_stage_idx on cup_matches(stage);

create table if not exists cup_predictions (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references cup_matches(id) on delete cascade,
  player_id       uuid not null references profiles(id) on delete cascade,
  pick            text not null,
  -- null = unsettled, 0 = wrong, 1 = correct.
  points_awarded  int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists cup_predictions_player_idx on cup_predictions(player_id);
create index if not exists cup_predictions_match_idx on cup_predictions(match_id);

-- Auto-update updated_at on changes
create or replace function set_cup_predictions_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists cup_predictions_updated_at on cup_predictions;
create trigger cup_predictions_updated_at
before update on cup_predictions
for each row execute function set_cup_predictions_updated_at();

-- Settle predictions when actual_outcome is set or changed
create or replace function settle_cup_predictions()
returns trigger language plpgsql security definer as $$
begin
  if new.actual_outcome is not null
     and (old.actual_outcome is distinct from new.actual_outcome) then
    update cup_predictions
       set points_awarded = case when pick = new.actual_outcome then 1 else 0 end
     where match_id = new.id;
  elsif new.actual_outcome is null and old.actual_outcome is not null then
    update cup_predictions set points_awarded = null where match_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists cup_match_settle on cup_matches;
create trigger cup_match_settle
after update of actual_outcome on cup_matches
for each row execute function settle_cup_predictions();

-- RLS
alter table cup_matches     enable row level security;
alter table cup_predictions enable row level security;

drop policy if exists cup_matches_select on cup_matches;
create policy cup_matches_select on cup_matches
  for select using (auth.role() = 'authenticated');

drop policy if exists cup_matches_admin_write on cup_matches;
create policy cup_matches_admin_write on cup_matches
  for all using (is_admin());

drop policy if exists cup_predictions_select on cup_predictions;
create policy cup_predictions_select on cup_predictions
  for select using (auth.role() = 'authenticated');

drop policy if exists cup_predictions_own_insert on cup_predictions;
create policy cup_predictions_own_insert on cup_predictions
  for insert with check (player_id = my_profile_id());

drop policy if exists cup_predictions_own_update on cup_predictions;
create policy cup_predictions_own_update on cup_predictions
  for update using (player_id = my_profile_id());

drop policy if exists cup_predictions_own_delete on cup_predictions;
create policy cup_predictions_own_delete on cup_predictions
  for delete using (player_id = my_profile_id());

drop policy if exists cup_predictions_admin on cup_predictions;
create policy cup_predictions_admin on cup_predictions
  for all using (is_admin());

-- Seed the few fixtures we can confirm from published sources. Admin can
-- add/edit the rest via the Cup admin page.
insert into cup_matches (stage, group_letter, team1, team2, kickoff, venue, is_knockout) values
  ('group_a', 'A', 'Mexico',      'South Africa',  '2026-06-11 20:00:00+00', 'Estadio Azteca, Mexico City',         false),
  ('group_a', 'A', 'South Korea', 'Czechia',       '2026-06-12 03:00:00+00', 'Estadio Akron, Zapopan',              false),
  ('group_b', 'B', 'Canada',      'Bosnia & Herz.','2026-06-12 19:00:00+00', 'BMO Field, Toronto',                  false),
  ('group_b', 'B', 'Qatar',       'Switzerland',   '2026-06-13 19:00:00+00', 'Levi''s Stadium, Santa Clara',        false),
  ('group_c', 'C', 'Brazil',      'Morocco',       '2026-06-13 22:00:00+00', 'MetLife Stadium, East Rutherford',    false),
  ('group_c', 'C', 'Haiti',       'Scotland',      '2026-06-14 01:00:00+00', 'Gillette Stadium, Foxborough',        false),
  ('group_d', 'D', 'United States','Paraguay',     '2026-06-13 01:00:00+00', 'SoFi Stadium, Inglewood',             false)
on conflict do nothing;
