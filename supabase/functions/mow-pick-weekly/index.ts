// Auto-picks the featured Match of the Week for the upcoming weekend.
//
// Scheduled: Monday 09:00 UK (via pg_cron — see migration 066 install).
// Also callable ad-hoc via HTTP for admin re-runs.
//
// Algorithm (revised 1 Aug 2026 per admin request):
//   1. Find fixtures kicking off between the coming Fri 00:00 and Mon 00:00
//      UK time (i.e. the weekend the group actually watches).
//   2. Pick one at random from PL + Championship.
//   3. Done.
//
// The previous algorithm ("WF affinity" — weight by favourite_club count,
// plus a recency penalty to stop West Ham fixtures winning every week) was
// discarded in favour of pure randomness. Reason: with 9 West Ham fans in
// the group, the affinity system either dominated or needed a fussy
// penalty to fight itself. Random is simpler, fairer, and delivers the
// surprise factor the game wants — nobody knows which fixture is coming.
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
    // PL + Championship only. Championship-only weeks (before PL kicks off
    // in mid-Aug) still work — the pool just has fewer candidates.
    const { data: fxRows, error: fxErr } = await supabase.from('mow_pool_fixtures')
      .select('id, competition, gameweek, home_club, away_club, kickoff_at')
      .in('competition', ['PL', 'ELC'])
      .gte('kickoff_at', fromIso)
      .lt('kickoff_at', toIso)
      .order('kickoff_at')
    if (fxErr) return new Response(JSON.stringify({ error: `pool fetch: ${fxErr.message}` }), { status: 500 })
    const pool = (fxRows as PoolFixture[]) ?? []
    if (pool.length === 0) {
      return new Response(JSON.stringify({
        status: 'no_fixtures_in_window', week_start: weekStart, window: { fromIso, toIso },
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Pure random selection.
    const pickIdx = Math.floor(Math.random() * pool.length)
    const pick = pool[pickIdx]
    const note = `random pick · ${pick.competition} · from ${pool.length} candidates (${pool.filter(f => f.competition === 'PL').length} PL + ${pool.filter(f => f.competition === 'ELC').length} ELC)`

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
      pool_size: pool.length,
      breakdown: {
        PL: pool.filter(f => f.competition === 'PL').length,
        ELC: pool.filter(f => f.competition === 'ELC').length,
      },
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: `unhandled: ${errMsg(e)}` }), { status: 500 })
  }
})
