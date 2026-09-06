# Wanstead Fellas — App Functionality Overview

> Single source of truth for what the app does, how it's built, and where the data lives.
> Audience: the developer (Paul) + Claude Code. **Regenerated from the live Supabase schema — 18 Aug 2026.**
> Do not hand-edit stale sections from memory — regenerate from `public.roadmap` + live schema.

**Live URL:** https://wanstead-fellas.vercel.app
**Instagram:** @wanstead_football_fellas

---

## 1. What this is

A custom PWA for managing **Wanstead Fellas** — a Thursday-night grassroots football group in Wanstead, east London. Typically 8v8 four-team format, ~25–32 players a week, ~84 registered profiles (including linked family members and stubs).

The app has grown from a sign-up/teams/results tool into a full club-management platform: player cards, cuntiness tiers, awards voting, a World Cup 2026 predictor + sweepstake, a Match of the Week predictor, a Premier League Season Predictor Card, club finance tracking, and push notifications.

Longer-term vision: generalise the platform for other groups (multi-tenant), plus Polar/kit partnerships.

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js + TypeScript |
| Backend / DB | Supabase (Postgres) — project ID `qvvlxjftrteyrsscqidc` |
| Hosting | Vercel |
| Dev workflow | Claude (spec/prompt) → Claude Code (autonomous file creation + deploy) |
| PDF generation | WeasyPrint (Archivo/Inter fonts, WF green branding) |
| Match-report rendering | Playwright Chromium (CEEFAX-style images, VT323 font, 1344×896) |
| Weather | Open-Meteo API (free, no key) — Wanstead lat 51.5772, lon 0.0288 |
| Fitness data | Strava API (Apple Watch records); HR from Polar H10 (opt-in, parked) |
| Push | Web Push (`push_subscriptions` table) |

**Workflow note:** spec/prompt work happens in chat with Claude, then the Claude Code prompt is pasted into Claude Code for autonomous file creation and deployment.

---

## 3. Tabs (bottom navigation)

### Tonight
Next Thursday date + live countdown; availability button (sign up before **Wednesday 10pm**); who's-in list + likely format; "My Squad" for linked family members; final count after lock; "Last Result" card. Availability now supports statuses beyond a flat `confirmed` (see §9 roadmap — richer statuses in progress).

### Teams
Published after the Wednesday deadline. Own team highlighted; team name (captain), bibs / no bibs, teammates. Teams can now also carry a **formation** (`team_formations`: shape + slot assignments, e.g. 2-3-1) editable by admins. **Reads from `team_drafts.draft` JSONB** (see §7 sync rule) but eligibility/appearances are driven by `team_players`.

### Match
Most recent result. 4-team nights: group table + all fixture scores, with optional penalty-shootout resolution on draws (`fixtures.shootout_winner`, `matches.shootout_enabled`). 11v11 nights: final score + report. Scorers, match report, player of the tournament/match, and — when set — a **Theme of the Night** award (`matches.theme_prompt`, `award_type = 'theme'`).

### History
All past results; tap to expand the full report; scorers by team.

### Cards
FIFA / Top Trumps-style player cards, tiered **Gold / Silver / Bronze / Standard** by `overall_rating`. Tap for the full stat breakdown (§8). Tap your own card to change photo / age group / preferred position / preferred foot. Badges show on the profile. Ratings set by the organiser (Phase 4 dynamic ratings still to come — see §9).

### World Cup
World Cup 2026 group-stage-through-final predictor (`cup_matches`, `cup_predictions` — 1,859 predictions across 104 fixtures) plus a **sweepstake** (`cup_sweepstake_entries`, `cup_sweepstake_team_status`) tracking each entrant's drawn team through elimination stages.

### Match of the Week
Weekly PL/Championship/League One/League Two fixture pick (`mow_pool_fixtures` — 932-fixture season pool, `mow_fixtures` — one published pick per week) with scorepredictions (`mow_predictions`, scored 3/1/0) and season + weekly leaderboard views.

