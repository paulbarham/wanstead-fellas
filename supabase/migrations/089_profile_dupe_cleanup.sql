-- Profile cleanup — 1 Sep 2026
--
-- Four small changes surfaced during the age-breakdown review:
--
--   1. Emmanuel (stub, no surname, no auth, no age) → Father Emmanuel
--      Same person; the older stub predated the real profile going live.
--      9 rows migrated (2 team_players, 2 goals, 2 votes, 3 wtp_games,
--      2 availability). Pre-flight check confirmed zero conflict rows
--      (they were never on the same team_players in the same match, etc).
--
--   2. Chay Samuels (older stub, no auth, one appearance) → real Chay
--      Called out in CLAUDE.md's known data quirks. 1 team_players row.
--
--   3. Neil Higgins age_group → '40–49'
--   4. David Edwards age_group → '40–49'
--
-- Merge strategy: exhaustive UPDATE across every FK column that references
-- profiles(id), then DELETE the stub. The exhaustive UPDATE (rather than
-- relying on CASCADE from the delete) preserves history — anything the
-- stub was tied to now lives on the real profile.

-- ─────────────────────────────────────────────────────────────────────
-- Merge 1: Emmanuel → Father Emmanuel
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  stub uuid := '7558c8b6-2bbe-4254-8c20-7e58d81be94e';
  real_id uuid := 'dab0c82b-142e-4ada-814e-d7b3a1ee3c93';
begin
  update team_players             set player_id       = real_id where player_id       = stub;
  update goals                    set player_id       = real_id where player_id       = stub;
  update award_results            set player_id       = real_id where player_id       = stub;
  update wtp_games                set player_id       = real_id where player_id       = stub;
  update fines                    set player_id       = real_id where player_id       = stub;
  update availability             set player_id       = real_id where player_id       = stub;
  update club_subscriptions       set player_id       = real_id where player_id       = stub;
  update credits                  set player_id       = real_id where player_id       = stub;
  update injuries                 set player_id       = real_id where player_id       = stub;
  update injuries                 set cleared_by      = real_id where cleared_by      = stub;
  update linked_profiles          set parent_id       = real_id where parent_id       = stub;
  update linked_profiles          set child_id        = real_id where child_id        = stub;
  update votes                    set voter_id        = real_id where voter_id        = stub;
  update votes                    set nominee_id      = real_id where nominee_id      = stub;
  update cup_predictions          set player_id       = real_id where player_id       = stub;
  update cup_sweepstake_entries   set profile_id      = real_id where profile_id      = stub;
  update mow_predictions          set player_id       = real_id where player_id       = stub;
  update season_card_predictions  set player_id       = real_id where player_id       = stub;
  update feature_interest_events  set player_id       = real_id where player_id       = stub;
  update notification_preferences set player_id       = real_id where player_id       = stub;
  update push_subscriptions       set player_id       = real_id where player_id       = stub;
  update fitness_sessions         set profile_id      = real_id where profile_id      = stub;
  update feedback                 set player_id       = real_id where player_id       = stub;
  update teams                    set captain_id      = real_id where captain_id      = stub;
  update team_drafts              set updated_by      = real_id where updated_by      = stub;
  update team_formations          set updated_by      = real_id where updated_by      = stub;
  update feature_announcements    set created_by      = real_id where created_by      = stub;
  update decisions                set decided_by      = real_id where decided_by      = stub;
  update decisions                set related_player_id = real_id where related_player_id = stub;

  delete from profiles where id = stub;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- Merge 2: Chay Samuels stub → real Chay
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  stub uuid := '0736e129-caa6-4c03-bc4a-2db3abbb2437';
  real_id uuid := 'e91738a7-1de7-41ec-877f-feebcc08c62c';
begin
  update team_players             set player_id       = real_id where player_id       = stub;
  update goals                    set player_id       = real_id where player_id       = stub;
  update award_results            set player_id       = real_id where player_id       = stub;
  update wtp_games                set player_id       = real_id where player_id       = stub;
  update fines                    set player_id       = real_id where player_id       = stub;
  update availability             set player_id       = real_id where player_id       = stub;
  update club_subscriptions       set player_id       = real_id where player_id       = stub;
  update credits                  set player_id       = real_id where player_id       = stub;
  update injuries                 set player_id       = real_id where player_id       = stub;
  update injuries                 set cleared_by      = real_id where cleared_by      = stub;
  update linked_profiles          set parent_id       = real_id where parent_id       = stub;
  update linked_profiles          set child_id        = real_id where child_id        = stub;
  update votes                    set voter_id        = real_id where voter_id        = stub;
  update votes                    set nominee_id      = real_id where nominee_id      = stub;
  update cup_predictions          set player_id       = real_id where player_id       = stub;
  update cup_sweepstake_entries   set profile_id      = real_id where profile_id      = stub;
  update mow_predictions          set player_id       = real_id where player_id       = stub;
  update season_card_predictions  set player_id       = real_id where player_id       = stub;
  update feature_interest_events  set player_id       = real_id where player_id       = stub;
  update notification_preferences set player_id       = real_id where player_id       = stub;
  update push_subscriptions       set player_id       = real_id where player_id       = stub;
  update fitness_sessions         set profile_id      = real_id where profile_id      = stub;
  update feedback                 set player_id       = real_id where player_id       = stub;
  update teams                    set captain_id      = real_id where captain_id      = stub;
  update team_drafts              set updated_by      = real_id where updated_by      = stub;
  update team_formations          set updated_by      = real_id where updated_by      = stub;
  update feature_announcements    set created_by      = real_id where created_by      = stub;
  update decisions                set decided_by      = real_id where decided_by      = stub;
  update decisions                set related_player_id = real_id where related_player_id = stub;

  delete from profiles where id = stub;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- Age band fills — Neil Higgins + David Edwards
-- ─────────────────────────────────────────────────────────────────────
update profiles set age_group = '40–49'
where lower(trim(name || ' ' || coalesce(surname,''))) = 'neil higgins';

update profiles set age_group = '40–49'
where lower(trim(name || ' ' || coalesce(surname,''))) = 'david edwards';

-- ─────────────────────────────────────────────────────────────────────
-- Log as one decision row for the audit trail
-- ─────────────────────────────────────────────────────────────────────
insert into decisions (category, summary, details, effective_from, decided_by)
values (
  'roster',
  'Profile cleanup: 2 stubs merged, 2 age_groups filled (mig 089)',
  E'Merged duplicate profiles into their real counterparts:\n' ||
  E'  * Emmanuel (7558c8b6-…) → Father Emmanuel (dab0c82b-…). Same person; the older stub predated the real profile going live.\n' ||
  E'  * Chay Samuels stub (0736e129-…) → real Chay Samuels (e91738a7-…) — long-standing todo from CLAUDE.md quirks.\n' ||
  E'Zero conflict rows detected (never in same match / same team). All FK columns migrated exhaustively before delete.\n\n' ||
  E'Also set age_group=''40–49'' for Neil Higgins and David Edwards per admin.',
  current_date,
  (select id from profiles where lower(trim(name || ' ' || coalesce(surname,''))) = 'paul barham' limit 1)
);
