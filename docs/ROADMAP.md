# Wanstead Fellas — Roadmap

> **Single source of truth for what's coming next.**
> Add new ideas here the moment they're proposed — even rough ones. When something ships, leave the row in place but flip the status to ✅ and link the commit. Don't delete shipped items; the audit trail matters.

_Last updated: 2026-07-08 (9 Jul 4-team-night: applied 3 manual swaps to team_drafts to tighten OVR spread 5→3 and put a U30 on every squad — logged as gating "review auto-balance rules" row under Operations — balancer v2)_

---

## Status key

| Status | Meaning |
|---|---|
| 🟢 **Proposed** | Captured in a proposal doc or chat — awaiting agreement or a build slot |
| 🟡 **Scheduled** | Agreed, in the queue, no one building it yet |
| 🔵 **In progress** | Currently being built |
| ✅ **Shipped** | Live on `main` |
| ⚠️ **Blocker** | Constraint or dependency that gates other items |
| 🟥 **Known issue** | Bug or wart we want to fix |

Source links: <code>[NN]</code> refers to `docs/primers/pdf/NN-…pdf`; `chat` means surfaced in conversation but not yet pdf-ified.

---

## 🪪 Identity — preferred position & foot

The picker and DB are live. The visible payoff (position-aware cards, stats, balancer) is still to come.

| Item | Status | Source | Notes |
|---|---|---|---|
| `preferred_foot` column on `profiles` (left/right/both, nullable) | ✅ | chat · migration `046` | Player-set on Profile page or via inline nudge |
| FootPicker component (3-option, tap-cycle) | ✅ | chat · commit pending | LEFT · RIGHT · BOTH, mirrors PositionPicker's tap-cycle |
| Preferred-foot nudge on Next Game | ✅ | chat · commit pending | Yellow banner when `preferred_foot` is null; dismissable per session, persists across sessions until set |
| Foot badge on PlayerCard (compact + full) | ✅ | chat · commit pending | Coloured pill — cyan LEFT (icon flipped), yellow RIGHT, green BOTH; sits under position badge stack |
| Balancer soft constraint: spread lefties across teams | 🟢 | chat | Blocked on adoption ≥80% |
| `preferred_position_primary` + `_secondary` columns on `profiles` | ✅ | [04](primers/pdf/04-preferred-position.pdf) · commit `86c6edd` | Backfilled from legacy `position` |
| PositionPicker component (4-button grid, tap-cycle) | ✅ | `86c6edd` | Reusable, supports compact mode |
| Profile page picker | ✅ | `86c6edd` | Saved with the existing form |
| Next Game inline nudge for unset players | ✅ | `86c6edd` | Dismissible per session |
| Admin position adoption tracker | ✅ | commit `3a7d82f` · view `v_position_adoption` | Currently 49/59 = 83% set |
| Card: prominent position badge (primary + secondary chip) | ✅ | [04](primers/pdf/04-preferred-position.pdf) · commit `ace97e1` | Colour per position (GK green / DEF cyan / MID yellow / ATT magenta); on full + compact cards; legacy `position` fallback for older profiles |
| Card: position-rank pill in footer (e.g. "#1 ATT · 14 goals / 0.4 game") | 🟢 | [04](primers/pdf/04-preferred-position.pdf) | Deferred from card ship — needs aggregated cross-player data; do on Profile page first |
| Position-aware Stats panels (Top 3 by position filter) | ✅ | [04](primers/pdf/04-preferred-position.pdf) · commit `9e5979c` | Chip strip below period toggle; filters every panel on the page |
| 4th hero card for Top GK on Stats | ✅ | [04](primers/pdf/04-preferred-position.pdf) · commit `9e5979c` | Clean-sheet leader; green tier; shown when posFilter is 'all' |
| Position-weighted overall rating | 🟢 | [04](primers/pdf/04-preferred-position.pdf) · [06](primers/pdf/06-user-guide-v3.pdf) p6 | Defender's "60 ATT" no longer drags their overall down |
| Balancer position-aware distribution (GK → ATT → DEF → MID priority) | ✅ | chat · commit pending | Split roster by primary position, snake each pool in turn with a shared cursor + max-size cap. Guarantees GK/ATT spread up to available pool, doesn't hard-error when pool is short (e.g. only 3 GKs signed up for 4 teams). Followup 🟢: use secondaries when short on a position |
| Balancer soft constraint: MID count within ±1 across teams | 🟢 | [04](primers/pdf/04-preferred-position.pdf) | |
| ⚠️ Position-aware balancer ships only once ≥80% of regulars have a position set | ⚠️ | [04](primers/pdf/04-preferred-position.pdf) | Currently 83% — clears the bar; chase the last 10 first |

