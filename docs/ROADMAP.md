# Wanstead Fellas — Roadmap

> **Single source of truth for what's coming next.**
> Add new ideas here the moment they're proposed — even rough ones. When something ships, leave the row in place but flip the status to ✅ and link the commit. Don't delete shipped items; the audit trail matters.

_Last updated: 2026-06-21 (Stats position filter + Top GK hero shipped)_

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

## 🪪 Identity — preferred position

The picker and DB are live. The visible payoff (position-aware cards, stats, balancer) is still to come.

| Item | Status | Source | Notes |
|---|---|---|---|
| `preferred_position_primary` + `_secondary` columns on `profiles` | ✅ | [04](primers/pdf/04-preferred-position.pdf) · commit `86c6edd` | Backfilled from legacy `position` |
| PositionPicker component (4-button grid, tap-cycle) | ✅ | `86c6edd` | Reusable, supports compact mode |
| Profile page picker | ✅ | `86c6edd` | Saved with the existing form |
| Next Game inline nudge for unset players | ✅ | `86c6edd` | Dismissible per session |
| Admin position adoption tracker | ✅ | commit `3a7d82f` · view `v_position_adoption` | Currently 49/59 = 83% set |
| Card redesign with prominent position badge + position-rank pill in footer | 🟢 | [04](primers/pdf/04-preferred-position.pdf) | Identity payoff — gold/silver/bronze by position |
| Position-aware Stats panels (Top 3 by position filter) | ✅ | [04](primers/pdf/04-preferred-position.pdf) · commit `9e5979c` | Chip strip below period toggle; filters every panel on the page |
| 4th hero card for Top GK on Stats | ✅ | [04](primers/pdf/04-preferred-position.pdf) · commit `9e5979c` | Clean-sheet leader; green tier; shown when posFilter is 'all' |
| Position-weighted overall rating | 🟢 | [04](primers/pdf/04-preferred-position.pdf) · [06](primers/pdf/06-user-guide-v3.pdf) p6 | Defender's "60 ATT" no longer drags their overall down |
| Balancer hard constraint: ≥1 GK / ≥1 ATT / ≥1 DEF per team | 🟢 | [04](primers/pdf/04-preferred-position.pdf) | Use secondaries when short on a position |
| Balancer soft constraint: MID count within ±1 across teams | 🟢 | [04](primers/pdf/04-preferred-position.pdf) | |
| ⚠️ Position-aware balancer ships only once ≥80% of regulars have a position set | ⚠️ | [04](primers/pdf/04-preferred-position.pdf) | Currently 83% — clears the bar; chase the last 10 first |

## 🛠️ Operations — balancer v2

Same 11 players, mathematically fairer teams. The 18 Jun match is the case study: SHO spread was ±12, with 3 swaps it would have been ±3.

| Item | Status | Source | Notes |
|---|---|---|---|
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
| Web push at full time ("Vote for tonight's MOTM") | 🟢 | [engagement review](MOTM_DOTD_ENGAGEMENT_REVIEW.md) | Highest-impact, highest-effort lever. PWA scaffolding exists; backend net-new |
| Web push when results publish ("Edward Ezra won MOTM") | 🟢 | engagement review | Closes the loop that today voids |
| Nav badge on Match tab when ballot is open | 🟢 | engagement review | Cheaper interim before push |
| Voting streak counter ("🔥 4 weeks in a row") | 🟢 | engagement review · [07](primers/pdf/07-balancer-peer-rating.pdf) | Loss aversion > novelty |
| Live social proof ("14 voted · 22 haven't") | 🟢 | engagement review · [07](primers/pdf/07-balancer-peer-rating.pdf) | Already partially in (`voted/eligible`) — lift visually |
| Results-reveal moment / Friday morning push | 🟢 | engagement review | Pairs with results-publish push |

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

## 📈 Data quality

New signals that the rating engine and balancer can use. Most are tiny additions to existing flows.

| Item | Status | Source | Notes |
|---|---|---|---|
| Position played per fixture — one-tap picker on match-entry sheet | 🟢 | chat | Currently no record; unlocks "GK 1 goal ≠ striker 1 goal" weighting |
| Assists tracking | 🟢 | chat | User exploring Veo recordings + shirt numbers to make this feasible |
| Self-rated form — "how are the legs?" Wednesday poll | 🟢 | chat | 5 options: 🔥 💪 🆗 🤒 🛏️ → balancer input |
| HR-zone fatigue index | 🟢 | chat | If 50%+ of last match was zone 5, flag "burnt", balancer pairs with extra runners |

## 🟥 Known issues

| Item | Notes |
|---|---|
| `MotmVotingCard` context-mismatch | Loads the latest voting window independently of the displayed match. During an open window before that night's result is entered, the page shows last week's result + report with this week's ballot wedged in. Worth tightening when this area is next touched. ([engagement review](MOTM_DOTD_ENGAGEMENT_REVIEW.md) §"Still open") |

---

## Adding new ideas

1. **Drop a row** in the matching theme with status 🟢 and a one-line note. If no theme fits, add a new one.
2. If the idea warrants a full proposal, build a primer-style PDF and add it to `docs/primers/` as the next number; link from the row.
3. **When the item ships:** change status to ✅, add the commit short hash (and the migration number if there's DB work), but leave the row in place.
4. **Don't delete shipped items.** The audit trail of what we set out to do, vs what landed, is the whole point.
5. **Mark blockers explicitly with ⚠️** and link to the dependency. Sequencing matters more than priority.
