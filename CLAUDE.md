# Wanstead Fellas — Working notes for Claude

Conventions for any Claude session working on this repo.

## Always keep the roadmap fresh

[`docs/ROADMAP.md`](docs/ROADMAP.md) is the single source of truth for what's coming next. **Update it as part of the work, not as an afterthought.**

- When a new idea surfaces — in a proposal, a chat exchange, a review comment, a "what about…" — add a row to the right theme with status 🟢 and a one-line note, in the same change-set.
- When something ships, flip the row to ✅, add the short commit hash (and migration number if relevant), and leave the row in place. Don't delete.
- If a built-in idea reveals a follow-up, log the follow-up before closing out the current work.
- If a sequencing decision is made (e.g. "X has to ship before Y"), capture it as a ⚠️ row pointing at the dependency.

The audit trail of what we said we'd do, vs what actually landed, is the whole point.

### Roadmap PDF snapshot

There's a branded PDF render of the roadmap at [`docs/primers/pdf/09-roadmap.pdf`](docs/primers/pdf/09-roadmap.pdf) (HTML source at `docs/primers/src/09-roadmap.html`). It's the shareable, Wanstead-Fellas-branded version. **Re-render when the markdown materially changes** (typically: shipping an item, adding a new theme, big batch of new ideas — not for every typo). The convention is to overwrite `09-roadmap.{html,pdf}` rather than create siblings, because the markdown itself is the audit-trail-of-record.

```sh
weasyprint docs/primers/src/09-roadmap.html docs/primers/pdf/09-roadmap.pdf
```

If the structure of the snapshot template needs to change significantly, treat it like any other primer refresh — bump the number (10-roadmap-vN) and add a "superseded by" note in the index.

## Docs structure

| Path | What it is |
|---|---|
| [`docs/FUNCTIONALITY.md`](docs/FUNCTIONALITY.md) | Living reference of what the app actually does today (player + admin + tech). Keep updated whenever functionality changes. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What's coming next, grouped by theme. See "Always keep the roadmap fresh" above. |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | Plain-English user guide (markdown). The PDF version lives in primers as the latest `0N-user-guide-vM.pdf`. |
| [`docs/MOTM_DOTD_ENGAGEMENT_REVIEW.md`](docs/MOTM_DOTD_ENGAGEMENT_REVIEW.md) | One-off analysis doc — the diagnosis behind the June 2026 voting rework. |
| [`docs/primers/`](docs/primers/) | Wanstead-Fellas-branded PDFs (primers post-launch, proposals pre-build). See `docs/primers/README.md` for the index and conventions. |

## Primers vs proposals

Both live in `docs/primers/`. The index in `docs/primers/README.md` flags each row as **Primer** (post-launch comms) or **Proposal** (pre-build pitch). Convention: chronological numbering, sibling versioning for refreshes (`05-user-guide-v2.pdf` ← `06-user-guide-v3.pdf`), `P5xx · UPDATE` page tag for primers and `P7xx · PROPOSAL` for proposals.

## Branching

- Develop on the designated feature branch (typically `claude/fix-history-date-cutoff-8P53B` for this stream).
- Push to dev first, ff-merge to `main` to ship. Vercel auto-deploys `main`.
- The full git protocol is in the session system prompt; refer there if in doubt.

## Build & test