### Season Predictor
Premier League **Season Prediction Card** (`season_cards`, `season_card_markets`, `season_card_options`, `season_card_predictions`) — 7 markets per season (PL winner, top-4 others, relegated, top scorer, most assists, first manager sacked, Championship promoted), singles and ordered triples, with a grand-slam bonus for a perfect card.

### Feedback
Categories: Bug Report, Feature Request, Design Feedback, General → straight to the organiser (`feedback` table).

### Admin (organisers, or delegated via `profiles.can_enter_results`)
Manage players, teams, formations, fines, ratings, match data, club finances. `can_enter_results` grants a scoped delegate permission (fixtures/goals/results/match status only) without full admin rights.

**Report Review** (`/admin/report-review`, admins only) is where the Friday auto-generated match report is checked before anyone else sees it — see §6e.

---

## 4. Player types & sign-up priority

- **SUB** — Subscribed, full season paid, guaranteed spot.
- **WTP★** (`wtp_priority`) — long-standing Wait To Play players with priority status.
- **WTP** — pay £5/game, fills remaining spots. Max 32 players/night; oversubscribed WTP players dropped last-in-first-out.

Season subscriptions are now tracked in `club_subscriptions` (per player, per season, amount/paid/paid_at).

---

## 5. Fines & club finance

- **Fines** (`fines`): Late £2, Lost Ball £3, Cuntiness £5, Drop Out £2 — keyed by `match_date` directly (not joined through `matches`).
- **WTP game fees** (`wtp_games`): £5/game, paid flag, keyed by `match_date`.
- **Club income** (`club_income`): carry-over, spreadsheet-era fines, donations, deposits, prizes.
- **Club expenses** (`club_expenses`): pitch hire, equipment, food, tournament costs — optionally linked to a `match_id`.
- **Credits** (`credits`): positive adjustments to a player's balance.

Payment collection itself (Stripe wallet/ledger) is still on the roadmap — currently tracked, not collected in-app.

---

## 6. Awards & voting

Generic voting system keyed by `award_type`, currently `motm` (Man of the Match), `dotd` (Dickhead of the Day), and `theme` (Theme of the Night, only when `matches.theme_prompt` is set). `voting_windows` controls open/close timing and push notification of window opening; `votes` are raw ballots, `award_results` are the published, tallied outcome (supports shared wins and admin overrides).

---

## 6b. Push notifications

Web Push via VAPID. `push_subscriptions` holds one row per **(player, browser)** — a fella with a phone and a laptop has two. Edge functions fan out: `send-vote-notifications` (match night, results, dropouts), `mow-notify` (Match of the Week), `send-feature-announcement` (admin broadcasts), `generate-match-report` (admin-only draft nudge).

### What gets sent

| Push | Fires when | Audience | Category |
|---|---|---|---|
| 🟢 Teams are ready | `voting_windows` INSERT >15 min ahead | Rostered + admins | `match_night` |
| 🏆 Vote for tonight's awards | `voting_windows` INSERT / `fanout-vote-open` cron | Rostered + admins | `results` |
| 📝 Match report is live | `dispatch_report_notifications()` cron, when report published **and** awards final **and** `results.notified_at` is null — mig `093` | Club-wide | `results` |
| 📝 Match report draft ready | `generate-match-report` writes a draft (Fri 10:05) | **Admins only** | **always-on** |
| 📊 MOTM & DOTD published | Same cron; the edge fn picks this title when the row has no report body | Club-wide | `results` |
| 🎯 Match of the Week | `mow_fixtures` INSERT | Club-wide | `games` |
| 🎯 MoW Result | `mow_pool_fixtures` score UPDATE | Club-wide | `games` |
| *(admin-authored)* | 15-min cron picks up a scheduled announcement | Club-wide | `club_news` |
| 🔄 Roster change | `player_dropout` RPC | Admins | **always-on** |
| ⚽ You're in tonight | `player_dropout` RPC, when a WTP fills the gap | The replacement | **always-on** |

### Audience resolution

Every fan-out routes through **`public.push_targets(category, player_ids, include_admins)`** (mig `081`) — security-definer, service-role only. It applies two gates in one query:

