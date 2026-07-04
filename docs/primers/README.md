# Wanstead Fellas — Primers & Proposals

Shareable, Wanstead-Fellas-branded PDFs covering two things:

- **Primers** — post-launch comms ("here's what just shipped"), for distributing to the WhatsApp group.
- **Proposals** — pre-build pitches ("here's what we could do and why"), kept here so the design rationale is searchable later.
- **Analyses** — one-off deep dives ("here's what the data showed and what we did about it"), kept here so the diagnosis is searchable later.

Stored in the repo so they don't get lost when a dev container is cleaned up, and so anyone can browse them on GitHub.

> 📍 **For status / what's coming next**, see [`docs/ROADMAP.md`](../ROADMAP.md). The proposal PDFs below are the design rationale; the roadmap is the live tracker.

## Index

| # | PDF | Type | Topic | Date |
|---|---|---|---|---|
| 01 | [`pdf/01-user-guide.pdf`](pdf/01-user-guide.pdf) | Primer | New-fella getting-started guide (original) — *superseded by 05* | Jun 2026 |
| 02 | [`pdf/02-stats-refresh.pdf`](pdf/02-stats-refresh.pdf) | Primer | Stats page refresh — hero strip, podium previews, The Wall, sections, My Stats | Jun 2026 |
| 03 | [`pdf/03-next-game-refresh.pdf`](pdf/03-next-game-refresh.pdf) | Primer | Next Game tab refresh — search, tier dots, consolidated masthead, collapsible Not-In with filter chips | Jun 2026 |
| 04 | [`pdf/04-preferred-position.pdf`](pdf/04-preferred-position.pdf) | Proposal | Player-set preferred position (primary + secondary) — unlocks position-aware stats, card identity, and balancer constraints. *Foundation slice shipped, rest tracked in ROADMAP.* | Jun 2026 |
| 05 | [`pdf/05-user-guide-v2.pdf`](pdf/05-user-guide-v2.pdf) | Primer | User guide v2 · supersedes 01 · 4 pages with visual aids · adds Stats redesign, Next Game refresh, position picker, auto WTP fees · *superseded by 06* | Jun 2026 |
| 06 | [`pdf/06-user-guide-v3.pdf`](pdf/06-user-guide-v3.pdf) | Primer | User guide v3 · supersedes 05 · 6 pages · opens with the five-pillar vision (Operations · Stats Theatre · Identity · Fairness · Community), covers every feature including History · Cards · Pods · Feedback, and an "Under the Hood" page on how features drive your card attributes (today + roadmap) · *superseded by 08* | Jun 2026 |
| 07 | [`pdf/07-balancer-peer-rating.pdf`](pdf/07-balancer-peer-rating.pdf) | Proposal | Balancer v2 (categorical balance constraints + simulated annealing) + peer-rating system. **Note**: peer-rating section was revised in-chat to extend the existing MotmVotingCard ballot rather than build a new screen — see ROADMAP. | Jun 2026 |
| 08 | [`pdf/08-user-guide-v4.pdf`](pdf/08-user-guide-v4.pdf) | Primer | **User guide v4** · supersedes 06 · same 6-page structure with three new "Coming Next" pull-quotes on the relevant feature pages (smarter team balancing · voting reminders + position-aware leaderboards · cards going live). Tells readers what's in flight without committing to dates. | Jun 2026 |
| 09 | [`pdf/09-roadmap.pdf`](pdf/09-roadmap.pdf) | Snapshot | **Roadmap snapshot** · branded PDF render of [`docs/ROADMAP.md`](../ROADMAP.md) as of 21 Jun 2026. Same teletext format as the user guide. 3 pages covering all themes (Identity · Operations · Stats Theatre · Engagement · Community · Data quality · Known issues) with at-a-glance totals. Re-render when the markdown materially changes. | Jun 2026 |
| 10 | [`pdf/10-motm-dotd-engagement.pdf`](pdf/10-motm-dotd-engagement.pdf) | Analysis | **MOTM / DOTD engagement review** · branded PDF render of [`docs/MOTM_DOTD_ENGAGEMENT_REVIEW.md`](../MOTM_DOTD_ENGAGEMENT_REVIEW.md). 2 pages: per-match turnout table, two leaks (acquisition + DOTD drop-off), structural causes, and five prioritised levers (3 ✅ / 1 partial / 1 open) with what shipped on 19 Jun 2026 and what's still on the backlog. | Jun 2026 |
| 11 | [`pdf/11-app-engagement-review.pdf`](pdf/11-app-engagement-review.pdf) | Analysis | **App engagement review** · live DB pull as of 24 Jun 2026, 90-day window, denominator 49 (active + authed). 3 illustrated pages: P1 squad funnel + headline cards + ranked horizontal bars for every feature; P2 per-match voting + Cup picks ramp + profile completeness; P3 the fitness gap (1/49 + 0/49 Polar) with the 6-tile "why nobody uploads" diagnosis and 3 ranked levers. | Jun 2026 |
| 12 | [`pdf/12-formation-picker.pdf`](pdf/12-formation-picker.pdf) | Primer | **Formation Picker** · shipped 3 Jul 2026 (migration 045). Once teams are published on the Match tab, each side gets a pitch card: pick a shape (2-3-1, 3-2-1, 2-2-2, …), tap-slot-then-tap-bench-player to assign, or hit AUTO-FILL to seed by preferred position. Anyone on the roster can edit. Covers anatomy, step-by-step assign, shape catalogue, who-can-edit, and what's coming next. | Jul 2026 |
| 13 | [`pdf/13-committee-briefing.pdf`](pdf/13-committee-briefing.pdf) | Briefing | **Committee briefing** · 3-page one-glance summary written for the newly-formed steering committee. P1 what the app is for + the five pillars + weekly rhythm + start of the live-features grid. P2 finishes the features grid (identity, stats, money, fitness, seasonal, admin) and opens the roadmap themes. P3 finishes the roadmap themes and ends with three real committee choices (sequencing · card ambition · payments) plus the two known adoption blockers. | Jul 2026 |
| 14 | [`pdf/14-profile-completeness.pdf`](pdf/14-profile-completeness.pdf) | Audit | **Profile completeness audit** · 3-page per-player attribute matrix over the 59 active (played in last 90 days). Six player-owned fields checked (photo · DOB · fav club · primary position · secondary position · foot) with green ✓ / red ✗ per cell and a `Gaps` count column, sorted by gaps ↓ so the chase list surfaces first. Coloured summary tiles up top show squad-wide %. | Jul 2026 |