## 🛠️ Operations — balancer v2

Same 11 players, mathematically fairer teams. The 18 Jun match is the case study: SHO spread was ±12, with 3 swaps it would have been ±3. The 9 Jul 4-team-night is the fresh evidence: OVR-only auto-balance produced a 51/53/48/50 spread, zero U30s on one team, zero U20s on another, both non-keeper teams paired together, all lefties clustered on one team — manually corrected with 3 swaps to 51/52/49/50 with youth on every team. Full analysis in chat 8 Jul session.

| Item | Status | Source | Notes |
|---|---|---|---|
| ⚠️ Review + prioritise auto-balance rules | ⚠️ | chat 8 Jul · [07](primers/pdf/07-balancer-peer-rating.pdf) | Gating item for this whole section. Observed weaknesses on 9 Jul: (1) age band not consumed even though ≥90% of squad have it set, (2) preferred foot not consumed even though 79% have it set, (3) GK distribution weak on 4-team nights when squad has <4 GKs — should either warn admin or auto-nominate rotators, (4) OVR-only optimisation hits local minima at ±5 spread that ±1 is achievable with tiny swaps. Deliverable: 1-page proposal picking the top 2-3 constraints to add first + acceptance metric (target OVR spread + age-band coverage per team). |
| Categorical balance — each attribute total within ±X across teams | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | Currently balancer only minimises overall sum |
| Star cap (max 2 OVR ≥ 85 per team) | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | Stops talent stacking |
| Defender floor (≥1 with DEF ≥ 8 per team) | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | Most stompings = no defender |
| Simulated annealing algorithm | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | Random start → swap pairs → cool. ~1000 iter, <100ms |
| Rematch penalty — spread frequently-together players | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | Bonus social-mixing effect |
| Avg score-differential tracking (validation metric) | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | Target: drop from ~2.5 → ~1.5 goals |
| Admin escape hatch: drag-swap + "regenerate" button | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | Algorithm = suggestion, not mandate |

## 🎭 Stats Theatre — rating engine

Card attributes are currently admin-set. The plan turns them into live, derived values that reflect actual play. **Promised in user guide v3 page 6.**

| Item | Status | Source | Notes |
|---|---|---|---|
| SHO ← goals / appearance (with form decay) | 🟢 | [06](primers/pdf/06-user-guide-v3.pdf) p6 · [07](primers/pdf/07-balancer-peer-rating.pdf) | Half-life ~6 weeks |
| DEF ← inverse Wall + clean-sheet bonus | 🟢 | [06](primers/pdf/06-user-guide-v3.pdf) p6 | Data already exists |
| PAC ← `max_speed_kmh` from fitness sessions | 🟢 | [06](primers/pdf/06-user-guide-v3.pdf) p6 | Only for tracked players |
| PHY ← total distance × HR-zone workload | 🟢 | [06](primers/pdf/06-user-guide-v3.pdf) p6 | Bayesian shrinkage if no fitness |
| PAS ← aggregated peer-rating signal | 🟢 | [06](primers/pdf/06-user-guide-v3.pdf) p6 | Depends on peer ratings shipping |
| DRI ← stays admin-set | 🟢 | [06](primers/pdf/06-user-guide-v3.pdf) p6 | No good honest signal |
| Position-weighted overall (not flat mean) | 🟢 | [06](primers/pdf/06-user-guide-v3.pdf) p6 | See Identity theme |
| Form arrow on cards (↗︎ / ↘︎) | 🟢 | [06](primers/pdf/06-user-guide-v3.pdf) p6 · [07](primers/pdf/07-balancer-peer-rating.pdf) | 4-match rolling vs season |
| "Why this rating?" tooltip with full breakdown | 🟢 | [06](primers/pdf/06-user-guide-v3.pdf) p6 · [07](primers/pdf/07-balancer-peer-rating.pdf) | Transparency stops "algorithm is wrong" complaints |
| Bayesian shrinkage for low-appearance players | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | Under 3 apps → 70% blend to team mean |
| Hybrid admin baseline + ±N auto-adjustment | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | Cards drift ±5–10 from admin baseline |
| Nightly cron + `card_history` table for delta log | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | pg_cron infra already in use for cup-sync |
| MOTM/DOTD influence capped at ±5 to overall | 🟢 | [07](primers/pdf/07-balancer-peer-rating.pdf) | Anti-gaming |

