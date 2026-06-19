# MOTM / DOTD Voting — Engagement Review

> **Brief (2026-06-19):** "MOTM and DOTD voting works but engagement isn't high. Looking at the UX, it feels sub-optimal. Review the workflow, layout and provide suggested improvements that will maximise engagement."

This is the analysis behind the June 2026 voting rework. It records the diagnosis, the prioritised options, what shipped, and what's still on the table.

## Diagnosis — what the data showed

Turnout per completed match (eligible = rostered players; voters = distinct people who cast at least one vote):

| Match | Eligible | Voted | Turnout | MOTM votes | DOTD votes |
|---|---|---|---|---|---|
| 18 Jun (9v9) | 36 | 18 | 50% | 17 | 13 |
| 11 Jun | 32 | 11 | 34% | 11 | 6 |
| 04 Jun | 32 | 14 | 44% | 14 | 10 |
| 28 May | 32 | 15 | 47% | 15 | 8 |
| 21 May | 32 | 15 | 47% | 15 | 9 |

Two distinct leaks:

1. **~Half the squad never votes at all** (~44% average turnout).
2. **A quarter-to-half of voters who do MOTM then bail on DOTD** (28 May: 15 → 8). The second award, sitting below the first, lost people to scroll fatigue.

Structural causes:

- **Overnight window.** Voting opened 22:00 match night and closed 09:00 the next day — most of it while people are asleep. Miss it Thursday night and you've missed it. (`getVotingWindow` in [src/lib/time.ts](../src/lib/time.ts).)
- **No reminder of any kind.** No push, no nudge. A voter had to independently remember, open the app, and navigate to the Match tab.
- **High voting effort.** Each award rendered *all* 32–36 players as an alphabetical wall of chips, with no search and no grouping — two awards ≈ 70 chips to scroll. This directly explains the DOTD drop-off.
- **No payoff loop.** Results only appeared after close, with nothing signalling they were in. You voted into a void.

The match **report is fully decoupled from voting** — it publishes the instant an admin saves the result (`status → 'completed'`, [AdminMatchEntry.tsx](../src/components/AdminMatchEntry.tsx)) and touches nothing vote-related. So widening the voting window never delays the report; only the *award reveal* moves.

## Prioritised levers (impact ÷ effort)

1. **Widen / re-time the window** — biggest single lever, tiny change. Splits into two independent knobs: *open time* (earlier = pure win, zero report cost) and *close time* (only delays the award reveal). The squad chose to keep it tight (close 10:00) so awards still land Friday morning, which intentionally spends most of this lever.
2. **Add a reminder** — highest-impact, highest-effort. The PWA scaffolding exists (manifest + registered service worker), so web-push is feasible but net-new backend. Cheaper interim: a nav badge on the Match tab when you have an open, un-voted ballot.
3. **Single-pass ballot** — render the roster once, each player with a 🏆 and 🤡 button. Kills the DOTD drop-off directly.
4. **Cut the candidate wall** — surface that night's goalscorers (and/or the voter's own team) first, with a "show everyone" expander and type-to-filter. Scanning 6 names beats scanning 36.
5. **Pin it open** — default-expanded at the top of the Match tab while the window is live, with a bold turnout count.

Lower-effort boosters: social proof / light shaming ("14 voted · 22 haven't" — fits the fines-and-banter culture), voting streaks, and a proper results-reveal moment when awards publish.

## What shipped (2026-06-19)

Implemented in [MotmVotingCard.tsx](../src/components/MotmVotingCard.tsx), [MatchPage.tsx](../src/pages/MatchPage.tsx) and [time.ts](../src/lib/time.ts):

- **Single-pass ballot** — one row per player with a 🏆 (MOTM) and 🤡 (DOTD) button; both awards cast in one scroll.
- **Goalscorers sorted to the top** with a ⚽ tag (from the goals table), so MOTM candidates surface without scrolling.
- **Search box** to filter the roster live.
- **Pinned open** — while voting is live the ballot mounts at the top of the Match tab; once closed the results return to the mid-slot (between result and report), matching the History tab.
- **Window close moved 09:00 → 10:00** the next day (open unchanged at 22:00 / full time).

## Still open (backlog)

- **Reminders** — web-push at full time ("🏆 Vote for tonight's MOTM") and on results publish ("Emmanuel won MOTM"); or, cheaper, a nav-badge nudge.
- **Social proof / shaming**, **voting streaks**, and a **results-reveal moment**.
- **Context-mismatch bug:** `MotmVotingCard` loads the *latest* voting window independently of the displayed match. During an open window before that night's result is entered, the page shows last week's result + report with this week's ballot wedged in. Worth tightening when this area is next touched.