1. **Roster gate** — club-wide (`player_ids` null), or a specific roster, plus admins when `include_admins` is true. Admins ride along past the roster filter so an organiser publishing on a week they aren't playing still gets confirmation it went out.
2. **Preference gate** — the player's `notification_preferences` row. **No row means everything is on**, so nothing is ever seeded and new signups inherit defaults.

Keeping both gates in one SQL function is deliberate: the rules previously lived inline in each edge function and drifted apart.

### Player preferences

`notification_preferences` is keyed on `player_id` (not on the subscription — muting on your phone must mute your laptop too). Five boolean categories: `match_night`, `results`, `games`, `money`, `club_news`. Players manage them on Profile via `NotificationPrefsCard`, sitting directly under the on/off card. All default on; "Turn everything off" is a destructive pill behind a confirm sheet.

**Always-on tier:** pushes that tell a player they're playing tonight carry no category and bypass preferences entirely (`push_targets(p_category => null)`). If those could be muted we'd be a man short on Thursday.

### Known constraint

Adoption is the ceiling, not the code: **18 push subscriptions against 86 profiles**. Every push feature is capped by that number until more of the group opts in.

---

## 6c. App updates

The app is an installed PWA, so a deployed build does not reach a phone until that phone reloads. `public/sw.js` deliberately does **not** call `skipWaiting()` on install: a new worker installs and parks in `waiting`, `registerWithUpdates()` (`src/lib/swUpdate.ts`) detects it, and `UpdatePrompt` surfaces a "New version available — Refresh" toast above the bottom nav.

Tapping Refresh posts `SKIP_WAITING` to the waiting worker and reloads on `controllerchange` (not immediately — reloading before the new worker controls the page re-serves the old bundle and loops). The app re-checks for updates whenever it returns to the foreground and every 30 minutes while open.

Bump `CACHE` in `sw.js` on any change that needs a hard refresh across the group.

---

## 6d. Team balancing

`snakeDraft` splits the roster by position and deals rating-balanced teams; `enforceBalanceConstraints` (`src/lib/balance.ts`) then applies two post-draft constraints as a greedy, position-preserving swap pass:

- **Star cap** — `starCapFor(totalStars, numTeams) = max(1, ceil(stars / teams))`. Scales with the night's format: 4 stars across 4 teams means one each, and it can never be mathematically unsatisfiable.
- **Age spread** — over-40 count within ±1 across teams.

Both are best-effort. If one cannot be satisfied it stops and the other still runs; any successful swap re-scans both, since an over-40 player may also be a star. Admin preview chips (RTG · GK · 40+ · ★) use the same cap the balancer used.

Preferred format is **4 teams**; 2-team nights happen when turnout is low and both constraints are much weaker there.

---

## 6e. Automated match reports

Match reports are drafted automatically every Friday and published by hand.

**Why the timing matters.** Reports used to be written around midnight on Thursday — *before* the voting window closes at 10:00 UK on Friday. That meant MOTM and DOTD could never appear in a report, because at write time the ballot was still open. The generator runs **after** the close, which fixes that.

| Step | When | What happens |
|---|---|---|
| `weekly-context` | Fri 09:00 UTC | Caches the week's football results from football-data.org (facts) plus 2-3 non-football colour items via Claude `web_search` (framing) into `weekly_context (week_start, items, fetched_at)`. Football is capped at the **6 most newsworthy** scorelines — a full PL+ELC week is 54, which is prompt bloat the report can't use; the value here is the colour. Degrades to football-only if the search call fails. |
| `generate-match-report` | Fri 10:05 UTC | Reads `get_match_hooks(date)` + `weekly_context` + the last 3 published reports, calls `claude-opus-5` with a JSON schema matching the existing section shape, writes `results.status = 'draft'`, pushes **Paul only**. |
| Review | whenever | Admin opens **Report Review**, edits any section, taps Publish. |
| Publish | on tap | `status` flips to `published`; the mig `090` trigger fires the club-wide push. |