## 🤝 Engagement — voting and beyond

**Documented bottleneck.** Avg MOTM/DOTD turnout is 44% after the June 2026 single-pass ballot redesign. The structural blockers below are what's left to lift it. **Until they ship, peer ratings will inherit the same 44% ceiling — so engagement levers go first.**

See [`docs/MOTM_DOTD_ENGAGEMENT_REVIEW.md`](MOTM_DOTD_ENGAGEMENT_REVIEW.md) for the full diagnosis.

| Item | Status | Source | Notes |
|---|---|---|---|
| Web push at full time ("Vote for tonight's MOTM") | ✅ | [engagement review](MOTM_DOTD_ENGAGEMENT_REVIEW.md) · migrations `047` + `048` · commit `f3c3285` | Full flow live: `voting_windows` AFTER INSERT fires `public.call_send_vote_notifications` → pg_net POST to `send-vote-notifications` edge function → `web-push` signs VAPID JWT → notification lands via web.push.apple.com / FCM / Mozilla. Verified end-to-end with a real push landing on iOS 18.7 (via installed PWA). Diagnostic path: `net._http_response.content` shows `{sent,total,results:[{ok/statusCode/body}]}`. |
| Web push when results publish ("Edward Ezra won MOTM") | ✅ | engagement review · migrations `047` + `048` · commit `f3c3285` | Fires from a `voting_windows AFTER UPDATE OF results_published` trigger when the flag flips true (either compute_award_results or an admin override). Same edge function, `topic: 'results'` payload. |
| Nav badge on Match tab when ballot is open | ✅ | engagement review · commit pending | Red dot on the Match icon in the bottom nav whenever a voting_window is open AND the signed-in player hasn't cast both awards. Refreshes every 60s; clears the moment they vote or the window closes. |
| Voting streak counter ("🔥 4 weeks in a row") | ✅ | engagement review · commit `a809deb` | Chip on the MotmVotingCard header (open ballot + closed results). Counts consecutive rostered matches where the player cast at least one vote; non-rostered matches skip so signup misses don't punish it. Shown once ≥2 so it feels earned. |
| Live social proof ("14 voted · 22 haven't") | 🟢 | engagement review · [07](primers/pdf/07-balancer-peer-rating.pdf) | Already partially in (`voted/eligible`) — lift visually |
| Results-reveal moment / Friday morning push | 🟢 | engagement review | Pairs with results-publish push |

### 🔔 Additional push notifications (extend the pipeline)

The push infrastructure from 5 Jul now supports any new topic on any trigger. Every row here is small (~10-30 min each) — the constraint isn't effort, it's volume. Notification fatigue is the enemy. Design guard-rail: **max 4 pushes per weekly cycle, or add a preferences UI before layering more on.**

