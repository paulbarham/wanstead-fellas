-- World Cup Sweepstake (paper-list digitisation)
--
-- Independent from the Cup Predictor — separate tables, separate UI surface.
-- The Predictor scores one point per correct outcome pick; the sweepstake
-- tracks who owns which teams in the £240 pool with 4 prizes:
--   Winner (£60) · Runner-up (£30) · Most Conceded (£20) · Most Reds (£10)
-- plus £120 ring-fenced for charity.
--
-- Tables:
--   cup_sweepstake_entries   one row per (player, team) ownership
--   cup_sweepstake_team_status  per-team alive/eliminated + GA/reds tallies
--
-- GA is also computable from cup_matches but only covers the small subset of
-- fixtures we've seeded. The team_status table holds admin-editable values
-- so the sweepstake remains accurate without needing every fixture in
-- cup_matches.

create table if not exists cup_sweepstake_entries (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references profiles(id) on delete set null,
  -- The handwritten name on the paper sweep ("Bill", "Paul B", "Tom-Bro").
  -- Kept separate from profile so we can include fellas without app accounts.
  sweep_name  text not null,
  team_name   text not null,
  stake       int not null default 5,
  created_at  timestamptz not null default now(),
  unique (sweep_name, team_name)
);

create index if not exists cup_sweepstake_entries_team_idx on cup_sweepstake_entries(team_name);
create index if not exists cup_sweepstake_entries_profile_idx on cup_sweepstake_entries(profile_id);

create table if not exists cup_sweepstake_team_status (
  team_name    text primary key,
  status       text not null default 'alive' check (status in (
    'alive', 'group_stage_out', 'r16_out', 'qf_out', 'sf_out',
    'third_place_lost', 'final_lost', 'winner'
  )),
  -- Admin can override the computed GA (from cup_matches). When null we fall
  -- back to whatever cup_matches gives us; when set this wins.
  manual_ga    int,
  manual_reds  int,
  updated_at   timestamptz not null default now()
);

-- Auto-bump updated_at on row update
create or replace function set_cup_sweepstake_team_status_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists cup_sweepstake_team_status_updated_at on cup_sweepstake_team_status;
create trigger cup_sweepstake_team_status_updated_at
before update on cup_sweepstake_team_status
for each row execute function set_cup_sweepstake_team_status_updated_at();

-- RLS: read for any authenticated user, write for admin only
alter table cup_sweepstake_entries enable row level security;
alter table cup_sweepstake_team_status enable row level security;

drop policy if exists cup_sweepstake_entries_select on cup_sweepstake_entries;
create policy cup_sweepstake_entries_select on cup_sweepstake_entries
  for select using (auth.role() = 'authenticated');

drop policy if exists cup_sweepstake_entries_admin on cup_sweepstake_entries;
create policy cup_sweepstake_entries_admin on cup_sweepstake_entries
  for all using (is_admin()) with check (is_admin());

drop policy if exists cup_sweepstake_team_status_select on cup_sweepstake_team_status;
create policy cup_sweepstake_team_status_select on cup_sweepstake_team_status
  for select using (auth.role() = 'authenticated');

drop policy if exists cup_sweepstake_team_status_admin on cup_sweepstake_team_status;
create policy cup_sweepstake_team_status_admin on cup_sweepstake_team_status
  for all using (is_admin()) with check (is_admin());

-- ── Seed the 48 entries from the paper sweep (photo on 2026-06-13) ────────
-- profile_id is resolved via subquery on first+last name where the sweep
-- name maps to an app account. Bill and Tomos have no profile match — left
-- as null so they show by sweep_name only.

