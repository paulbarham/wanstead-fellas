# Wanstead Fellas — Roadmap

> **Single source of truth for what's coming next.**
> Add new ideas here the moment they're proposed — even rough ones. When something ships, leave the row in place but flip the status to ✅ and link the commit. Don't delete shipped items; the audit trail matters.

_Last updated: 2026-09-01 (Shipped rivalry cards v1.5 — Stats "Duo of the Month" hero + BestDuoCaption on every published team card · mig 085 · SW v52. Earlier: rivalry cards v1 · mig 084 · decisions log · mig 082 · monthly sub-chase · mig 083.)_

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
| Star cap (max 2 OVR ≥ 9 per team) | ✅ | chat 14 Aug 2026 · commit pending | Post-draft fix-up pass in `enforceBalanceConstraints` (AdminTeamBuilder.tsx). Greedy position-preserving swap: if any team ends up with 3+ stars (OVR ≥ 9), swap a star to a team under the cap in exchange for a non-star of the same position. Bails cleanly if no valid swap exists. Data motivation: Jun-Aug 2026, highest-rated team came LAST 3 times in 10 nights — star stacking one of two identified failure modes. |
| Age spread — over-40 count within ±1 across teams | ✅ | chat 14 Aug 2026 · commit pending | Same post-draft pass. Kills "Aaron Franklin FC — a bit old in places" 30 Jul-style nights where one team gets stacked with the 40s+ and shipped 8 across 3 games. Age band already ≥90% set so no adoption blocker. |
| Admin balance-preview chips (RTG · GK · 40+ · ★) | ✅ | chat 14 Aug 2026 · commit pending | 4 chips on every draft/published team card. RTG is info-only, GK/40+/★ tint amber/red when constraints are violated. Lets admin eyeball balance pre-Publish and swap manually if the auto-pass couldn't fully satisfy. SW bumped to v45. |
| ⚠️→✅ Star cap silently disabled the age pass | ✅ | chat 30 Aug 2026 · commit pending | **Bug in `enforceBalanceConstraints`.** When a star violation couldn't be resolved the loop `break`ed out entirely, so the age-spread pass that follows it never ran — one constraint failing cancelled the other. Hit for real on 6 Aug (5 stars, 2 teams, old capacity 4 → unsatisfiable → age spread skipped, squad left 3-0 on over-40s in the reproduction). Fixed with independent `starsDone`/`ageDone` latches; a stuck pass now falls through instead of aborting both, and any successful swap clears both latches to re-scan (an over-40 can also be a star, so the constraints interact). |
| ⚠️→✅ Star cap didn't scale with team count | ✅ | chat 30 Aug 2026 · commit pending | `MAX_STARS_PER_TEAM` was a hardcoded 2, wrong in both directions. **Too loose at 4 teams** — our preferred format: 4 stars across 4 teams should be one each, but a cap of 2 happily allowed 2/2/0/0, exactly the stacking v2 existed to prevent. **Impossible at 2 teams** — capacity 2×2=4 could never hold a 5-star squad. Replaced with `starCapFor(totalStars, numTeams) = max(1, ceil(stars/teams))`: the tightest cap that is always achievable. Backtested over 9 four-team nights (Jun–Jul): would have forced a redistribution on **3** of them (18 Jun, 2 Jul, 30 Jul); on 2 Jul the old cap of 2 passed a 2-star stack the new cap of 1 catches. Admin preview chips use the same dynamic cap so the ★ chip can't contradict what the balancer enforced. |
| Balancer logic extracted to `src/lib/balance.ts` + unit tests | ✅ | chat 30 Aug 2026 · commit pending | Both bugs above survived because the logic sat inside `AdminTeamBuilder.tsx` with nothing exercising it. Now a pure module with 8 tests, including a regression test verified to FAIL against the old implementation (over-40 spread stays at 3 instead of collapsing to ≤1). Test count 73 → 81. |
| ⚠️ Balancer v2 remains UNVALIDATED | ⚠️ | chat 30 Aug 2026 | v2 shipped 14 Aug; only **2** games have been played under it (20 + 27 Aug), both 2-team. Its founding metric ("highest-rated team came last 3 times in 10") needs 4 teams and is undefined at 2. Both its constraints are near-inert at 2 teams: the star cap is trivially met at 2v2, and age spread is meaningless when 11–15 of 18–20 players are over 40. Do NOT tune on this data. Re-measure once (a) the 9 new players are rated and (b) a run of 4-team nights is on file. Also note goal margin is NOT comparable across formats — a 4-team night is 6 short games, a 2-team night is one long one. |
| ⚠️ 19 players on default ratings | ⚠️ | chat 30 Aug 2026 · [primer 27](primers/pdf/27-ratings-audit.pdf) | **Revised up from 9** — the first count filtered on "joined since 15 Jul" and missed established players who were never rated. 19 players with appearances have all nine base attrs at the default 7 and no card stats, 8 of whom played in August. Biggest omission was **Max Farley**: 7 apps (more than anyone else unrated), a MOTM win and 8 votes, still on an untouched default. Four have no `preferred_position_primary` either, which matters because the balancer's swaps are position-matched and a player without one lands in a catch-all `REST` bucket that blocks both constraints from fixing his team. **Trap:** setting `overall_rating` alone changes nothing for the draft — `effectiveAttrs` only reads the card path when `card_pace` is non-null, so the draft keeps seeing a flat 7 while the star cap and RTG chip use the new number. Fill the six `card_*` stats. Worksheet: primer 27 (PDF) / `docs/primers/src/27-ratings-audit.html` (interactive). **Admin action, blocks meaningful re-measurement.** |
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

