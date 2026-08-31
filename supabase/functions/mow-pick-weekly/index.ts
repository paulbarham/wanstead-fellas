// Auto-picks the featured Match of the Week for the upcoming weekend.
//
// Scheduled: Friday 09:00 UK (via pg_cron — see migration 072 install).
// Also callable ad-hoc via HTTP for admin re-runs.
//
// Algorithm (revised 28 Aug 2026 per admin request — replaces the 1 Aug
// pure-random version which after three weeks was producing repeat clubs):
//   1. Find fixtures kicking off between the coming Fri 00:00 and Mon 00:00
//      UK time (i.e. the weekend the group actually watches).
//   2. Scope: keep all PL fixtures always, plus any other-league fixture
//      that features a club at least one player has favourited (via
//      profiles.favourite_club). Group affiliations sit in PL + ELC today
//      but the query is forward-compatible for L1/L2/Scottish/etc when a
//      new fan sets one.
//   3. Recency exclusion: drop any fixture whose home or away club appeared
//      in the last 3 MoW picks. Guarantees no club repeats within a month.
//      If the exclusion depletes the pool (rare edge case), fall back to
//      the scoped pool without recency.
//   4. Random pick from the remaining pool.
//
// Iteration trail — WHY this shape:
//   * v1 (Jul 2026): affinity-weighted with a recency penalty. Dominated
//     by 11 West Ham fans + the penalty was fussy.
//   * v2 (1 Aug 2026): pure random from PL + all Championship. Simpler,
//     but three consecutive picks still landed on WH/Spurs (two from v1
//     legacy, one v2 unlucky). Admin noticed the pattern 28 Aug.
//   * v3 (this): scope + recency. Keeps the surprise factor and structurally
//     prevents "same clubs every week" without hiding fixtures the group
//     actually cares about.
//
// Query params (all optional):
//   ?week_start=YYYY-MM-DD   override the Monday-of-week (default: this Monday)
//   ?force=1                 overwrite an already-picked week

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface PoolFixture {
  id: string
  competition: string
  gameweek: number | null
  home_club: string
  away_club: string
  kickoff_at: string
}

function mondayOf(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() - (dow - 1))
  return utc.toISOString().slice(0, 10)
}

function weekendWindow(monday: string): { fromIso: string; toIso: string } {
  const base = new Date(monday + 'T00:00:00Z')
  const fri = new Date(base); fri.setUTCDate(base.getUTCDate() + 4)
  const nextMon = new Date(base); nextMon.setUTCDate(base.getUTCDate() + 7)
  return { fromIso: fri.toISOString(), toIso: nextMon.toISOString() }
}

