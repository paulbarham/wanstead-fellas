-- Per-player notification preferences + a single audience resolver.
--
-- Design notes (30 Aug 2026):
--
--  * Preferences are per PLAYER, not per subscription. push_subscriptions is
--    one row per (player, browser) — a fella with a phone and a laptop has
--    two rows. Muting "Money" on the phone must mute it on the laptop too, so
--    the roadmap's original "push_preferences JSONB on push_subscriptions"
--    shape was wrong.
--
--  * Absence of a row means EVERYTHING IS ON. That's the default-on rule, and
--    it means we never have to seed 86 profiles or backfill when a new player
--    signs up. A row only appears once someone actually changes something.
--
--  * Five categories, not one toggle per push. 8 live pushes (going on 15+)
--    is a wall of switches nobody reads.
--
--  * ALWAYS-ON TIER: pushes that tell a fella he is playing tonight
--    ('You're in tonight', 'You're off the waitlist') carry NO category and
--    are never filtered. If someone could mute those we'd be a man short on
--    Thursday. push_targets(p_category => null) is that tier.

create table if not exists public.notification_preferences (
  player_id   uuid primary key references public.profiles(id) on delete cascade,
  match_night boolean not null default true,  -- teams up, theme, sign-up nudges
  results     boolean not null default true,  -- voting opens, report + awards
  games       boolean not null default true,  -- Match of the Week, Season Card
  money       boolean not null default true,  -- WTP charges, fines, subs
  club_news   boolean not null default true,  -- feature announcements, round-up
  updated_at  timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all using (player_id = public.my_profile_id())
  with check (player_id = public.my_profile_id());

drop policy if exists notification_preferences_admin_read on public.notification_preferences;
create policy notification_preferences_admin_read on public.notification_preferences
  for select using (public.is_admin());

create or replace function public.notification_preferences_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists notification_preferences_touch_trg on public.notification_preferences;
create trigger notification_preferences_touch_trg
  before update on public.notification_preferences
  for each row execute function public.notification_preferences_touch();


-- ── The single audience resolver ──────────────────────────────────────────
-- Every push now routes through this. Keeping the audience rules in ONE
-- place is the point — they were previously smeared across three edge fns
-- and drifted (13 Aug: teams_ready reached 8 of 20 rostered fellas).
--
--   p_category      null → always-on tier, preferences ignored entirely.
--   p_player_ids    null → no roster restriction (club-wide).
--                   array → only these players...
--   p_include_admins      ...PLUS admins, even when off-roster. This is the
--                   admin fix: an admin publishing the line-up on a week he
--                   isn't playing previously got nothing back.
--
-- Admins bypass the ROSTER filter but still honour their OWN preferences —
-- an admin who mutes Money should stay muted. Defaults are all-on, so an
-- admin who never touches the screen keeps receiving everything.
create or replace function public.push_targets(
  p_category        text    default null,
  p_player_ids      uuid[]  default null,
  p_include_admins  boolean default true
)
returns table (id uuid, endpoint text, p256dh text, auth text, player_id uuid)
language sql
security definer
set search_path = public
as $$
  select s.id, s.endpoint, s.p256dh, s.auth, s.player_id
  from public.push_subscriptions s
  join public.profiles p on p.id = s.player_id
  left join public.notification_preferences np on np.player_id = s.player_id
  where
    -- Roster gate: club-wide, on the roster, or an admin riding along.
    (
      p_player_ids is null
      or s.player_id = any (p_player_ids)
      or (p_include_admins and coalesce(p.is_admin, false))
    )
    -- Preference gate: skipped entirely for the always-on tier.
    and coalesce(
      case p_category
        when 'match_night' then np.match_night
        when 'results'     then np.results
        when 'games'       then np.games
        when 'money'       then np.money
        when 'club_news'   then np.club_news
        else true
      end,
      true
    );
$$;

-- Service role only — the edge functions call this with the service key.
-- No reason for a browser to enumerate everyone's endpoints.
revoke all on function public.push_targets(text, uuid[], boolean) from public;
revoke all on function public.push_targets(text, uuid[], boolean) from anon;
revoke all on function public.push_targets(text, uuid[], boolean) from authenticated;
grant execute on function public.push_targets(text, uuid[], boolean) to service_role;
