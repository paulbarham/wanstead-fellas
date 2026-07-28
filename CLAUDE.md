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

## UI conventions & known gotchas

### Never combine `overflow: hidden` with `rounded-*` on cards that hold bold text

DM Sans (`--font-body`) at `font-semibold`/`font-bold` has slightly negative left sidebearings on several capitals (P, T, R, G confirmed). The visible stroke pokes a fraction of a pixel to the LEFT of the character's advance box. If the parent card has `overflow: hidden` — commonly added so a child header's background respects the rounded corners — those extra stroke pixels get chopped clean off at the padding edge.

Symptom the user reports: "the first letter is cut off", "P looks like ?remier", "text is blocked off by the capsule". Happened at least three times on the Season Card (26 Jul 2026, commits `038f0f6` / `1edcd8b` / `c64b0b0`) before landing the correct fix.

**The pattern that works:**

```jsx
// outer: rounded + border + backgroundClip. NO overflow:hidden.
<div className="rounded-xl"
  style={{
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    backgroundClip: 'padding-box',
  }}>
  {/* header: explicit top corner radii so its background hugs the parent's rounding */}
  <div className="px-4 py-2"
    style={{
      borderTopLeftRadius: 11,   // parent radius - 1px border
      borderTopRightRadius: 11,
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-surface-2, var(--color-bg))',
    }}>
    ...
  </div>
  {/* body: explicit bottom corner radii for the same reason */}
  <div className="px-4 py-2"
    style={{ borderBottomLeftRadius: 11, borderBottomRightRadius: 11 }}>
    ...
  </div>
</div>
```

Rule: `overflow: hidden` on a rounded card that contains text is only safe if the text is regular-weight, small (≤12px), and well inside the padding. For headers with bold titles, use the pattern above.

### Related: text-clipping-safe flex header layouts

`flex justify-between` with a title on the left and a stat/pts on the right silently clips one side when the sum overflows — especially under iOS Larger Text (Dynamic Type) which multiplies our `text-[Npx]` bases. If both children must fit on one row, add `min-w-0 truncate` to the flexible side AND `flex-shrink-0 whitespace-nowrap` to the fixed side. Better still, use `flex flex-wrap items-baseline gap-2` so the right-hand element wraps to a new line rather than clipping.

### "Optimise the UI" checklist

When the user asks to "optimise the UI" (or "polish", "clean up", "make it look nicer"), sweep the changed surface for:

1. `overflow: hidden` on rounded cards containing bold text → replace with the `backgroundClip: padding-box` pattern above.
2. `flex justify-between` headers → verify at Larger Text (test with `:root { font-size: 140%; }`) that neither side clips.
3. `truncate` on user-visible labels → prefer wrap for headings, only truncate on genuinely long body content.
4. Hardcoded pixel padding → check the padding is proportional to the border-radius (padding ≥ radius) so text sits inside the corner arcs.
5. `text-[Npx]` sizes below 12px → verify they're still legible at Compact text-size setting.

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

### Pitch hire has two rates depending on the date

Confirmed against bank statements + the Pitchbooker subscription screen on 12 Jul:

- **Pre-subscription (Apr 2026 → 27 Aug 2026)**: **£67.80 per Thursday**, invoiced monthly, paid by admin's personal account. Historic invoices: Apr £339 (5 Thu), May £271.20 (4), Jun £271.20 (4), Jul £339 (5), Aug £271.20 (4 — upcoming).
- **Pitchbooker subscription (from 3 Sept 2026 onwards)**: **£70.17 per week** for Eton Manor Half 1 + Half 2, 9:00pm-10:00pm every Thursday. Booked 3 Jun 2026, valid indefinite.
- **Only 24 Dec 2026 is excluded** from the subscription per Pitchbooker (New Year's Eve 31 Dec 2026 is NOT excluded — matches still played that week).

Season pre-seed (Aug 2026 → Mar 2027 upcoming rows in `club_expenses`, paid=false):

- Aug £271.20 · Sep £280.68 · Oct £350.85 · Nov £280.68 · Dec £280.68 · Jan £280.68 · Feb £280.68 · Mar £280.68 = **£2,306.13 remaining pitch cost**.

Implications:

- Migration 053 dropped the v1 per-match auto-generation trigger — the model was wrong (per-match rather than per-month, and off on the rate). Going forward, tick each monthly pitch invoice **paid** via the admin panel when the withdrawal hits the bank.
- Rate change to £70.17 might tick up further under future Pitchbooker renewals — check the subscription screen if the amount looks off vs the seeded expectation.

### club_income has a £331 season-transition catch-all row

One row in `club_income` for the 2026-27 season, dated 1 Apr, source `carry_over`, amount **£331**. It's the sum of every bank credit that couldn't be attributed to a specific app row during the 12 Jul reconciliation. Includes:

- Overpayments bundled with subs (Davies `sub & owed` £65 extra, Sherman `+ father settlement` £40 extra, Perrie's May invoice £25, etc.)
- Past-season settlements paid after 1 Apr — person-labelled May/Jun payments not matched to specific `wtp_games` rows
- **Josh Edwards £10 sub discount** for his 2 pre-app April WTPs (why the bank shows £85 sub not £95)
- Off-app spreadsheet fines cleared before the auto-fine flow shipped

If admin ever wants per-player granularity restored, walk each bank line back to a specific app row (mark `wtp_games` paid / add missing fines / add explicit `club_income` entries) and the catch-all will shrink accordingly. For 2026-27 leave it as-is — the pot is right, the audit trail is captured, and going forward every bank credit goes through the app first so the number should stay flat or drop.

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
