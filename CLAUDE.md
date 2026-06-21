# Wanstead Fellas — Working notes for Claude

Conventions for any Claude session working on this repo.

## Always keep the roadmap fresh

[`docs/ROADMAP.md`](docs/ROADMAP.md) is the single source of truth for what's coming next. **Update it as part of the work, not as an afterthought.**

- When a new idea surfaces — in a proposal, a chat exchange, a review comment, a "what about…" — add a row to the right theme with status 🟢 and a one-line note, in the same change-set.
- When something ships, flip the row to ✅, add the short commit hash (and migration number if relevant), and leave the row in place. Don't delete.
- If a built-in idea reveals a follow-up, log the follow-up before closing out the current work.
- If a sequencing decision is made (e.g. "X has to ship before Y"), capture it as a ⚠️ row pointing at the dependency.

The audit trail of what we said we'd do, vs what actually landed, is the whole point.

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