> ✏️ **Versioning note.** User guides (and any other primer that gets a refresh) are kept as siblings rather than overwritten so the audit trail of what we told the squad — and when — stays intact. When a primer is superseded, flag the older row with *"superseded by NN"* but don't delete the file.

## Layout

```
docs/primers/
├── README.md          (this file — keep the index in sync)
├── pdf/               (the rendered PDFs — what gets shared / saved)
└── src/               (the HTML sources — edit and re-render to update)
```

## Adding a new one

1. Pick the next number (`05-…`, `06-…`, etc.) — kept simple so the chronology is obvious.
2. Drop a new HTML file in `src/` using the same teletext masthead / dark forest green theme as the existing ones. Copy any of the existing `src/0X-*.html` files as a starting template.
3. Render to PDF with WeasyPrint:
   ```sh
   weasyprint docs/primers/src/05-your-topic.html docs/primers/pdf/05-your-topic.pdf
   ```
4. Add a row to the index table above — flag it as **Primer** (post-launch) or **Proposal** (pre-build).
5. Commit both files in the same commit so HTML source ↔ PDF stay in sync.

## Style guide

- **Masthead:** `WANSTEAD FELLAS` (yellow `#FFD400`) over a green gradient (`#0D6B52` → `#095440`), with a teletext page tag (`P5xx · UPDATE` for primers, `P7xx · PROPOSAL` for proposals) on the right.
- **Background:** dark forest green `#0F1710`.
- **Accent palette:** yellow `#FFD400`, cyan `#4AD9FF`, green `#4ADC7A`, magenta `#FF66CC`, red `#FF5555`.
- **Fonts:** Helvetica for body, Courier New for teletext bits (page IDs, section labels, monospace stats), Arial Black for headings.
- Keep it punchy. 2 pages max so it skims well on a phone.
