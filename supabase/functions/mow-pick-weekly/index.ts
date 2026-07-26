// Auto-picks the featured Match of the Week for the upcoming weekend.
//
// Scheduled: Monday 09:00 UK (via pg_cron — see migration 063 install).
// Also callable ad-hoc via HTTP for admin re-runs.
//
// Algorithm:
//   1. Find fixtures kicking off between the coming Fri 00:00 and Mon 00:00
//      UK time (i.e. the weekend the group actually watches).
//   2. Score each fixture by "WF affinity" = distinct-fella-count with
//      favourite_club matching either home or away team.
//   3. Rank: highest affinity wins. Ties broken by:
//        a) prime-time kickoff (Sat 12:30, 15:00, 17:30 preferred),
//        b) PL over Championship over EL1/EL2.
//   4. If zero fixtures have any affinity, fall back to the top-affinity
//      PL fixture (i.e. everyone's second team etc), still respecting
//      the kickoff-slot tiebreak. Never picks a totally-unwatched fixture
//      of an obscure club at 3pm Saturday.
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

const COMP_RANK: Record<string, number> = { PL: 4, ELC: 3, EL1: 2, EL2: 1 }

// UK prime-time kickoff slot score (higher = more group appeal).
// Times compared as HH:MM UTC-adjusted for BST — imprecise but good enough
// for tiebreak. Sat 12:30 / 15:00 / 17:30 and Sun 14:00 / 16:30 rank highest.
function slotScore(iso: string): number {
  const d = new Date(iso)
  const day = d.getUTCDay() // 0=Sun, 6=Sat — UTC good enough for a tiebreak
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes()
  if (day === 6) { // Saturday
    if (mins >= 11 * 60 && mins <= 12 * 60 + 45)  return 5    // ~12:30 UK
    if (mins >= 13 * 60 && mins <= 14 * 60 + 15)  return 6    // ~15:00 UK
    if (mins >= 16 * 60 && mins <= 16 * 60 + 45)  return 5    // ~17:30 UK
    if (mins >= 19 * 60 && mins <= 20 * 60)       return 4    // ~20:00 UK
    return 3
  }
  if (day === 0) { // Sunday
    if (mins >= 12 * 60 && mins <= 13 * 60 + 15)  return 5    // ~14:00 UK
    if (mins >= 15 * 60 && mins <= 15 * 60 + 45)  return 5    // ~16:30 UK
    return 3
  }
  if (day === 1 || day === 5) return 4 // Mon or Fri night stand-alone
  return 2
}

// Monday of the ISO week containing `d`, as YYYY-MM-DD (UTC).
function mondayOf(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = utc.getUTCDay() || 7  // 1..7, Mon=1
  utc.setUTCDate(utc.getUTCDate() - (dow - 1))
  return utc.toISOString().slice(0, 10)
}

// UTC bounds of the coming Fri 00:00 → Mon 00:00 UK from a given Monday.
// For simplicity we ignore BST vs GMT and treat UK ≈ UTC — a 1h edge case
// only affects fixtures right at midnight, and BST-heavy season means the
// window is slightly conservative (Fri 00:00 UK = Thu 23:00 UTC in BST).
function weekendWindow(monday: string): { fromIso: string; toIso: string } {
  const base = new Date(monday + 'T00:00:00Z')
  const fri = new Date(base); fri.setUTCDate(base.getUTCDate() + 4)   // Fri 00:00 UTC
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
    const { data: fxRows, error: fxErr } = await supabase.from('mow_pool_fixtures')
      .select('id, competition, gameweek, home_club, away_club, kickoff_at')
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

    // Fella-affinity counts per club slug in one pass.
    const { data: profRows } = await supabase.from('profiles')
      .select('favourite_club')
      .not('favourite_club', 'is', null)
    const affinity = new Map<string, number>()
    for (const r of (profRows as { favourite_club: string | null }[]) ?? []) {
      if (!r.favourite_club) continue
      affinity.set(r.favourite_club, (affinity.get(r.favourite_club) ?? 0) + 1)
    }

    // Score each fixture.
    const ranked = pool.map(fx => {
      const aff = (affinity.get(fx.home_club) ?? 0) + (affinity.get(fx.away_club) ?? 0)
      return {
        fx,
        affinity: aff,
        slot: slotScore(fx.kickoff_at),
        comp: COMP_RANK[fx.competition] ?? 0,
      }
    }).sort((a, b) => (b.affinity - a.affinity) || (b.slot - a.slot) || (b.comp - a.comp))

    const pick = ranked[0]

    // Pick note surfaces the picker's reasoning for admin / debug.
    const note = `affinity=${pick.affinity} · slot=${pick.slot} · comp=${pick.fx.competition} · from ${pool.length} candidates`

    // Upsert (overwrite when forced=1).
    const upsertRow = {
      week_start: weekStart,
      pool_fixture_id: pick.fx.id,
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
      fixture: pick.fx,
      shortlist: ranked.slice(0, 5).map(r => ({
        home: r.fx.home_club, away: r.fx.away_club, kickoff: r.fx.kickoff_at,
        comp: r.fx.competition, affinity: r.affinity, slot: r.slot,
      })),
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: `unhandled: ${errMsg(e)}` }), { status: 500 })
  }
})
