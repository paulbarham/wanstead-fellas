# Wanstead Fellas — App Functionality

> A living reference for the Wanstead Fellas app: what it does for players, what it gives admins, and how it's built. **Keep this document updated whenever functionality changes.**

_Last updated: 2026-06-13 (cup-results-sync resilience; predictor "MY RANK" label)_

---

## 1. Overview (for everyone)

Wanstead Fellas is a mobile-first web app (installable as a PWA) that runs a weekly Thursday-night football group. It handles the full match cycle — who's playing, building balanced teams, recording scores and scorers, voting for awards, tracking fines and stats — plus seasonal extras like a World Cup predictor and sweepstake.

- **Platform:** React + Vite single-page app, deployed on Vercel (the `main` branch is production).
- **Backend:** Supabase — authentication, Postgres database with row-level security, file storage for photos, realtime updates, and scheduled edge functions.
- **Look & feel:** A retro Ceefax/teletext theme, optimised for phones (max 430px content width).
- **Admin:** A single admin account (`pabarham@gmail.com`) has elevated permissions throughout.

### The weekly rhythm

The app revolves around the **next Thursday** match. A match moves through four phases, all calculated in Europe/London time:

| Phase | Window | What happens |
|-------|--------|--------------|
| **Signup open** | Thu 10pm → Wed 10pm | Players mark themselves In / Out |
| **Signup locked** | Wed 10pm → Thu 9pm | Lineup fixed; admin can still adjust; teams get built |
| **Match live** | Thu 9pm → Thu 10pm | Kick-off; scores entered |
| **Post-match** | Thu 10pm onward | Voting opens, results & reports published |

Team generation is allowed from Wed 10pm up to 30 minutes before kick-off (Thu 8:30pm). Award voting runs Thu 10pm → 9am Friday. The match date rolls over to the following Thursday at Thu 10pm.

---

## 2. Player-facing features

### Signing up (Next Game / Tonight page)
- **In / Out toggle**, gated by match phase (admins can change it anytime).
- **Player tiers:** `subscribed`, `wtp_priority` (want-to-play priority), `wtp` (want-to-play). Subscribers and priority players bump the newest plain `wtp` signups when the match is over capacity (cap = 32).
- **Waiting list / auto-promotion:** if a playing player drops out, the next reserve is promoted automatically.
- **Reserves & deferrals:** once signups lock, the lineup splits into playing vs reserves. Deferral order pushes plain `wtp` out first and protects subscribers; within a tier the latest signup is deferred first.
- **Drop-out confirmation** modal to prevent accidental withdrawals.
- **My Squad:** parents can manage linked children and sign them up too.
- **Live availability:** the list updates in realtime as others sign up.
- **Last result card** and a countdown label ("TONIGHT", "Tomorrow", "Thursday · 3 days away").
- **Weather:** Open-Meteo forecast for the Wanstead Flats 9pm slot.

### Teams
- Published teams with names, players, and captain.
- Team sizing auto-picks a valid configuration based on headcount (e.g. 32→4 teams of 8, down to 10→2 teams of 5; below 10 no auto-config).

### Match (live scoring)
- Round-robin fixtures between the published teams.
- Score steppers and a live league table.
- Per-fixture scorer entry feeding the goals table.
- Results report view (shared `MatchResultView`).

### Awards & voting
- **MOTM** (Man of the Match) and **DOTD** (Dick of the Day) voting after the match.
- Only rostered players are eligible; votes upsert with read-back confirmation.

### Stats
Seven leaderboards, each with a month / all-time toggle:
- Top Scorers, Fines, MOTM, DOTD, Appearances, Distance per Game, Total Distance.

### History
- Collapsible list of completed matches, each with the result view, awards, and match report.

### Match fitness
- Players can add their own fitness per match — manually or by importing a **TCX/GPX** file from a watch/app.
- Fitness data can suggest stat tweaks (speed, stamina, work-rate) and powers the distance leaderboards.

### Player cards & profile
- **Profile:** edit your own details, upload a photo, reset password, sign out, manage linked children.
- **Cards (Top Trumps gallery):** FIFA-style player cards with stats and badges (e.g. Super Sharp Shooter, Legend, Captain). Tiers from overall rating: ≥9 gold, ≥8 silver, ≥7 bronze, else standard.
- **Fines:** admin can issue quick fines (Late £2, Lost Ball £3, Cuntiness £5, Drop-out £2).