The push infrastructure from 5 Jul now supports any new topic on any trigger. Every row here is small (~10-30 min each) — the constraint isn't effort, it's volume. Notification fatigue is the enemy. Design guard-rail: **max 4 pushes per weekly cycle, or add a preferences UI before layering more on.** → The preferences UI landed 30 Aug 2026 (mig `081`), so this section is unblocked. Every new push MUST declare a category in `push_targets()`, or be justified as always-on.

| Item | Status | Source | Notes |
|---|---|---|---|
| Match-report push ("This week's report is up") | 🟢 | chat | New trigger on `results` table when `summary` flips NULL → not-NULL. Same edge function, new topic `'report'`. Fires the Friday morning after admin writes the report. Cheap (~10 min). |
| Sign-up deadline reminder — 2h before lock | 🟢 | chat | pg_cron job every Wed 20:00 London; fetches next Thursday's `matches` row + everyone NOT in `availability` for that date, filters to WTPs/subscribers with `preferred_position_primary` (i.e. active roster), fans out `"Are you in for Thursday?"`. Roster filter matters — we don't nag inactive players. Medium (~30 min). |
| Teams-published push ("Teams are up — check who's in your side") | 🟢 | chat | Trigger on `matches.status` flipping to `'published'`. Same edge function, new topic. Nice-to-have but arguably low-signal since players will see it Thursday morning anyway. Skip if we're worried about volume. |
| Player notification preferences UI | ✅ | chat 30 Aug 2026 · commit pending · migration `081` | Shipped as **five categories, not per-topic toggles** — Match night · Results & awards · Predictor games · Money · Club news. 8 live pushes with ~9 more queued would have been a wall of 17 switches nobody reads. New `notification_preferences` table + `NotificationPrefsCard` under `PushOptInCard` on Profile. **Schema correction:** the original plan (JSONB on `push_subscriptions`) was wrong — that table is one row per *(player, browser)*, so muting on your phone would have left your laptop unmuted. Preferences are keyed on `player_id` instead. **Absence of a row = everything on**, so nothing needed seeding across 86 profiles and new signups inherit defaults for free. "Turn everything off" is a bordered destructive pill behind a confirm sheet, not a switch. |
| Audience resolver — one place for every push | ✅ | chat 30 Aug 2026 · commit pending · migration `081` | `public.push_targets(category, player_ids, include_admins)` — security-definer, service-role only. Applies the roster gate and the preference gate in one query and returns the eligible subscriptions. All 4 fan-out call sites across 3 edge fns now route through it. Audience rules had been smeared across the edge functions and drifted; this is the fix for that class of bug, not just the instance. |
| ⚠️→✅ Admins missed pushes on their off-weeks | ✅ | chat 30 Aug 2026 · commit pending · migration `081` | An off-roster admin got nothing for `teams_ready` / `vote_open` because both filtered to `team_players` — publish the line-up on a week you aren't playing and you'd get no confirmation it went out. `push_targets(..., p_include_admins => true)` rides admins along past the roster gate. They still honour their **own** preferences (an admin who mutes Money stays muted); defaults being all-on means an admin who never opens the screen keeps getting everything. |
| ⚠️→✅ Revert the 13 Aug `teams_ready` widening | ✅ | chat 30 Aug 2026 · commit pending | Commit `973f927` widened `teams_ready` to every subscription. Never deployed, and now reverted before it ever shipped — admin's call 30 Aug: at 18 subscriptions across 86 profiles, buzzing non-players about a line-up they aren't in is the fastest way to make them kill push entirely. `teams_ready` stays rostered-players + admins. Revisit only once adoption is materially higher. |
| Always-on tier (call-ups can't be muted) | ✅ | chat 30 Aug 2026 · commit pending · migration `081` | "⚽ You're in tonight" (dropout replacement) and the future waitlist-promotion push carry **no category** and bypass preferences entirely — if a fella could mute the message telling him he's playing in three hours, we'd be a man short. Enforced server-side via `push_targets(p_category => null)`; the confirm sheet on "turn everything off" says so explicitly, so the nuclear option doesn't read as "stop telling me I'm playing". |
| ⚽ Waitlist promotion push ("you're off the waiting list") | 🟢 | chat 30 Aug 2026 | **Highest-value gap on the list.** `availability_auto_promote` (mig `030`) promotes silently today — a fella can be moved into Thursday's game and never find out. Belongs in the always-on tier alongside the dropout replacement ping. |
| 🩹 Injury return-date reminder | 🟢 | chat 30 Aug 2026 | Injuries (mig `078`) store a return-Thursday and nothing acts on it. Wed cron → "you're due back tomorrow, fit to play?". Closes the loop on a feature that shipped 23 Aug. Category: `match_night`. |
| 💷 WTP charge notification | 🟢 | chat 30 Aug 2026 | WTP auto-charge (migs `023`/`043`/`044`) debits £5 silently; players discover it later and query it. A ping at charge time kills the dispute before it starts. Category: `money`. |
| 🎭 Theme of the Night reveal | 🟢 | chat 30 Aug 2026 | Theme (mig `060`) is set by admin and only ever discovered by opening the app. Category: `match_night`. |
| 📅 Sign-up is open | 🟢 | chat 30 Aug 2026 | Nothing announces the window opening — regulars run on habit, newer fellas miss it entirely. Category: `match_night`. |
| 📈 Monthly round-up published | 🟢 | chat 30 Aug 2026 | The generator drops a PDF on the 1st that nobody is told about. Category: `club_news`. |
| 🃏 Your card's been updated | 🟢 | chat 30 Aug 2026 | Rating changes are invisible unless you go looking. Pairs with the balancer work. Category: `club_news`. |
| Voting-close warning ("2 hours left to vote") | 🟢 | chat 30 Aug 2026 | Lower priority — risks tipping the weekly volume past comfortable. Category: `results`. |
| Milestone pings (50th appearance, unbeaten run) | 🟢 | chat 30 Aug 2026 | Nice-to-have engagement hook. Category: `club_news`. |
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
| Club Finances tracker (admin-only) v1 | ✅ | chat 12 Jul · migration `052` | New Admin → Club tab. Tracks the two big flows for club solvency: seasonal subs income (£95 × subscribed players per Apr→Mar season) and pitch hire expenses (£70.17 per match, auto-generated by DB trigger on any new match). Balance callout (cash + projected), per-player subs list with Mark Paid toggles, expenses grouped by month. Backfilled 2026-27 season on migration: 45 unpaid subs (£4,275 potential) + 13 pitch rows (£912.21 booked). Extra expense categories (equipment/food/tournament/other) supported by schema but no admin UI yet — lands when a real one comes up. |
| Club Finances v2: player-facing sub status card | 🟢 | chat 12 Jul | Card on Profile for subscribed players: "You paid £95 on Xdate, next renewal Y". Optional push nudge on renewal window. |
| Club Finances v2: WTP + fines fold into balance | 🟢 | chat 12 Jul | Include the existing wtp_games + fines income streams in the same P&L callout. Currently the v1 balance is subs-only vs pitch-only; full picture needs the WTP roll-up. |
| Club Finances v2: admin UI for ad-hoc expenses | 🟢 | chat 12 Jul | Schema supports equipment/food/tournament/other categories — add an "Add expense" button + form. Deferred until a real category needs entering. |
| Stripe / online payment | 🟢 | chat | One-tap settle from the app instead of cash to admin |
| Auto-apply credit when payment recorded | 🟢 | chat | Single UI: "Mike paid £5" → marks £2 fine paid, adds £3 credit automatically |
| Monthly admin sub-chase reminder | ✅ | commit pending 31 Aug 2026 · mig `083` · edge fn `admin-subs-chase-monthly` | Subs cover Apr → Mar. **Push**: pg_cron `0 8 1 * *` (08:00 UTC 1st of each month) → `call_admin_subs_chase_monthly()` → edge fn queries `club_subscriptions WHERE season = current AND paid = false`. Silent when 0 unpaid — no "well done" pings. Otherwise pushes to admins only (`push_targets(p_category => 'money', p_player_ids => [], p_include_admins => true)`) with body "N unpaid for 2026-27 · £X outstanding (oldest since MMM YYYY)". Deep-links to `/admin`. Vault secret `subs_chase_url` set. **Persistent card**: yellow "Chase list" callout on Admin → Club Finances above the subs list — visible year-round while any sub is unpaid, one-tap "Show unpaid" filter. |

## 🛂 Delegate roles

Granular permissions so admin can hand off narrow tasks (scoring, fines, etc.) to trusted players without minting another full admin.

| Item | Status | Source | Notes |
|---|---|---|---|
| `can_enter_results` delegate role (scores + scorers only) | ✅ | chat · migration `033` · commit `9c8e0a8` | Ross Marks granted. RLS helper `can_manage_results()` covers fixtures/goals/results full write + matches UPDATE only. All other admin gates still check `is_admin`. |
| Admin UI: toggle delegate roles per player on the admin profile editor | 🟢 | chat · follow-up to `9c8e0a8` | Avoids manual SQL when granting/revoking |
| Indicator on Admin profile page showing who holds each delegate | 🟢 | chat | "Score entry: Ross Marks" — easy audit |
| Additional delegate roles as needed (e.g. `can_manage_fines`, `can_publish_teams`) | 🟢 | chat | Same pattern — helper fn + replace policy condition |

## 📣 Feature announcements

Broadcast a "what's new" push to the whole group when a feature ships, on a schedule that respects group sleep.

| Item | Status | Source | Notes |
|---|---|---|---|
| Feature-announcement broadcasts — v1 | ✅ | chat 20 Aug 2026 · migration `079` · edge fn `send-feature-announcement` **deployed v1, 30 Aug 2026** | **Was dead on arrival for a week:** mig 079 shipped 23 Aug with the cron live and the vault secret set, but the edge fn was never deployed — and `dispatch_pending_feature_announcements()` claims each row (sets `sent_at`) *before* invoking it, so the first announcement admin wrote would have been marked sent and silently never delivered. Caught 30 Aug with the table still empty, so nothing was actually lost. Deployed with `verify_jwt: false` — mig 079's `net.http_post` sends no Authorization header, so the default `true` would have 401'd every dispatch just as silently. Audience is now `push_targets('club_news')`. | New `feature_announcements` table (title / body / url / scheduled_for / sent_at / sent_count / total_subs), admin-only RLS writes, public read. `AdminAnnouncementsBar` at the top of the Admin page (always visible, above the tab strip) — one-tap "+ New" opens a bottom-sheet composer with title / body / deep-link fields and a live "Will send at [Wed 24 Sep, 9am UK]" preview. Preview computed by `nextNineAmUk()` (`date-fns-tz`, handles BST/GMT). Scheduled_for is stored absolute (timestamptz). 15-min pg_cron (`0,15,30,45 * * * *`) runs `dispatch_pending_feature_announcements()` which claims each pending row (sets sent_at optimistically to guarantee at-most-once), then calls the edge fn. Edge fn fans out to every push_subscription (same audience as the `results` topic) and writes sent_count + total_subs for admin diagnostics. Bar surfaces "N pending · next fires [when]" or "Last sent [when] · X/Y delivered". SW bumped to v47. Vault secret `feature_announce_url` set to the edge-fn URL. |

## 🩹 Availability — injury list

Self-service injury reporting so admin doesn't chase, and the group knows why a regular's missing.

| Item | Status | Source | Notes |
|---|---|---|---|
| Injury list — v1 self-service | ✅ | chat 20 Aug 2026 · commit pending · migration `078` | New `injuries` table (player_id / injury_type / notes / reported_at / return_date / cleared_at / cleared_by) with a CHECK constraint forcing `return_date` onto a Thursday. Read policy public, write policy self-or-admin, delete admin-only. Player self-serves from Profile → Injury status card: pick from quick-chip types (Hamstring / Calf / Knee / Ankle / Back / Shoulder / Illness / Other) or type free-text, pick a return-Thursday from the next 8 available, and hit report. Later they clear via "I'm fit" or push their return date out with "+1 week". Tonight tab surfaces `v_active_injuries` under a "🩹 On the injury list" strip (public — everyone sees who's out and until when); auto-hides when the list is empty. Sign-up shows a warn-only banner if the fella has an active injury for that Thursday — admin call: some fellas play through niggles, don't block them. Admin → Injury tab lists currently-out fellas with a "Clear on behalf" button (useful for stubs / forgetful players) + the last 90 days of history. SW bumped to v46. |

## 🎬 Match narrative & rituals

Narrative depth around the game — throwbacks, photo culture, moments that turn a Thursday into a shared story.

| Item | Status | Source | Notes |
|---|---|---|---|
| On-this-day throwback in match report | 🟢 | chat 31 Aug 2026 | Auto-inserted `app_watch` entry: "One year ago tonight: 6-4 to Bibs, Sheridan hat-trick, Paul saved a pen." Pulls from `results` + `goals` for the same Thursday last year. Free narrative depth for zero admin effort; deeper archive → richer entries over time. Skip when no data exists (year one). ~2 hours; pure query + template. |
| Photo of the week — winning team + trophy | 🟢 | chat 31 Aug 2026 | New `match_photos` table (submitted_by / image_url / match_id / winning_team_id). Any player can submit; admin picks one per week. Renders as a hero on the Tonight tab through Wed → Thu, and inline in the match report. Angle: focus on the winning team holding an (imagined for now, physical later?) trophy — makes winning feel like something. Ties to profile-photo adoption (35%) — showing the culture normalizes uploads. ~1 day; standard Supabase Storage flow. |
| Rivalry cards v1 — Profile Duos + Rivals | ✅ | commit pending 31 Aug 2026 · mig `084` · SW v51 | First materialised view in the codebase. `v_player_pair_stats` aggregates per (canonical pair, season, same-team-boolean): `fixtures_played`, `matches_played`, W/D/L from player_a's perspective. `player_pair_stats_for(p_player_id, p_season)` RPC hides the "am I A or B" inversion. Refreshed nightly at 04:00 UTC via pg_cron. **Profile "🤝 Duos & rivals" card** live: top 3 duos by win-rate + top 3 rivals by encounters. Season-scoped default (min 5 fixtures) with all-time toggle (min 10). Self-hides for new players. Verified against real data — Paul + Beau 5 games / 15 fixtures / 67% win-rate this season. |
| Rivalry cards v1.5 — Stats hero + team-publish caption | ✅ | commit pending 1 Sep 2026 · mig `085` · SW v52 | Two new RPCs on top of the v1 MV: `duo_of_the_month(date)` (recomputes from raw fixtures so any calendar month works, not just season boundaries) and `best_duo_from_players(uuid[], int)` (reads the MV). **Stats "Duo of the Month" hero card**: new 5th tile in the horizontal scrolling strip (added a `'purple'` tier to HeroCard); shows "Callum + Sheridan · 100% win rate · 4g" style. Self-hides when no pair meets the min-3-fixtures floor for the month. **Team-publish caption**: `BestDuoCaption` component slots between roster + FormationPicker on every published team card in TeamsPage; renders "🤝 Best duo · Ross + Daren · 3W-1D" when data supports it. Verified against real data (Aug Duo of Month = Callum Finch + Sheridan Winter 100% over 4 games; 27 Aug non-Bibs best duo = Ross Marks + Daren Low 75% over 4). Personal chips on individual PlayerCards deferred as v1.6 if pattern lands. |
| Rivalry cards v1.6 — personal chips on PlayerCards | 🟢 | chat 1 Sep 2026 | Deferred from v1.5. Inline chip on the viewer's own PlayerCard within a published team: "You + Sheridan: 8W-2L this season". Complements the universal "Best duo tonight" caption (which is contextual to the team, not the viewer). Ship if the v1.5 caption gets traction. ~half-day; same MV. |

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
| Started as tonight-only; promote to permanent if it lands | ✅ | chat · migration `055` | Verdict: keep as **one-off/opt-in** rather than default-on every week. Migration 055 adds `matches.shootout_enabled` (default `false`), backfilled `true` for the 9 Jul night so historical results still render pens + bonus. AdminMatchEntry gains a small ON/OFF toggle at the top for admin to flip when a special night justifies it (WC final, cup night). |
| Shared `buildTable`/standings helper (kill the 3-way duplication) | 🟢 | chat | 3-1-0 + shootout-bonus logic is currently copied across `AdminMatchEntry`, `MatchResultView`, `StatsPage`. Extract to a tested `lib/standings.ts` to stop drift. Deferred from the shootout ship to avoid refactoring the hot path pre-match. |

## 🎯 Predictor games — season formats

The **Cup tab** (WC 2026 predictor) proved the appetite: 1,859 picks across 104 fixtures in 6 weeks, 28 distinct predictors, 65% opening-week retention through to the final. Post-WC, the tab persists as a permanent **Predictor** hub for domestic-season games. Full committee proposal doc at `WF_PL_Predictor_Proposals.pdf` (three formats — LMS · Season Card · Match of the Week). Committee approved **Match of the Week** + **Season Card** for 2026/27, free to play. Last Man Standing deferred.

| Item | Status | Source | Notes |
|---|---|---|---|
| Cup tab → Predictor tab shell | ✅ | chat 24 Jul · commit pending · migration `061` | Bottom-nav slot 5 renamed **Predictor** (icon 🎯) — permanent (was WC-only). GameTabs sub-strip inside CupPage lets us host multiple formats: World Cup (archive) · Match of the Week (coming soon) · Season Card (coming soon). Interest telemetry via `feature_interest_events` (mig 061) so we can see how many distinct fellas click into the coming-soon tiles before committing build. |
| World Cup tab archived | ✅ | chat 31 Jul · commit pending | Tournament complete (Spain 1-0 Argentina, sweepstake winners crowned + notified). Predictor tab default game switched from WC → MoW; tab order reshuffled to MoW · Season Card · WC; WC tab carries a "DONE" pill + dashed border to signal archive status. WC data still accessible for reference — leaderboard, picks history and sweepstake all live. |
| Match of the Week — v1 (Chunk A + B) | ✅ | proposal 03 · chat 24-26 Jul · migrations `062`+`066`+`067` · commits `d8c3ac5` + follow-ups | Committee-approved. Auto-picked marquee fixture each week; scoreline pick; 5 pts exact · 3 pts result · 0 wrong. Shell + DB + score-picker UI + weekly/season leaderboards + fixture pool + weekly picker + results poll all live. 4 edge fns (`mow-seed-fixtures`, `mow-pick-weekly`, `mow-fetch-results`, `mow-notify`) using football-data.org free tier for PL + Championship. Chunk B additions: pg_cron scheduling (Mon 08:00 pick, 07:00+15:00 result poll), MoW push notifications on publish + result, recently-picked-club penalty on the picker (2pts deducted per club appearance in the last 4 weeks so West Ham fixtures don't dominate every Monday), Season Card admin resolve panel inside CupAdminPage. Vault secrets required for cron/push: `mow_pick_url`, `mow_fetch_url`, `mow_notify_url`. |
| MoW — picks hidden until kickoff | ✅ | chat 1 Aug 2026 · commit pending | Weekly leaderboard used to show every fella's pick during the 'open' phase — meant a late picker could copy whoever went first, and the group's consensus was on display before anyone had to commit. Now `OpenPicksList` renders a name-only view with a 🔒 chip; scoreline + winner-badge columns only unlock once phase flips to 'locked' (kickoff time). SW bumped to v42. Primer 25 + PreviewCard copy updated to explain the hidden-until-kickoff behaviour and drop the "results Monday morning" claim (midweek MoWs settle later in the week). |
| MoW — scoring rescaled 5/3/0 → 3/1/0 | ✅ | chat 2 Aug 2026 · commit pending · migration `074` | Admin call: 5-vs-3 was too tight, the exact-score wasn't materially worth the risk vs a safer right-result call. New 3x-vs-1x gap makes calling the scoreline genuinely worth it while a right-winner call still isn't wasted. Migration swaps the CHECK constraint (0,3,5)→(0,1,3), rewrites the settle trigger, rescores every already-settled prediction from the raw scores + picks (no half-and-half state), and updates the season leaderboard view. UI copy in `MowGame.tsx` (score-key strip · SettledCard label + tone · WeeklyLeaderboard tone · PreviewCard bullets) and the primer 25 scoring block all follow. Zero settled rows at migration time — season hasn't started — so no leaderboard shuffle to communicate. SW bumped to v44. |
| Match report Predictor Watch — cover last week AND this week | ✅ | chat 31 Aug 2026 · commit `cf495f6` | Match report push and MoW picker both fire Friday morning (max(voting_close, report_completion) vs 08:00 UTC cron), so by delivery time both the settled last-weekend result and the just-picked coming-weekend fixture are available. 27 Aug report was shipped with only the settled Brentford 3-0 Tottenham line; retro-added "This weekend's MoW just dropped: Watford v West Ham, Sat 15:00 UK. Get your prediction in on the Match tab before kick-off." Template locked in CLAUDE.md so future weekly reports don't repeat the miss. Pattern: last-week result + this-week fixture (no score) + Season Card status, all in one 🎯 Predictor watch entry. |
| MoW picker v3 — scope + recency | ✅ | chat 28 Aug 2026 · commit pending · `mow-pick-weekly` v6 deployed | v1 (Jul) affinity-weighted, dominated by 11 WH fans + fussy penalty. v2 (1 Aug) pure random from PL+ELC, but three consecutive picks landed on WH/Spurs/WH (two v1 legacy + one v2 unlucky roll on 22-fixture pool). Admin flagged pattern 28 Aug. v3 (this) combines scope + recency: pool = all PL + any lower-league fixture featuring a club a player has favourited (forward-compatible for L1/L2/Scottish/etc when a new fan sets one), then exclude any fixture whose home or away club appeared in the last 3 MoW picks. Fall back to scoped pool if recency depletes. Rich diagnostic payload (raw/scoped/final pool sizes + affinity clubs + recency-excluded clubs + affinity match flag). Also fixed a stale header comment claiming Monday 09:00 UK schedule — actually Friday 09:00 UK since mig 072. This weekend's Watford v West Ham pick (already published from this morning's pre-v3 cron) left in place so fellas mid-prediction don't see it swap under them. |
| ~~Push audiences widened — teams_ready + vote_open~~ | ❌ | chat 13 Aug 2026 · commit `973f927` · **never deployed, superseded 30 Aug** | Written 13 Aug after that night's publish reached only 8 of 20 rostered fellas, but it sat undeployed for 17 days (`send-vote-notifications` was still on its 23 Jul build). Superseded by mig `081`: the half of it that was right — admins riding along past the roster gate — is now in `push_targets(p_include_admins => true)`. The half that was wrong — `teams_ready` going club-wide — was reverted on admin's call, because at 18 subscriptions across 86 profiles, buzzing non-players about a line-up they aren't in is the fastest way to make them kill push entirely. Lesson logged: **a commit is not a deploy** — check `list_edge_functions` `updated_at` against the commit date before calling a push feature shipped. |
| Match of the Week — lower-league fixture pool | 🟡 | chat 24 Jul (rec by admin) · deferred to Chunk B | football-data.org free tier does NOT include L1/L2 (paywalled). openfootball/football.json covers them for free but hasn't published the 2026-27 season yet as of 26 Jul. Two paths: wait for openfootball to publish then bolt on a second seed source, or accept PL+Championship-only for the season. Group's L1/L2 affiliations are thin (Sheff Wed = L1, everyone else is PL/Champ), so v1 with just PL+Champ still hits ~95% of `favourite_club` affinity. |
| Season Prediction Card — v1 | 🟡 | proposal 02 · chat 24 + 26 Jul · migrations `063`+`064` · commit pending | Committee-approved. **Shipped Chunk A:** 7-market card in Predictor tab — PL winner, top 4 places 2-4 (ordered), relegated (ordered), Golden Boot, most assists, first sacked, Championship promoted (Champion/Runner-up/Playoff Winner). Searchable dropdowns for players; favourites-first ordering for clubs. Auto-saves per pick. Locks 1h before matchday 1 (Fri 14 Aug 2026 19:00 UK best-guess placeholder — admin can UPDATE lock_at once fixtures published). Reopens for 2 days after summer transfer window closes (2-4 Sept 2026). Scoring: 10 pts singles, 3 pts exact-slot / 1 pt right-club-wrong-slot for triples. Max ≈67 pts. WF wildcards **cut per admin (26 Jul chat)** — keep it focused on the 7 core markets. |
| Season Card — player + manager options seed | 🟡 | chat 26 Jul | Depends on deploying `season-card-seed-options` edge fn. Pulls all ~500 PL squad players + 20 managers from football-data.org `/competitions/PL/teams?season=2026`. Manager `default_rank` inherits club rank so first-sacked dropdown shows top-6 job holders at the top. Player search is alphabetical — users type name to filter. Once seeded, the two player markets + first-sacked market populate. |
| Season Card — resolve/admin panel + notifications | 🟢 | chat 26 Jul (Chunk B) | Admin panel to enter `resolved_answers` per market as season progresses (Golden Boot in May, promoted in May, first-sacked whenever, etc). Notifications on each market resolve. "Predictions Watch" line in weekly match report. Season leaderboard already ships (view `v_season_card_leaderboard`); admin panel unlocks it in practice. |
| Last Man Standing | 🟢 | proposal 01 · chat 24 Jul | **Deferred.** One pick per gameweek, no team twice, draw = out; rounds restart when everyone falls. Interesting but the committee picked MoW + Season first — revisit if MoW gets clear traction and we want a second layer. |
| Automated PL results feed (free tier) | 🟡 | proposals 01+03 | Prerequisite for MoW auto-scoring. Options: football-data.org (used for WC — 502-prone), api-football, or manual admin CSV / one-liner SQL. Same dependency as any auto-graded predictor. Decide at build time. |
| Fixture-picker uses lower leagues + club affiliation | 🟡 | chat 24 Jul (rec by admin) | Lower-league fixtures matter — several of the group support outside PL (see `profiles.favourite_club` — 28% adoption, real signal for the ones who set it). Algorithm should weight fixtures where at least one team is a supporter's club before falling back to PL headliners. |

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

## 📝 Governance & records

Append-only records of the admin decisions that shape the group — half-sub arrangements, house-rule changes, dispute resolutions, roster bans, finance one-offs. Currently these live in `CLAUDE.md`'s "Known data quirks" section which nobody except Claude touches; when the admin baton passes, the new person has zero context. This theme makes the audit trail first-class.

| Item | Status | Source | Notes |
|---|---|---|---|
| Decisions log — v1 admin-only | ✅ | chat + commit pending 31 Aug 2026 · mig `082` | New `decisions` table (decided_at, decided_by, category, summary, details, related_player_id nullable, effective_from, effective_to, archived). Categories: subs / house_rules / disputes / roster / finance / other. Admin → Decisions tab with reverse-chronological list, category filter chips + text search. "+ New" bottom-sheet composer modelled on AnnouncementModal: category grid, summary, details, from/to date pickers. Auto-fills dates by category — subs default to current season boundaries (Apr → Mar); house_rules default to today + null-to (ongoing). Append-only via RLS — editable only within 24h grace, no delete. Archive button within grace window for typos. SW v50. |
| `club_subscriptions.decision_id` FK | ✅ | commit pending 31 Aug 2026 · mig `082` | Added in same migration. Nullable FK to decisions.id with ON DELETE SET NULL. Backfill from existing notes deferred (small enough to hand-link when admin logs the seed decisions). |
| Seed migration — CLAUDE.md quirks as historical decisions | 🟢 | chat 31 Aug 2026 | Populate the log with every known decision from `CLAUDE.md` "Known data quirks": Felix shares Guy's sub (effective from 2026-04-01, indefinite); Aaron/Beau/Chay half subs (from 2026-04-01, indefinite); pitch rate change £67.80→£70.17 (from 2026-09-03); £331 season-transition catch-all; the historical house rules (no slide tackles, Ross exception, no Mags 😃, £2/£3/£5 fine ladder, 9:10pm cutoff). Once seeded, the CLAUDE.md quirks section can point to the log as the primary source. ~half-day. |
| Public house rules derived view | 🟢 | chat 31 Aug 2026 | `/help/house-rules` route rendering `decisions WHERE category = 'house_rules' AND (effective_to IS NULL OR effective_to > current_date)` as a numbered list. Auto-updates as rules land; no separate hand-edited markdown to drift. Link from induction pack so it stops re-derived from memory each render. ~half-day. |
| Admin baton handover doc auto-generated from log | 🟢 | chat 31 Aug 2026 | Deferred v2. Small script that renders the full decisions log as a WeasyPrint PDF branded "WF admin handover pack" — everything a new chair needs to know, sorted by category. On-demand button in Admin panel. Waits until v1 log has 6+ months of use. |

## 📆 Monthly stats round-up

Auto-generated one-page summary of the month's football — top scorers, MOTM/DOTD leaders, clean sheets, attendance, best predictions, etc. Runs after the last match of the calendar month so admins don't have to author it manually.

| Item | Status | Source | Notes |
|---|---|---|---|
| Monthly stats PDF generator (GH Actions cron) | ✅ | chat 10 Jul · commit pending | Runs on the 1st of every month at 07:00 BST via `.github/workflows/monthly-roundup.yml`. `scripts/monthly-report.mjs` pulls that month's data from Supabase (month-scoped SQL filters), renders a one-page Wanstead-Fellas-branded HTML that matches the June 2026 reference template, hands off to WeasyPrint, commits to `docs/primers/monthly/YYYY-MM.pdf`. No Anthropic API — pure SQL → HTML → PDF. June 2026 verified: 4/24/59/49 headline · Beau 7 · Mark 2.00 avg GA · Paul 28.97 km · £12 fines pot. |
| ⚠️→✅ Workflow never actually ran (invalid YAML) | ✅ | chat 1 Aug · commits `3cbcb6f` (fix) + `e1e5526` (rename) | **The generator above had never once run** since 11 Jul — the cron never fired and every push logged an instant "No jobs were run" failure (180+). Root cause found via `actionlint`: the `git commit -m "…"` in the Commit + push step opened a **multi-line quoted message whose body lines sat at column 0**, prematurely ending the `run: \|` block scalar → the whole file was **invalid YAML**. GitHub can't schedule an invalid workflow, and logs a failed run whenever the bad file rides along in any push (regardless of triggers) — which is why the failures looked like phantom `push` runs on a `schedule`-only workflow. Sibling `weekly-review.yml` (single-line commit msg) was valid and unaffected — the red herring that made it look trigger/registration-related. Fixed by switching to two `-m` flags so all content stays inside the indented block; also renamed `monthly-report.yml` → `monthly-roundup.yml` (mid-debugging, to rule out a corrupted workflow object). Verified: a push carrying the valid file now spawns **zero** runs. **Real proof still pending: the 1 Sep 06:00 UTC cron actually producing a PDF.** Lesson: `actionlint` any workflow before assuming the `on:` block is the problem. |
| Deeper stats in the monthly PDF | ✅ | chat 1 Aug · commit pending | Expanded `scripts/monthly-report.mjs` beyond the v1 snapshot, same branded format. New: **Best Haul** (most goals in one night) + hat-trick tally; golden-boot **goals/game**; **Goals by position** bar (ATT/MID/DEF/GK share); new **Form · Results** section — **Win-Rate King** (rate-adjusted), **Biggest Win**, **Highest-Scoring Game**, **Shootouts** count; **The Sieve** (leakiest defence, foil to The Wall); **Fastest** (top `max_speed_kmh`); **Own Goals** tally. Empty-data tiles (Fastest, Own Goals) degrade to muted states so they self-populate later. Verified end-to-end against the July fixture. **Not tracked, so excluded:** assists (no column on `goals`); predictions accuracy left for the editorial-narrative option. Regenerate a month's PDF by re-running the workflow with that `YYYY-MM`. Page-break follow-up: each section wrapped in a keep-together `.section` block (`break-inside: avoid`) so the 2-page split falls cleanly between sections, never mid-card. |
| In-app "Monthly" tab | 🟢 | chat 10 Jul | Follow-up to the PDF generator. New route `/monthly` (or nested under History) that surfaces the monthly summaries in-app with an archive back through prior months. Same data as the PDF, mobile-friendly render. Ship after the PDF generator is battle-tested and the shape has settled. |
| Per-player monthly personal review | 🟢 | chat 31 Aug 2026 | Extend `scripts/monthly-report.mjs` with `--player=<uuid>` mode. Loops across roster after the group PDF completes. **Contents** (in-app card, ≤400 words): apps · goals · MOTM/DOTD · your best game · favourite teammate this month · streak status. **Delivery**: push at 07:15 BST on the 1st ("🃏 Your August wrapped: 4 apps, 3 goals, 1 MOTM"), deep-links to `/profile/monthly/YYYY-MM`. Category `club_news`. Positive-only — no rankings; group PDF handles those. Suppress for zero-apps players. ~2 days (script + card + push). |
| Annual "Your season" PDF per player (April season-end) | 🟢 | chat 31 Aug 2026 | 2-page WF-branded PDF fired 1 Apr 07:00 BST. **P1 the numbers**: apps · goals · MOTM/DOTD · win rate · GPG · best game · favourite pairing · biggest win + worst loss you were in · fines total. **P2 the arc**: month-by-month sparkline · chronological awards timeline · standout match-report quote where you were named · card rating start-vs-end. Delivered via push ("📆 Your Wanstead Fellas 2026-27 is ready") deep-linking to landing page with Signed URL PDF download. Optional email attach if fella has one. Reuses monthly-report infra + WeasyPrint pipeline. Storage cost trivial (~500KB × 86 = 43MB/yr). ~1 day extra on top of monthly. **Plan for March 2027 build** so annuals fire on schedule. |

## 🔄 App updates

Getting a shipped build onto people's phones is its own problem — an installed PWA can stay resident for days and quietly run last week's JS.

| Item | Status | Source | Notes |
|---|---|---|---|
| In-app "new version available" refresh prompt | ✅ | chat 30 Aug 2026 · commit pending | `sw.js` no longer calls `skipWaiting()` on install — that was activating new builds silently, so there was never a *waiting* worker for the app to notice and players sat on stale bundles until they happened to fully relaunch. New worker now parks in `waiting`; `registerWithUpdates()` (`src/lib/swUpdate.ts`) spots it and `UpdatePrompt` shows a bottom toast above the nav. Tapping Refresh posts `SKIP_WAITING`, and the reload is driven by `controllerchange` — reloading before the new worker controls the page just re-serves the old bundle and the prompt reappears forever. 3s timeout fallback for iOS versions where `controllerchange` is flaky. Also re-checks on `visibilitychange` + every 30 min, because a resident PWA may never reload on its own. Guarded on `navigator.serviceWorker.controller` so first-time installs aren't told to "refresh" an app they just opened. SW v49. |
| Show what's new in the refresh prompt | 🟢 | chat 30 Aug 2026 | Currently the toast says "Refresh to get the latest updates" — generic. Could read the latest `feature_announcements` row (or a `version_notes` table) so the prompt says *what* changed. Pairs naturally with the announcements feature. |
| ⚠️ First rollout needs one natural relaunch | ⚠️ | chat 30 Aug 2026 | Everyone currently runs the v48 worker, which still `skipWaiting`s. They get the prompt-capable build on their next full relaunch; from then on the prompt works. Unavoidable one-time cost of the change — nothing to fix, just don't expect the toast to appear for the group on day one. |

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
| ~~Admin tab blank-screen crash (2 Aug 2026)~~ | ✅ FIXED (commit pending · mig `073`). Root cause: the Rossini bot profile got seeded on 1 Aug with `surname=null`, and `AdminCsvImport.tsx:37` called `null.trim()` while building its name→profile lookup. React 19 propagated the throw up past `Layout` (no error boundary) so the entire shell, bottom nav included, unmounted — admins saw a blank screen with no way to navigate off it. Three-part fix: (a) Rossini surname backfilled to `''`, (b) `norm()` in AdminCsvImport now null-tolerant so future stubs don't kill the tab, (c) new migration `073` puts NOT NULL + `''` default on `profiles.name`/`.surname` so it can't recur. Bonus: new `RouteErrorBoundary` wraps `<Outlet />` in Layout — future page crashes surface an in-tab error card with the actual error message, and nav stays alive so the user can leave the broken tab. SW bumped to v43. |
| ~~Duplicate "match report is live" push at voting close~~ | ✅ FIXED (commit pending · migs `075`→`076`→`077`). Iterated three times to land on: mig 075 suppressed the awards-close push if summary already existed (killed useful buzz). Mig 076 reverted 075 (restored duplicate). Mig 077 is the clean shape — exactly one push, fired at `max(voting_close, report_completion)`: **(a)** summary-write trigger only fires the push if voting is already closed; **(b)** awards-close trigger only fires if a summary is on file. Whichever event lands second sends the push, first event logs a `raise notice` and returns. Corollary the admin accepted: if voting closes but no report is ever written, no push fires (no report → no ping). Case study — 13 Aug 2026 report shipped 03:50 UTC before voting close: under 077, the summary write would have deferred and the single push would have fired at 09:00 UTC tomorrow with voting-close. |

---

## Adding new ideas

1. **Drop a row** in the matching theme with status 🟢 and a one-line note. If no theme fits, add a new one.
2. If the idea warrants a full proposal, build a primer-style PDF and add it to `docs/primers/` as the next number; link from the row.
3. **When the item ships:** change status to ✅, add the commit short hash (and the migration number if there's DB work), but leave the row in place.
4. **Don't delete shipped items.** The audit trail of what we set out to do, vs what landed, is the whole point.
5. **Mark blockers explicitly with ⚠️** and link to the dependency. Sequencing matters more than priority.