**10:05 UTC, not 09:55.** `pg_cron` runs in UTC. 10:05 UTC is after 10:00 London in *both* BST (11:05) and GMT (10:05); 09:55 UTC would land at 09:55 London through the winter — before the ballot closes — silently reintroducing the exact bug this exists to kill. The function re-checks `voting_windows.closes_at` itself and refuses to run early.

**What the model may and may not invent.** Framing is free — any lens the week's news suggests. Pitch **events** are not: every factual claim must trace to a hook. Names, scorers, scorelines, keepers, quotes and incidents all come from `get_match_hooks`. The predicted-vs-actual table is computed in code from `matches.predicted_order` (written by AdminTeamBuilder at announcement time) and never authored by the model.

**Publishing and notifying are separate (mig `093`).** These are three independent events and the system no longer couples them:

| Event | When | Effect |
|---|---|---|
| Report published | whenever the admin taps Publish — including match night | Live on the Match tab immediately. No dependency on the ballot. |
| Awards final | `compute_award_results` cron sets `voting_windows.results_published` | MOTM/DOTD available. |
| Push sent | `dispatch_report_notifications()` cron, at :05 past every ten minutes | **Exactly one** club-wide push, only once both of the above are true. |

`results.notified_at` records the send. It is the thing that makes delivery exactly-once — a republish, an edit, or a second pass over the same row cannot send again, because the stamp is already set. The cron claims a row with `update … where id = ? and notified_at is null` before sending, so two overlapping runs can't both deliver, and the stamp and the queued push commit in the same transaction.

Delivery has exactly one owner. The old mig `077` trigger pair (`results_notify_report_live`, `voting_windows_notify_results`) no longer sends anything — both are no-ops and their triggers are dropped. (`voting_windows_notify_open`, the "vote now" push, is a different trigger and is untouched.)

The cron runs at :05, :15, :25 … — deliberately five minutes behind `compute-award-results` at `*/10` rather than on the same tick, so awards are already computed when it looks. Sharing a minute would leave the order of two independent jobs to chance.

**What the awards fill-in does.** When the push goes out, the cron appends `📟 MOTM & DOTD winners are up on the Match tab.` to the report's `closer` (only if there are award rows, and only if the closer doesn't already mention MOTM — it never double-appends and never overwrites an existing closer). It does **not** copy winner names into the report body: `award_results` already renders on the Match and History tabs, and CLAUDE.md is explicit that re-packaging MOTM/DOTD inside the report reads as self-congratulatory.

**Zero-turnout nights still notify.** The gate is `voting_windows.results_published`, not "`award_results` has rows" — `compute_award_results` sets the flag even when nobody voted, and gating on award rows would silently swallow the push for those nights.

**Checking it without writing.** `POST` to the function with `{"match_date":"YYYY-MM-DD","dry_run":true}` generates as normal and returns the finished JSON under `would_write`, touching nothing and pushing nobody. Dry runs deliberately skip the anti-clobber guards — the point is to aim one at a past night that already has a published report and compare. Few-shot examples are always drawn strictly *before* the target date, so a dry run never sees its own report.

**Who can trigger it.** Both `pg_cron` callers (`call_weekly_context`, `call_generate_match_report`) are `SECURITY DEFINER` in `public`, so PostgREST exposes them at `/rest/v1/rpc/`. Mig `092` revokes `anon`/`PUBLIC` EXECUTE and adds an in-function guard: allowed if `session_user = 'postgres'` (the cron worker) or `is_admin()`. Note the guard is on **`session_user`, not `current_user`** — these functions are owned by `postgres`, so under `SECURITY DEFINER` `current_user` is `postgres` on every path including an anonymous web request, and a `current_user` check would be a no-op.

**Draft visibility.** `results.status` is `'draft'` or `'published'`. RLS on `results` only returns drafts to `can_manage_results()`, and every player-facing query (Match, History, Tonight) also filters on `status = 'published'`. Hand-entered results from AdminMatchEntry insert as `published`, and re-submitting a corrected scoreline never flips a draft live.

---

## 7. Data model highlights & sync rules