| Item | Status | Source | Notes |
|---|---|---|---|
| Match-report push ("This week's report is up") | 🟢 | chat | New trigger on `results` table when `summary` flips NULL → not-NULL. Same edge function, new topic `'report'`. Fires the Friday morning after admin writes the report. Cheap (~10 min). |
| Sign-up deadline reminder — 2h before lock | 🟢 | chat | pg_cron job every Wed 20:00 London; fetches next Thursday's `matches` row + everyone NOT in `availability` for that date, filters to WTPs/subscribers with `preferred_position_primary` (i.e. active roster), fans out `"Are you in for Thursday?"`. Roster filter matters — we don't nag inactive players. Medium (~30 min). |
| Teams-published push ("Teams are up — check who's in your side") | 🟢 | chat | Trigger on `matches.status` flipping to `'published'`. Same edge function, new topic. Nice-to-have but arguably low-signal since players will see it Thursday morning anyway. Skip if we're worried about volume. |
| Player notification preferences UI | 🟢 | chat | Per-topic toggles on the `PushOptInCard`: Vote / Results / Report / Deadline / Teams. Requires a `push_preferences` JSONB column on `push_subscriptions` (or new junction table) + the edge function filters recipients per-topic. Only needed once we're at ≥4 notification types. |
| Sequencing decision — opt-out-per-type vs opt-in-per-type | ⚠️ | chat | Do enabled-players get everything by default, or only vote+results with opt-in for the rest? Loose consensus so far: opt-out (get everything). Revisit before shipping the preferences UI. |

## 🤝 Community — peer ratings (revised)

⚠️ **Original PDF [07] proposes a new screen.** That was revised in-chat: the existing MotmVotingCard already has the UX we need — extend it with a third inline column rather than build a new flow.

| Item | Status | Source | Notes |
|---|---|---|---|
| Third inline column on MotmVotingCard (🟢 great · 🟡 OK · 🔴 off) | 🟢 | chat (revised from [07](primers/pdf/07-balancer-peer-rating.pdf)) | One extra optional tap per teammate |
| Default = 🟡, no added friction | 🟢 | chat | Voluntary, ballot still works if you skip |
| Cap peer-rating influence at ±2 per match, ±5 cumulative on overall | 🟢 | chat · [07](primers/pdf/07-balancer-peer-rating.pdf) | Conservative; data is noisy |
| Bayesian shrinkage when <5 voters | 🟢 | chat · [07](primers/pdf/07-balancer-peer-rating.pdf) | Sample-size guard |
| Feed balancer as small synthetic adjustment | 🟢 | chat · [07](primers/pdf/07-balancer-peer-rating.pdf) | Not a primary signal |
| ⚠️ Sequencing — engagement levers ship FIRST | ⚠️ | chat | Without ≥65% turnout, peer-rating signal is too thin to be useful |

## 💷 Money & enforcement

Keeping the books straight and chasing what's owed without admin having to nag manually.

| Item | Status | Source | Notes |
|---|---|---|---|
| Auto-charge £5 WTP fee on confirmed signup | ✅ | chat · migration `023` · commit `38be733` | DB trigger; auto-reaps unpaid row on drop-out |
| Admin Finance: prior-month carryover surfaced inline | ✅ | chat · commit `98eea49` | "+£X prior" per row, sort by all-time owed |
| Unpaid signup block (2-week grace, DB + UI) | ✅ | chat · migration `026` · commit `f75eef8` | Blocked players can't confirm; admin can override; auto-promotion skips them |
| Block-start cutoff (only Jun 2026 onwards charges count) | ✅ | chat · migration `027` | May & earlier carryover still visible/owed but doesn't gate signups |
| Player credits (overpayments + goodwill, green vs red) | ✅ | chat · migration `028` · commit `c20bc79` | Net balance shown everywhere; admin "+ Credit" button; My Finances "In Credit" state |
| DB-side auto-promote of top reserve on drop | ✅ | chat · migration `030` | Was only in frontend; any drop via SQL / admin tool / direct API silently left reserves stranded (Charlie 24 Jun). Trigger mirrors `pickPromotion`: wtp_priority first → wtp; FIFO within tier; skips blocked players |
| Make block-start cutoff a setting (not hardcoded in fn) | 🟢 | chat | Move `block_start` to a settings table the admin can edit |
| All-Time view toggle on AdminFinancePanel | 🟢 | chat | Aggregate per player across every month — full chase list |
| Player-facing notice when grace is approaching | 🟢 | chat | "You owe £X — pay by Sat or you'll be blocked from next Thu" |
| Stripe / online payment | 🟢 | chat | One-tap settle from the app instead of cash to admin |
| Auto-apply credit when payment recorded | 🟢 | chat | Single UI: "Mike paid £5" → marks £2 fine paid, adds £3 credit automatically |

