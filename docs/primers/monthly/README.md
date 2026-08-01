# Monthly stats round-ups

Auto-generated one-page stats summaries for each calendar month. New file lands here on the **1st of every month at 07:00 BST** via [`.github/workflows/monthly-roundup.yml`](../../../.github/workflows/monthly-roundup.yml).

Each file uses data **from that month only** — matches, goals, MOTM/DOTD, fitness, fines. The whole squad and full-season stats stay in the app's Stats tab; these are month-in-review snapshots for sharing.

## Manual run

Actions tab → **Monthly stats round-up** → **Run workflow**. Optional `month` input (e.g. `2026-06`) for backfilling or re-rendering a previous month.

## Local dev

```sh
export SUPABASE_URL=https://qvvlxjftrteyrsscqidc.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ…
node scripts/monthly-report.mjs 2026-06
```

Requires `weasyprint` on `PATH`.

Iterating on the template? Save a JSON fixture of raw data and use offline mode:

```sh
node scripts/monthly-report.mjs 2026-06 --fixture=path/to/raw.json
```