- **Two roster stores must stay in sync:** `team_players` (relational, drives MOTM/DOTD eligibility + appearances) and `team_drafts.draft` (JSONB, what the Teams tab reads). This is an active `in_flight` roadmap item to automate.
- **`team_drafts` keys on `match_date`**, not `match_id`.
- **`profiles.player_type`** valid values: `subscribed`, `wtp`, `wtp_priority` only.
- **`profiles.badges`** is a Postgres `text[]` — use `unnest()`, not JSONB operators.
- **`cup_predictions.player_id`** (not `profile_id`).
- **Fines queried by `match_date` directly**, not via a `matches` join.
- **`roadmap.updated_at`** must be set manually on UPDATE — no auto-trigger.
- Always verify against the **live** schema before writing SQL — this doc can lag.

### Key views
- `appearances`, `top_scorers` — season leaderboards.
- `player_fitness_suggestions` — derives suggested card-stat nudges from `fitness_sessions`, with a confidence score.
- `v_player_match_history`, `v_position_adoption`, `v_blocked_players` — player/team analytics.
- `v_cup_leaderboard`, `v_mow_season_leaderboard`, `v_mow_weekly_leaderboard`, `v_season_card_leaderboard` — predictor leaderboards.

---

## 8. Player card stats

Card stats derive from the 17-column Scoring DB, rounded to whole numbers (.5 rounds up):

| Card stat | Source |
|---|---|
| PACE | Speed |
| SHOOTING | Goals |
| PASSING | Passing |
| DRIBBLING | Skill |
| DEFENCE | avg(Tackling, Aggression) |
| PHYSICALITY | avg(Physicality, Stamina) |

GK alternates (`gk_pace`, `gk_reflexes`, `gk_handling`, `gk_distribution`, `gk_positioning`, `gk_physicality`) follow the equivalent mapping documented in memory. `overall_rating` is a stored DB value, not recalculated from the six card stats. `cunt_tier` is a **generated column**, auto-computed from `cunt` (1–2 Saint, 3–4 Gentleman, 5–6 Scamp, 7–8 Nuisance, 9–10 Cunt) — it is not a card stat, it's a badge tier.

Profiles also carry `preferred_position_primary/secondary` (GK/DEF/MID/ATT), `preferred_foot`, and `debut_at` (manual override for pre-app veterans whose history predates the app).

---

## 9. Roadmap snapshot (live from `public.roadmap`, 33 open items)

**In flight (data hygiene):**
Fines backfill · CSV import for new card stats · card-stat sweep for not-yet-scored players · match-report saving to `results.report_text` · History-tab date-cutoff fix · team_players/team_drafts sync · matching stub profiles to real accounts.

**Next:**
Phase 4 — results-driven dynamic ratings · auto-recording weekly rosters into `team_players` · push notifications · banter vote categories (Sitter of the Week, Goal of the Night, Cunt of the Week — reusing the generic voting infra).

**Then (parked):**
Opt-in Polar H10 fitness tracking · dual-source (Strava + Polar) fitness merge.

**Idea (not yet started):**
AI-assisted match report drafting via the Claude API · richer availability statuses · match shirts/numbered kit (data capture angle) · PL Season Prediction Card extensions · attendance streaks & milestones · Player of the Month · head-to-head records · "On this day" · season awards night · PL Match of the Week extensions · Thursday predictions league · season records/leaderboards hub · PL Last Man Standing · Stripe wallet + ledger payment collection.

**Vision (long horizon):**
Numbered squad kit + brand refresh · Veo match camera + stats pipeline · local sponsorship · merch range · multi-tenant multi-group platform · Polar/kit partnerships.

---

## 10. Known accepted gaps

7 profiles have NULL card stats (not yet in the master scoring spreadsheet) — leave until added, not a bug. 8 stub profiles await real sign-ups (match to existing stub row, don't duplicate) — tracked as an in-flight roadmap item.

---

*Regenerate this file from `public.roadmap` and a live `list_tables`/`execute_sql` schema pull — never rebuild from memory or an old copy of this doc.*