## 🛂 Delegate roles

Granular permissions so admin can hand off narrow tasks (scoring, fines, etc.) to trusted players without minting another full admin.

| Item | Status | Source | Notes |
|---|---|---|---|
| `can_enter_results` delegate role (scores + scorers only) | ✅ | chat · migration `033` · commit `9c8e0a8` | Ross Marks granted. RLS helper `can_manage_results()` covers fixtures/goals/results full write + matches UPDATE only. All other admin gates still check `is_admin`. |
| Admin UI: toggle delegate roles per player on the admin profile editor | 🟢 | chat · follow-up to `9c8e0a8` | Avoids manual SQL when granting/revoking |
| Indicator on Admin profile page showing who holds each delegate | 🟢 | chat | "Score entry: Ross Marks" — easy audit |
| Additional delegate roles as needed (e.g. `can_manage_fines`, `can_publish_teams`) | 🟢 | chat | Same pattern — helper fn + replace policy condition |

## ⚽ Team tactics

Tools that turn a published team from "here's who's playing" into "here's how we're playing" — pre-match talking points, formation debate, hopefully some kickabout banter.

| Item | Status | Source | Notes |
|---|---|---|---|
| FormationPicker on Match tab (per team, shape + slot assign) | ✅ | chat · migration `045` | 5v5 / 6v6 / 7v7 / 8v8 shapes; auto-suggest by preferred position; anyone on the team (or admin) can edit; saves live |
| Auto-suggest by primary/secondary position | ✅ | chat · migration `045` | GK → row-fill DEF/MID/ATT by primary, secondary, then whoever's left. Auto-fill button re-runs it. |
| In-app team chat / tactics thread | 🟢 | chat | Deferred. WhatsApp already carries the group chatter; risk is duplicating not adding. Revisit if the formation debate outgrows what's practical in the picker UI. |
| Captain badge → who defaults to edit | 🟢 | chat | Currently open to all team members. If it gets messy (constant re-shuffles), gate edit to captain + admin. |
| Formation snapshot in match report | 🟢 | chat | Small pitch thumbnail per team in the History view — "3-2-1 vs 2-3-1, they overloaded midfield" |
| Position played per player (from formation on match day) | 🟢 | chat | Formation gives us free "position played" data for the stats engine — feeds Data quality below |

## 🥅 Match day — scoring & results

Rules and capture around what actually happens on the pitch: scores, draws, tie-breaks.

| Item | Status | Source | Notes |
|---|---|---|---|
| Penalty shootouts for drawn fixtures | ✅ | chat · commit `f73ebb6` · migration `035` | World Cup spirit (July 2026). Every drawn fixture — incl. 0-0 — goes to pens; winner takes a **+1 bonus** (draw winner finishes on 2, loser 1; regulation win still 3). `fixtures.shootout_winner` (1/2/null). Winner picker + explicit "mark 0-0 draw" in AdminMatchEntry; submit gated until every draw has a recorded winner. Bonus feeds all three standings calcs (live table, result view, Stats champion crown). Pens are **not** goals — top-scorer untouched; may inform MOTM/DOTD (free-form, no code). |
| Started as tonight-only; promote to permanent if it lands | 🟢 | chat | Feature is fully built (not a hack), so "keeping it" needs no further work — just the decision. |
| Shared `buildTable`/standings helper (kill the 3-way duplication) | 🟢 | chat | 3-1-0 + shootout-bonus logic is currently copied across `AdminMatchEntry`, `MatchResultView`, `StatsPage`. Extract to a tested `lib/standings.ts` to stop drift. Deferred from the shootout ship to avoid refactoring the hot path pre-match. |

## 🧢 Team builder polish

Quality-of-life on the AdminTeamBuilder publish + share flow.

