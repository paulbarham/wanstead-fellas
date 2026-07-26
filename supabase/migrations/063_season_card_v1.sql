-- Season Prediction Card — v1 schema.
--
-- Committee-approved Predictor game #2. Seven markets on the domestic
-- season, one card per player. Locks 1h before the first PL kickoff, then
-- reopens for 2 days after the summer transfer window closes so people
-- can rework their picks around who actually signed for whom.
--
-- Markets:
--   pl_winner                 — 1 pick, the champion
--   top4_others               — 3 ordered slots (2nd / 3rd / 4th)
--   relegated                 — 3 ordered slots (18th / 19th / 20th)
--   top_scorer                — 1 pick, PL Golden Boot winner
--   most_assists              — 1 pick, PL playmaker
--   first_sacked              — 1 pick, first PL manager sacked
--   championship_promoted     — 3 ordered slots (Champion / Runner-up / Playoff Winner)
--
-- Scoring:
--   Single-pick markets: 10 pts if correct, 0 otherwise.
--   Ordered-multi markets: 3 pts per pick in exact slot,
--                          1 pt per pick correct-club-wrong-slot,
--                          0 otherwise.
-- Max ≈ 4×10 + 3×9 = 67 pts across the season.

-- ── Cards + markets + options + predictions ──────────────────────────────

create table if not exists public.season_cards (
  id                   uuid primary key default gen_random_uuid(),
  season               text not null unique,
  lock_at              timestamptz not null,
  edit_window_start    timestamptz,
  edit_window_end      timestamptz,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (edit_window_end is null or edit_window_start is null or edit_window_start < edit_window_end)
);

create table if not exists public.season_card_markets (
  id               uuid primary key default gen_random_uuid(),
  season_card_id   uuid not null references public.season_cards(id) on delete cascade,
  key              text not null check (key in (
    'pl_winner', 'top4_others', 'relegated',
    'top_scorer', 'most_assists', 'first_sacked',
    'championship_promoted'
  )),
  title            text not null,
  help_text        text,
  num_picks        int  not null check (num_picks in (1, 3)),
  slot_labels      text[],
  option_type      text not null check (option_type in (
    'pl_club', 'championship_club', 'pl_player', 'pl_manager'
  )),
  resolved_answers text[],
  points_per_exact int  not null default 10,
  points_per_partial int not null default 1,
  display_order    int  not null default 0,
  created_at       timestamptz not null default now(),
  unique (season_card_id, key)
);

create table if not exists public.season_card_options (
  id            uuid primary key default gen_random_uuid(),
  season_card_id uuid not null references public.season_cards(id) on delete cascade,
  option_type   text not null,
  option_key    text not null,
  display_name  text not null,
  extra         jsonb,
  default_rank  int  not null default 999,
  created_at    timestamptz not null default now(),
  unique (season_card_id, option_type, option_key)
);
create index if not exists season_card_options_lookup_idx
  on public.season_card_options (season_card_id, option_type, default_rank);

create table if not exists public.season_card_predictions (
  id            uuid primary key default gen_random_uuid(),
  market_id     uuid not null references public.season_card_markets(id) on delete cascade,
  player_id     uuid not null references public.profiles(id)            on delete cascade,
  pick_index    int  not null check (pick_index >= 0 and pick_index <= 2),
  option_key    text not null,
  points_awarded int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (market_id, player_id, pick_index)
);
create index if not exists season_card_predictions_market_idx
  on public.season_card_predictions (market_id);
create index if not exists season_card_predictions_player_idx
  on public.season_card_predictions (player_id);

create or replace function public.set_season_cards_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists season_cards_touch on public.season_cards;
create trigger season_cards_touch
before update on public.season_cards
for each row execute function public.set_season_cards_updated_at();

create or replace function public.set_season_card_predictions_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists season_card_predictions_touch on public.season_card_predictions;
create trigger season_card_predictions_touch
before update on public.season_card_predictions
for each row execute function public.set_season_card_predictions_updated_at();

-- ── Edit-window guard ─────────────────────────────────────────────────────
--
-- A predictions insert or update is allowed when:
--   1. The card hasn't locked yet (now() < lock_at), OR
--   2. We're inside the post-transfer-window edit window
--      (edit_window_start <= now() < edit_window_end).
-- Admin bypass via is_admin() so backfills / corrections stay possible.

create or replace function public.season_card_is_open(p_market_id uuid)
returns boolean language sql stable as $$
  select is_admin()
    or exists (
      select 1
      from public.season_card_markets m
      join public.season_cards c on c.id = m.season_card_id
      where m.id = p_market_id
        and c.resolved_at is null
        and (
          now() < c.lock_at
          or (
            c.edit_window_start is not null
            and c.edit_window_end   is not null
            and now() >= c.edit_window_start
            and now() <  c.edit_window_end
          )
        )
    );
$$;

-- ── Settle function ───────────────────────────────────────────────────────
--
-- Called by trigger when a market's resolved_answers is set / changed.
-- Cascades points to that market's predictions:
--   single-pick market: 10 pts if pick matches resolved_answers[1]
--   multi-pick market : 3 pts for exact-slot, 1 pt for wrong-slot-right-club