const errMsg = (e: unknown): string => e instanceof Error ? e.message : String(e)

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const forced = url.searchParams.get('force') === '1'
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  try {
    const explicitWeek = url.searchParams.get('week_start')
    const weekStart = explicitWeek ?? mondayOf(new Date())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return new Response(JSON.stringify({ error: 'week_start must be YYYY-MM-DD' }), { status: 400 })
    }

    // Already picked?
    const { data: existing } = await supabase.from('mow_fixtures')
      .select('id, pool_fixture_id, pick_note')
      .eq('week_start', weekStart)
      .maybeSingle()
    if (existing && !forced) {
      return new Response(JSON.stringify({ status: 'already_picked', week_start: weekStart, existing }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { fromIso, toIso } = weekendWindow(weekStart)
    // Fetch every fixture in the weekend window regardless of league — the
    // scoping filter (step 2) is applied in the app so a Sheff Wed / L1 / L2
    // fan can be included as soon as a lower-league fixture set is seeded.
    // Today only PL + ELC are seeded, and today all group favourites are in
    // those leagues, but the code doesn't hardcode that assumption.
    const { data: fxRows, error: fxErr } = await supabase.from('mow_pool_fixtures')
      .select('id, competition, gameweek, home_club, away_club, kickoff_at')
      .gte('kickoff_at', fromIso)
      .lt('kickoff_at', toIso)
      .order('kickoff_at')
    if (fxErr) return new Response(JSON.stringify({ error: `pool fetch: ${fxErr.message}` }), { status: 500 })
    const rawPool = (fxRows as PoolFixture[]) ?? []
    if (rawPool.length === 0) {
      return new Response(JSON.stringify({
        status: 'no_fixtures_in_window', week_start: weekStart, window: { fromIso, toIso },
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    // ── Step 2: scope filter — all PL, plus lower-league fixtures with an affinity club
    const { data: favRows, error: favErr } = await supabase.from('profiles')
      .select('favourite_club').not('favourite_club', 'is', null)
    if (favErr) return new Response(JSON.stringify({ error: `fav fetch: ${favErr.message}` }), { status: 500 })
    const affinity = new Set(((favRows ?? []) as { favourite_club: string | null }[])
      .map(r => r.favourite_club).filter((c): c is string => !!c))

    const scopedPool = rawPool.filter(f =>
      f.competition === 'PL' || affinity.has(f.home_club) || affinity.has(f.away_club),
    )
    if (scopedPool.length === 0) {
      return new Response(JSON.stringify({
        status: 'no_fixtures_in_scope', week_start: weekStart, raw_pool_size: rawPool.length,
        reason: 'no PL fixtures + no affinity-club fixtures found in the weekend window',
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    // ── Step 3: recency exclusion — drop clubs from the last 3 picks
    const { data: recentRows } = await supabase.from('mow_fixtures')
      .select('mow_pool_fixtures!inner(home_club, away_club)')
      .lt('week_start', weekStart)
      .order('week_start', { ascending: false })
      .limit(3)
    const recentClubs = new Set<string>()
    for (const r of ((recentRows ?? []) as { mow_pool_fixtures: { home_club: string; away_club: string } | null }[])) {
      const pf = r.mow_pool_fixtures
      if (pf?.home_club) recentClubs.add(pf.home_club)
      if (pf?.away_club) recentClubs.add(pf.away_club)
    }
    let finalPool = scopedPool.filter(f =>
      !recentClubs.has(f.home_club) && !recentClubs.has(f.away_club),
    )
    let recencyApplied = true
    if (finalPool.length === 0) {
      // Recency depleted the pool (unusual — e.g. tiny window). Fall back
      // to the scoped pool so we always ship a pick.
      finalPool = scopedPool
      recencyApplied = false
    }

    // ── Step 4: random pick
    const pickIdx = Math.floor(Math.random() * finalPool.length)
    const pick = finalPool[pickIdx]
    const affinityHit = affinity.has(pick.home_club) || affinity.has(pick.away_club)
    const note = `random pick · ${pick.competition} · from ${finalPool.length} candidates (raw ${rawPool.length} → scoped ${scopedPool.length} → after recency ${finalPool.length}${recencyApplied ? '' : ', recency skipped: would deplete pool'})${affinityHit ? ' · affinity match' : ''}`

    const upsertRow = {
      week_start: weekStart,
      pool_fixture_id: pick.id,
      pick_note: note,
      published_at: new Date().toISOString(),
    }
    const { error: upErr, data: upData } = await supabase.from('mow_fixtures')
      .upsert(upsertRow, { onConflict: 'week_start' })
      .select('id, week_start, pool_fixture_id, pick_note')
      .maybeSingle()
    if (upErr) return new Response(JSON.stringify({ error: `upsert: ${upErr.message}` }), { status: 500 })

    return new Response(JSON.stringify({
      status: forced && existing ? 'overwritten' : 'picked',
      week_start: weekStart,
      pick: upData,
      fixture: pick,
      raw_pool_size: rawPool.length,
      scoped_pool_size: scopedPool.length,
      final_pool_size: finalPool.length,
      recency_applied: recencyApplied,
      recent_clubs_excluded: Array.from(recentClubs),
      affinity_clubs: Array.from(affinity),
      affinity_match_on_pick: affinityHit,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: `unhandled: ${errMsg(e)}` }), { status: 500 })
  }
})