| Item | Status | Source | Notes |
|---|---|---|---|
| Tag debutants automatically in WhatsApp export | ✅ | chat · commits `59b6311` / `18a0068` / `d24128a` | Reads from server-side view `v_player_match_history` (migration 031) with a `profiles.debut_at` per-player override (migration 032) for pre-app veterans like Charlie Nicholls-Petrie |
| "Mark as veteran" toggle on admin profile editor | 🟢 | chat · follow-up to `d24128a` | Set `debut_at` from the UI instead of via SQL — saves chasing data fixes for known-but-unrecorded players |
| Surface DEBUT badge in the in-app team list (not just export) | ✅ | chat · commit pending | Cyan DEBUT chip on the TeamsPage roster whenever `v_player_match_history.first_match_date` is on-or-after the displayed match. Same rule as the WhatsApp export so the two views stay consistent. |
| One-click "swap any two players" between teams | 🟢 | chat | Currently requires drag — keyboard-friendly modal would help mid-WhatsApp tweaks |

## 📊 Adoption — closing the feature-reach gaps

Surfaced by the [app engagement review (11)](primers/pdf/11-app-engagement-review.pdf) on 24 Jun 2026. Denominator: 49 active-and-authed players. Fitness uploads at 2% (1/49), Polar link 0/49, secondary position 4%, profile photo 35% — features built and shipped that no-one is actually using because there's no payoff loop or nudge.

| Item | Status | Source | Notes |
|---|---|---|---|
| "Most Distance Tonight" hero card on Stats | 🟢 | [11](primers/pdf/11-app-engagement-review.pdf) | High impact / low effort. Makes fitness upload visibly worth it, same loop as the existing top-scorer hero |
| Fitness line on PlayerCard (km + avg HR) | 🟢 | [11](primers/pdf/11-app-engagement-review.pdf) | Gives the upload a permanent home on your card |
| Friday-morning fitness-upload nav badge on Cards | 🟢 | [11](primers/pdf/11-app-engagement-review.pdf) | Same play that fixed voting; nudges only players who signed up the night before |
| Strava connect-once auto-pull (OAuth + webhook) | 🟢 | [11](primers/pdf/11-app-engagement-review.pdf) | Largest single fitness-adoption lever for the Strava-using half of the squad. Auto-imports Thursday "Football" activities |
| Secondary-position prompt inside PositionPicker | ✅ | [11](primers/pdf/11-app-engagement-review.pdf) · commit pending | Absorbed into ProfileCompletionCard — appears as a "Backup position" row when secondary is null |
| Profile-photo nudge on Cards tab | ✅ | [11](primers/pdf/11-app-engagement-review.pdf) · commit pending | Absorbed into ProfileCompletionCard — deep-links to Profile page for the photo upload flow |
| "Complete your card" 30-second flow at first login | ✅ | [11](primers/pdf/11-app-engagement-review.pdf) · commit pending · [14](primers/pdf/14-profile-completeness.pdf) | Single consolidated banner at the top of Next Game with progress bar + one row per missing field. Inline pickers for position/foot/age band; deep-links to Profile for photo/club. Absorbs the standalone position + foot nudges. Auto-hides at 6/6 done. |
| AgeBandPicker component (5-option: U20 / 20s / 30s / 40s / 50+) | ✅ | chat · commit pending | Privacy-preserving fallback for anyone unwilling to share exact DOB — persists as `profiles.age_group` |

## 📈 Data quality

New signals that the rating engine and balancer can use. Most are tiny additions to existing flows.

| Item | Status | Source | Notes |
|---|---|---|---|
| Position played per fixture — one-tap picker on match-entry sheet | 🟢 | chat | Currently no record; unlocks "GK 1 goal ≠ striker 1 goal" weighting |
| Assists tracking | 🟢 | chat | User exploring Veo recordings + shirt numbers to make this feasible |
| Self-rated form — "how are the legs?" Wednesday poll | 🟢 | chat | 5 options: 🔥 💪 🆗 🤒 🛏️ → balancer input |
| HR-zone fatigue index | 🟢 | chat | If 50%+ of last match was zone 5, flag "burnt", balancer pairs with extra runners |

## 🤖 Autonomous agents

Scheduled background work driven by Claude via the Anthropic API. Runs from GitHub Actions on cron, independent of any admin being at their laptop.