create or replace function public.settle_season_card_market()
returns trigger language plpgsql security definer as $$
declare
  v_answers text[];
  v_num int;
  v_exact int;
  v_partial int;
begin
  v_answers := new.resolved_answers;
  v_num := new.num_picks;
  v_exact := new.points_per_exact;
  v_partial := new.points_per_partial;

  if v_answers is null or array_length(v_answers, 1) is null then
    update public.season_card_predictions
       set points_awarded = null
     where market_id = new.id;
    return new;
  end if;

  if v_num = 1 then
    update public.season_card_predictions p
       set points_awarded = case
         when p.option_key = v_answers[1] then v_exact
         else 0
       end
     where p.market_id = new.id;
  else
    update public.season_card_predictions p
       set points_awarded = case
         when array_length(v_answers, 1) >= (p.pick_index + 1)
              and v_answers[p.pick_index + 1] = p.option_key then v_exact
         when p.option_key = any (v_answers) then v_partial
         else 0
       end
     where p.market_id = new.id;
  end if;

  return new;
end;
$$;
drop trigger if exists season_card_market_settle on public.season_card_markets;
create trigger season_card_market_settle
after update of resolved_answers on public.season_card_markets
for each row execute function public.settle_season_card_market();

-- ── Season leaderboard view ───────────────────────────────────────────────

create or replace view public.v_season_card_leaderboard as
with settled as (
  select
    p.player_id,
    m.season_card_id,
    p.points_awarded
  from public.season_card_predictions p
  join public.season_card_markets     m on m.id = p.market_id
  where p.points_awarded is not null
),
per_card as (
  select
    c.id           as season_card_id,
    c.season       as season,
    s.player_id,
    coalesce(sum(s.points_awarded), 0)::int as total_pts,
    count(*)                                as picks_settled
  from public.season_cards c
  join settled s on s.season_card_id = c.id
  group by c.id, c.season, s.player_id
)
select
  pc.season_card_id,
  pc.season,
  pc.player_id,
  pr.name || ' ' || coalesce(pr.surname,'') as display_name,
  pc.total_pts,
  pc.picks_settled
from per_card pc
join public.profiles pr on pr.id = pc.player_id
order by pc.season desc, pc.total_pts desc, pr.name;

grant select on public.v_season_card_leaderboard to authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table public.season_cards             enable row level security;
alter table public.season_card_markets      enable row level security;
alter table public.season_card_options      enable row level security;
alter table public.season_card_predictions  enable row level security;

drop policy if exists season_cards_select on public.season_cards;
create policy season_cards_select on public.season_cards
  for select using (auth.role() = 'authenticated');
drop policy if exists season_cards_admin on public.season_cards;
create policy season_cards_admin on public.season_cards
  for all using (is_admin());

drop policy if exists season_card_markets_select on public.season_card_markets;
create policy season_card_markets_select on public.season_card_markets
  for select using (auth.role() = 'authenticated');
drop policy if exists season_card_markets_admin on public.season_card_markets;
create policy season_card_markets_admin on public.season_card_markets
  for all using (is_admin());

drop policy if exists season_card_options_select on public.season_card_options;
create policy season_card_options_select on public.season_card_options
  for select using (auth.role() = 'authenticated');
drop policy if exists season_card_options_admin on public.season_card_options;
create policy season_card_options_admin on public.season_card_options
  for all using (is_admin());

drop policy if exists season_card_predictions_select on public.season_card_predictions;
create policy season_card_predictions_select on public.season_card_predictions
  for select using (auth.role() = 'authenticated');

drop policy if exists season_card_predictions_own_insert on public.season_card_predictions;
create policy season_card_predictions_own_insert on public.season_card_predictions
  for insert with check (
    player_id = my_profile_id()
    and public.season_card_is_open(market_id)
  );

drop policy if exists season_card_predictions_own_update on public.season_card_predictions;
create policy season_card_predictions_own_update on public.season_card_predictions
  for update
    using (player_id = my_profile_id())
    with check (
      player_id = my_profile_id()
      and public.season_card_is_open(market_id)
    );

drop policy if exists season_card_predictions_own_delete on public.season_card_predictions;
create policy season_card_predictions_own_delete on public.season_card_predictions
  for delete using (
    player_id = my_profile_id()
    and public.season_card_is_open(market_id)
  );

drop policy if exists season_card_predictions_admin on public.season_card_predictions;
create policy season_card_predictions_admin on public.season_card_predictions
  for all using (is_admin());

comment on table public.season_cards is
  'One row per season. Carries lock timestamps + edit-window boundaries.';
comment on table public.season_card_markets is
  '7 rows per card: pl_winner, top4_others, relegated, top_scorer, most_assists, first_sacked, championship_promoted.';
comment on table public.season_card_options is
  'Dropdown pool per market. default_rank orders favourites-first (bookies odds for clubs; alphabetical for players — searchable).';
comment on table public.season_card_predictions is
  'One row per (player, market, pick_index). pick_index=0 for singles, 0..2 for ordered triples. Settle trigger on markets writes points_awarded.';
