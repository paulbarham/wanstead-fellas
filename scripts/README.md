# Scripts

Command-line utilities for the Wanstead Fellas project.

---

## `cup-audit.mjs` — autonomous WC26 result + red card audit

Runs 3x/day from GitHub Actions ([`.github/workflows/cup-audit.yml`](../.github/workflows/cup-audit.yml)) — verifies every recently-played cup match against live web sources, applies high-confidence deltas straight to `cup_matches`, and posts anything ambiguous to a GitHub issue for admin review.

### What it does on each run

1. Pulls every match played in the last **72 hours** from `cup_matches` (score1 + score2 not null, `outcome_locked_by_admin` respected)
2. Asks Claude (via Anthropic API with the `web_search` tool) to cross-check each against ESPN / BBC / FIFA / Al Jazeera / Fox / Sky / Guardian / Sofascore
3. **Applies high-confidence deltas** — score, method (90/ET/pens), red-card counts — where two or more sources agree with a value different from the DB
4. **Posts a GitHub issue** labelled `cup-audit` with two sections: `✅ Applied` (already patched) and `⚠️ Review before applying` (single source or conflicting)
5. If everything matches, exits quietly — no issue posted

Exits with `0` and no action outside the WC26 window (defined as `2026-07-19`).

### One-time setup — GitHub repo secrets

Two secrets need to live on the repo — one is Claude, the other is Supabase write access.

Go to **Repo settings → Secrets and variables → Actions → New repository secret** and add:

| Name | Value | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-…` | https://console.anthropic.com/settings/keys |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` (long JWT) | Supabase dashboard → Project settings → API → **service_role** secret. **Never commit this; it bypasses RLS.** |

That's it. The workflow uses `GITHUB_TOKEN` for the issue-post which GitHub provides automatically.

### Manual run

Actions tab → **WC26 cup audit** → **Run workflow** → `main` → Run.

Same code path as the cron; useful for testing after any change.

### Local dry-run

```sh
export ANTHROPIC_API_KEY=sk-ant-…
export SUPABASE_URL=https://qvvlxjftrteyrsscqidc.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ…
node scripts/cup-audit.mjs --dry-run
```

`--dry-run` still queries the DB and asks Claude, but prints the applied deltas to stdout instead of writing them. No GitHub issue is posted when run locally.

### When to disable

The script self-guards against the WC26 end date (`2026-07-19`). After that, every run will log `WC26 concluded — audit no-ops` and exit `0`. Safe to leave in place — costs are near-zero when the guard fires (one date compare, no Claude call).

To disable entirely: comment out the `schedule:` block in the workflow, or delete the workflow file.

### Costs

Each run makes **one Claude call** with `web_search` enabled (up to 40 searches). Typical run when there are 2-4 recently-played matches: ~$0.10-0.30. When no matches to audit: **$0** — the script exits before calling Claude.

Three runs a day for the ~2 weeks left of WC26 ≈ 40-ish audits ≈ $4-12 total, plus one issue-post per non-empty audit.