### Seasonal extras
- **World Cup Predictor (`/cup`):** open to all players during the tournament window. Group-stage 1X2 picks and knockout 6-way picks (90/ET/pens), locking 5 minutes before kick-off. Leaderboard scored across all settled matches; the header shows your own standing as a "MY RANK" position (rank / total players) with your points.
- **Sweepstake:** read-only card for players; prize structure £60/£30/£20/£10 plus £120 to charity.
- **Pods:** static car-share / group info.
- **Feedback:** players submit feedback through a form.

---

## 3. Admin features

The admin account unlocks an **Admin page** with four tabs:

- **Players:** edit any player's stats, card, goalkeeper attributes, position, club, age, player type, badges, and photos. CSV import (matches existing players by name|surname — does not create new profiles) and CSV export.
- **Finance:** fines plus want-to-play game charges (£5/game), mark paid, delete, CSV export.
- **Families:** manage linked parent/child profiles.
- **Feedback:** review submitted feedback.

Admins also drive the match cycle:
- **Team building:** snake-draft builder over weighted attributes, random top-3 captain pick, autosaved drafts, and publish (writes matches/teams/players/voting windows and £5 game charges). WhatsApp export of teams.
- **Match results:** enter fixtures, scores, scorers, and results reports.
- **Voting:** override votes, view breakdowns, DOTD-streak warnings.
- **Cup admin:** add fixtures and set outcomes (which settle predictions).
- **Sweepstake admin:** manage entry/team status, with manual overrides.

---

## 4. Technical reference

### Stack
- React 19, TypeScript ~6, Vite 8, Tailwind CSS v4, react-router-dom v7, date-fns / date-fns-tz.
- Vitest 4 for unit tests (`npm test`). Build: `npm run build` (`tsc -b && vite build`). Lint: `npm run lint`.
- PWA service worker (`public/sw.js`, cache `wf-v4`): network-first for navigation, cache-first for assets. Note: stale-page gotcha — bump the cache version on releases.
- Code-splitting: Cup and Pods pages are lazy-loaded to keep the main bundle lean.

### Supabase
- **Auth:** email/password. `ADMIN_EMAIL` (`pabarham@gmail.com`) is auto-promoted; profiles self-heal on login.
- **Storage:** `avatars` bucket (`{id}/profile.jpg`), uploaded with `cacheControl: 3600` and a `?t=` cache-buster on the URL.
- **Realtime:** `postgres_changes` for live availability.
- **Edge function:** `cup-results-sync` runs on a 30-minute cron (URL stored in Vault as `cup_sync_url`), backed by pg_cron + pg_net. It polls football-data.org to insert/score `cup_matches` once a fixture is marked FINISHED (admin-entered results are never overwritten), and optionally pulls red cards from api-football.com (its free tier excludes WC 2026, so that pass currently no-ops; reds stay manual). Every external fetch and the whole handler are wrapped so a transient API failure degrades gracefully (retries next run) instead of crashing the sync — finished results land within ~30 min. Results can also be entered manually on the Cup Admin page, which settles predictions immediately.
- **RLS helpers:** `is_admin()` and `my_profile_id()`.

### Database tables
`profiles`, `availability`, `matches`, `teams`, `team_players`, `fixtures`, `results`, `feedback`, `goals`, `fines`, `wtp_games`, `linked_profiles`, `votes`, `award_results`, `voting_windows`, `team_drafts`, `fitness_sessions`, `player_fitness_suggestions` (view), `cup_matches`, `cup_predictions`, `cup_sweepstake_entries`, `cup_sweepstake_team_status`.

### Key logic modules
- **`src/lib/time.ts`** — match phases, team-gen window, voting window, countdown labels (London timezone).
- **`src/lib/format.ts`** — `stripFC`, `pickConfig` (team-size selection), `formatLabelFor`, `splitPlayingAndReserves` (deferral ordering).
- **`src/lib/report.ts`** — structured match-report helpers.
- **`src/lib/fitnessImport.ts`** — TCX/GPX parsing.

### Player stat model
- Base stats (1–10): shooting, skill, stamina, tackling, passing, agility, physical, composure, work-rate, cuntiness, plus `overall_rating`.
- Derived: strength = (physical+agility)/2, team-player = (passing+work-rate+composure)/3, technical = (skill+passing+composure)/3.
- Nullable card/goalkeeper attribute sets.

### Deployment
- Push to `main` → Vercel deploys to production.
- Workflow rule: reconcile local `main` with `origin/main` (fetch + fast-forward) before building/committing.

---

## 5. Maintenance note

**This document must be updated whenever app functionality changes** — new features, changed flows, schema changes, or removed behaviour. Treat it as part of the definition of done for any feature work.