- `npm run build` — `tsc -b && vite build` (must pass)
- `npm test` — vitest, 38 tests at last count
- `npm run lint` — eslint (one pre-existing warning in `RankedList`; don't introduce new ones)

## Supabase

- Migrations live in `supabase/migrations/NNN_name.sql`, applied via the Supabase MCP `apply_migration` tool. Always commit the SQL file in the same change as the application so source of truth stays in git.
- Edge functions in `supabase/functions/`.
- The Wanstead Fellas project ID is `qvvlxjftrteyrsscqidc`.

## Known data quirks

Small set of one-off arrangements that don't follow the schema's normal rules — worth knowing before touching subs / finance / player_type logic.

### Felix Baker shares Guy Baker's subscription

Felix's `profiles.player_type` flips between `subscribed` and `wtp` week-on-week depending on whether Guy is also playing:

- Only Felix (or only Guy) plays → Felix is on Guy's sub, no charge
- Both play → Felix is toggled to `wtp` for that week → the existing WTP trigger charges him £5

Implications for `club_subscriptions`:

- Felix should **never** have a £95 sub row for the season — Guy's covers both.
- If a future migration or admin flow re-seeds subs (e.g. April 2027 season rollover), **remove Felix's row again** after seeding. The other 4 parent-child pairs (Paul→Stan, Paul→Callum, Stephen→Joseph, Sheridan→Mikel) all pay their own £95 as normal — Felix is the only exception.
- Longer-term fix (roadmap): `shared_with_id` column on `club_subscriptions` so the arrangement is explicit and survives re-seeds. Deferred until it becomes more than one player.

### Aaron Franklin, Beau Samuels and Chay Samuels are on half subs

Long-standing arrangement — these three pay **£47.50 instead of £95** for the season.

Implications for `club_subscriptions`:

- Their rows carry `amount = 47.50` and `notes` explaining the arrangement.
- If a re-seed sets them back to 95 (the default), correct to 47.50 again — no other special treatment needed.
- The half-sub arrangement is currently just data (`amount` column), not schema — no rules engine, no player flag. If a fourth half-sub joins, just set the amount at 47.50 with the same note.

### Chay Samuels has a duplicate profile (needs merging)

Two `profiles` rows exist for Chay Samuels — same name, no way to tell them apart in the UI:

- `0736e129-caa6-4c03-bc4a-2db3abbb2437` — older (17 May), no auth, rostered once by admin manually
- `e91738a7-1de7-41ec-877f-feebcc08c62c` — newer (23 Jun), owns the auth account, has age_group set

The newer profile is the "real" one. The one team_players row on the older stub should be moved over (`UPDATE team_players SET player_id = <new> WHERE player_id = <old>`), then the stub deleted (same pattern as the Chris Hughes merge, task #36). Not urgent — surfaced during the sub half-price setup on 12 Jul. Add to the finance/data cleanup batch next time we're in there.

## Match reports — always use the structured JSON shape

When writing or editing a match report on the `results` row, **populate the structured fields, not `report_text`**. The Match tab + History tab render the JSON fields via dedicated components (`PredictedVsActual`, `MatchResultView`, etc); `report_text` is a legacy free-prose field and should be left `NULL` going forward. The reference shape (see 18 Jun and 11 Jun for canonical examples):

| Field | Type | What goes in it |
|---|---|---|
| `summary` | `text` | Tweet-length lede paragraph — the headline narrative of the night |
| `predictions` | `jsonb` | `{ note, rows: [{position, predicted, actual}] }` — pre-match predicted finish vs actual final standings + 1-line commentary on accuracy |
| `key_highlights` | `jsonb` | Array of `{player?, label?, note}` — standout players, collective shoutouts, team-by-team commentary. This is where individual heroics live. Do NOT re-package the MOTM / DOTD winners here — the ballot renders separately and doubling up feels self-congratulatory. |
| `banter` | `jsonb` | Array of `{player?, label?, note}` — funny moments, side-stories, in-jokes |
| `app_watch` | `jsonb` | Array of `{player?, label?, note}` — fines, admin reminders, app/feature updates |
| `conclusion` | `text` | 2–4 short lines (separated with `\n`) — the closing punch |
| `closer` | `text` or `null` | One-line sign-off (e.g. "Roll on next Thursday. 📟 Ratings update to follow.") |
| `scorers` | `text` | Auto-generated from `goals` table by AdminMatchEntry — don't hand-edit |
| `report_text` | `text` | **Legacy — leave NULL.** Will double-render if both this and the structured fields are set. |
| `team_awards`, `player_of_tournament` | `jsonb` | **Retired (10 Jul 2026)** — the sections duplicated `key_highlights` and the MOTM/DOTD ballot. Columns still exist for old rows but nothing renders them. Don't populate. |

**Always include `predictions`.** Pull the actual final table from `fixtures` for the match, compare to the pre-match `LIKELY FINAL TABLE` (computed by `AdminTeamBuilder.predictTable`), and write a 4-row table with a short note on accuracy. The algorithm's track record is a recurring narrative thread — every week's report leans on it.

**Cross-check rule.** Before writing, verify every named scorer against the `goals` table for the match. Flag any mismatch (player named in prose who didn't score; player who scored but isn't mentioned) — surface it to the admin rather than silently editing the prose.