insert into cup_sweepstake_entries (profile_id, sweep_name, team_name, stake) values
  ((select id from profiles where name = 'Alan'    and surname = 'Samuels'),    'Alan',      'Canada',          5),
  ((select id from profiles where name = 'Alan'    and surname = 'Samuels'),    'Alan',      'Uruguay',         5),
  (null,                                                                         'Bill',      'Bosnia & Herz.',  5),
  (null,                                                                         'Bill',      'DR Congo',        5),
  (null,                                                                         'Bill',      'Norway',          5),
  (null,                                                                         'Bill',      'United States',   5),
  ((select id from profiles where name = 'Corin'   and surname = 'Davies'),     'Corin',     'Iran',            5),
  ((select id from profiles where name = 'Corin'   and surname = 'Davies'),     'Corin',     'Scotland',        5),
  ((select id from profiles where name = 'David'   and surname = 'Edwards'),    'David E',   'Algeria',         5),
  ((select id from profiles where name = 'David'   and surname = 'Edwards'),    'David E',   'Senegal',         5),
  ((select id from profiles where name = 'Edward'  and surname = 'Ezra'),       'Edd',       'Portugal',        5),
  ((select id from profiles where name = 'Edward'  and surname = 'Ezra'),       'Edd',       'South Korea',     5),
  ((select id from profiles where name = 'Edward'  and surname = 'Ezra'),       'Edd',       'Paraguay',        5),
  ((select id from profiles where name = 'Edward'  and surname = 'Ezra'),       'Edd',       'Iraq',            5),
  ((select id from profiles where name = 'James'   and surname = 'Wilson'),     'James W',   'Colombia',        5),
  ((select id from profiles where name = 'James'   and surname = 'Wilson'),     'James W',   'Jordan',          5),
  ((select id from profiles where name = 'Lawrie'  and surname = 'Pointer'),    'Lawrie',    'Germany',         5),
  ((select id from profiles where name = 'Lawrie'  and surname = 'Pointer'),    'Lawrie',    'Argentina',       5),
  ((select id from profiles where name = 'Neil'    and surname = 'Higgins'),    'Neil',      'Austria',         5),
  ((select id from profiles where name = 'Neil'    and surname = 'Higgins'),    'Neil',      'Ghana',           5),
  ((select id from profiles where name = 'Paul'    and surname = 'Barham'),     'Paul B',    'Curaçao',         5),
  ((select id from profiles where name = 'Paul'    and surname = 'Barham'),     'Paul B',    'Brazil',          5),
  ((select id from profiles where name = 'Paul'    and surname = 'Finch'),      'Paul F',    'Croatia',         5),
  ((select id from profiles where name = 'Paul'    and surname = 'Finch'),      'Paul F',    'Panama',          5),
  ((select id from profiles where name = 'Paul'    and surname = 'Finch'),      'Paul F',    'France',          5),
  ((select id from profiles where name = 'Paul'    and surname = 'Finch'),      'Paul F',    'Japan',           5),
  ((select id from profiles where name = 'Peter'   and surname = 'May'),        'Peter M',   'Morocco',         5),
  ((select id from profiles where name = 'Peter'   and surname = 'May'),        'Peter M',   'England',         5),
  ((select id from profiles where name = 'Phil'    and surname = 'Mowat'),      'Phil',      'Belgium',         5),
  ((select id from profiles where name = 'Phil'    and surname = 'Mowat'),      'Phil',      'New Zealand',     5),
  ((select id from profiles where name = 'Richard' and surname = 'Sharman'),    'Richard',   'South Africa',    5),
  ((select id from profiles where name = 'Richard' and surname = 'Sharman'),    'Richard',   'Netherlands',     5),
  ((select id from profiles where name = 'Sam'     and surname = 'Yeats'),      'Sam Y',     'Australia',       5),
  ((select id from profiles where name = 'Sam'     and surname = 'Yeats'),      'Sam Y',     'Saudi Arabia',    5),
  ((select id from profiles where name = 'Sam'     and surname = 'Yeats'),      'Sam Y',     'Turkey',          5),
  ((select id from profiles where name = 'Sam'     and surname = 'Yeats'),      'Sam Y',     'Ecuador',         5),
  ((select id from profiles where name = 'Scott'   and surname = 'Duncan'),     'Scott',     'Ivory Coast',     5),
  ((select id from profiles where name = 'Scott'   and surname = 'Duncan'),     'Scott',     'Uzbekistan',      5),
  ((select id from profiles where name = 'Stephen' and surname = 'Pender'),     'Stephen P', 'Tunisia',         5),
  ((select id from profiles where name = 'Stephen' and surname = 'Pender'),     'Stephen P', 'Haiti',           5),
  ((select id from profiles where name = 'Stephen' and surname = 'Pender'),     'Stephen P', 'Czechia',         5),
  ((select id from profiles where name = 'Stephen' and surname = 'Pender'),     'Stephen P', 'Switzerland',     5),
  ((select id from profiles where name = 'Tom'     and surname = 'Broughton'),  'Tom Bro',   'Mexico',          5),
  ((select id from profiles where name = 'Tom'     and surname = 'Broughton'),  'Tom Bro',   'Qatar',           5),
  ((select id from profiles where name = 'Tom'     and surname = 'Broughton'),  'Tom Bro',   'Egypt',           5),
  ((select id from profiles where name = 'Tom'     and surname = 'Broughton'),  'Tom Bro',   'Cape Verde',      5),
  (null,                                                                         'Tomos',     'Spain',           5),
  (null,                                                                         'Tomos',     'Sweden',          10)
on conflict (sweep_name, team_name) do nothing;

-- Seed default 'alive' status for every team in the sweep so the UI always
-- has a row to read. GA/reds remain null (treated as 0 / fallback to
-- cup_matches-derived values).
insert into cup_sweepstake_team_status (team_name)
select distinct team_name from cup_sweepstake_entries
on conflict (team_name) do nothing;