| Item | Status | Source | Notes |
|---|---|---|---|
| WC26 cup-audit cron (3x/day: 6am / 2pm / 12am BST) | ❌ | chat | Built end-to-end and shipped (workflow + script + secrets + Node 22 fix) — everything ran on the retry run right up until the Anthropic API rejected the call with `credit balance too low`. Admin chose to keep running the audit manually rather than top up. Torn down 8 Jul (`.github/workflows/cup-audit.yml` + `scripts/cup-audit.mjs` deleted); code lives in git history if we ever revive. Any future autonomous agent hits the same billing prerequisite first. |
| Match-report drafter agent (weekly) | 🟢 | chat | Every Fri morning: pulls last night's fixtures + goals + MOTM/DOTD, cross-checks scorers, drafts a structured report per `CLAUDE.md`, posts to a GH issue for admin to review + tick-to-publish. Highest-value repeat task on the calendar. |
| Sign-up deadline reminder push (via cron) | 🟢 | chat | Wed 20:00 London job → who hasn't signed up + push notification. Same tech stack as cup-audit but pointed at a different query. |
| Cost + rate-limit budget guard | 🟢 | chat | Prerequisite for **any** future autonomous agent (see cup-audit teardown above): pre-paid Anthropic credit balance. Document per-run cost & monthly spend trend the first time a live agent ships. Rough figure from cup-audit: $0.10-0.30 per non-empty run. |

## 📚 Help centre — in-app how-to guides

The 18 primer PDFs are great for WhatsApp shares but bad for "I'm mid-tap and stuck". A `/help` route now hosts the same content as mobile-friendly markdown so players can self-serve without digging through WhatsApp history.

| Item | Status | Source | Notes |
|---|---|---|---|
| `/help` route + `HelpPage` component | ✅ | chat · commit pending | Lazy-loaded so react-markdown doesn't bloat the main bundle. Main bundle actually shrank 602kb → 322kb after the split |
| Categorised index (Basics · Match night · Cup · Money) | ✅ | chat · commit pending | 4 categories · 7 seed articles |
| Client-side search | ✅ | chat · commit pending | Filters title + blurb + full content · single input |
| Help tile on MorePage overflow | ✅ | chat · commit pending | `P820 · HELP` · ❔ icon |
| 7 seed articles | ✅ | chat · commit pending | Getting started · Signing up · Voting · Notifications · Formations · Cup Predictor · Finances. Content lives in `src/help/*.md` — PR to add / edit. |
| Article thumbs feedback ("was this helpful?") | 🟢 | chat | Store as feedback rows tagged with article slug; low-effort once we want the signal |
| Contextual "help" links from feature UI to specific articles | 🟢 | chat | e.g. a `?` icon next to the WTP charge on Finances that deep-links to the finances article |
| First-login onboarding tour | 🟢 | chat | Bigger piece — a swipeable intro carousel that walks new players through the 5 tabs on first launch. Could reuse the help article content |
| ⚠️ Docs kept in sync with features | ⚠️ | chat | Same "will get stale" problem the roadmap fights. Should treat "did this ship with a help pass?" as part of DoD for feature work |

## 🟥 Known issues

| Item | Notes |
|---|---|
| ~~`MotmVotingCard` context-mismatch~~ | ✅ FIXED (commit pending). Card now takes an optional `expectedMatchId` prop and refuses to render if the latest voting window's `match_id` doesn't match. `MatchPage` passes the currently-displayed match on both slots so a stale ballot can no longer wedge itself into last week's context. Pre-result placeholder branch anchors to `weekMatch.id` — still surfaces the current-week ballot when the result hasn't been entered yet. |

---

## Adding new ideas

1. **Drop a row** in the matching theme with status 🟢 and a one-line note. If no theme fits, add a new one.
2. If the idea warrants a full proposal, build a primer-style PDF and add it to `docs/primers/` as the next number; link from the row.
3. **When the item ships:** change status to ✅, add the commit short hash (and the migration number if there's DB work), but leave the row in place.
4. **Don't delete shipped items.** The audit trail of what we set out to do, vs what landed, is the whole point.
5. **Mark blockers explicitly with ⚠️** and link to the dependency. Sequencing matters more than priority.
