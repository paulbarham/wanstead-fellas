// Poll football-data.org for last-weekend results and update mow_pool_fixtures.
//
// Scheduled: Monday 07:00 UK, and again 15:00 UK as a safety net if the feed
// was slow. The pool_fixtures settle trigger cascades points to any
// mow_predictions attached via mow_fixtures — so as soon as the score lands
// on the pool row, everyone's points are computed and visible in the app.
//
// Free-tier football-data.org covers PL (competition code 'PL') and
// Championship ('ELC'). L1/L2 are premium — the fetcher just skips them and
// admin can enter those results manually.
//
// Query params:
//   ?comp=PL     limit to one comp
//   ?days=7      look back this many days (default 7)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// football-data.org team names → our club slugs.
// Kept small — only teams whose FD name differs from openfootball's or has
// awkward chars. Any FD team not resolved gets skipped (logged).
const FD_TEAM_ALIASES: Record<string, string> = {
  'Arsenal FC': 'arsenal',
  'Aston Villa FC': 'aston_villa',
  'AFC Bournemouth': 'bournemouth',
  'Brentford FC': 'brentford',
  'Brighton & Hove Albion FC': 'brighton',
  'Brighton Hove': 'brighton',
  'Burnley FC': 'burnley',
  'Chelsea FC': 'chelsea',
  'Crystal Palace FC': 'crystal_palace',
  'Everton FC': 'everton',
  'Fulham FC': 'fulham',
  'Leeds United FC': 'leeds',
  'Liverpool FC': 'liverpool',
  'Manchester City FC': 'man_city',
  'Manchester United FC': 'man_utd',
  'Newcastle United FC': 'newcastle',
  'Nottingham Forest FC': 'nottingham_forest',
  'Sunderland AFC': 'sunderland',
  'Tottenham Hotspur FC': 'tottenham',
  'West Ham United FC': 'west_ham',
  'Wolverhampton Wanderers FC': 'wolves',
  'Birmingham City FC': 'birmingham',
  'Blackburn Rovers FC': 'blackburn',
  'Bristol City FC': 'bristol_city',
  'Charlton Athletic FC': 'charlton',
  'Coventry City FC': 'coventry',
  'Derby County FC': 'derby',
  'Hull City AFC': 'hull',
  'Ipswich Town FC': 'ipswich',
  'Leicester City FC': 'leicester',
  'Middlesbrough FC': 'middlesbrough',
  'Millwall FC': 'millwall',
  'Norwich City FC': 'norwich',
  'Oxford United FC': 'oxford',
  'Portsmouth FC': 'portsmouth',
  'Preston North End FC': 'preston',
  'Queens Park Rangers FC': 'qpr',
  'Sheffield United FC': 'sheff_united',
  'Sheffield Wednesday FC': 'sheff_wed',
  'Southampton FC': 'southampton',
  'Stoke City FC': 'stoke',
  'Swansea City AFC': 'swansea',
  'Watford FC': 'watford',
  'West Bromwich Albion FC': 'wba',
  'Wrexham AFC': 'wrexham',
}
function fdNormalize(name: string): string | null {
  const direct = FD_TEAM_ALIASES[name]
  if (direct) return direct
  const stripped = name.replace(/\s+(FC|AFC|CF|SC)$/i, '').trim()
  for (const [k, v] of Object.entries(FD_TEAM_ALIASES)) {
    const kStripped = k.replace(/\s+(FC|AFC|CF|SC)$/i, '').trim()
    if (kStripped.toLowerCase() === stripped.toLowerCase()) return v
  }
  return null
}

interface FdMatch {
  id: number
  utcDate: string
  status: string
  competition?: { code?: string }
  homeTeam: { name: string | null }
  awayTeam: { name: string | null }
  score: { fullTime: { home: number | null; away: number | null } }
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const errMsg = (e: unknown): string => e instanceof Error ? e.message : String(e)

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const compFilter = url.searchParams.get('comp')
  const daysBack = Math.max(1, Math.min(30, parseInt(url.searchParams.get('days') ?? '7', 10) || 7))
  const key = Deno.env.get('FOOTBALL_DATA_API_KEY')
  if (!key) return new Response(JSON.stringify({ error: 'FOOTBALL_DATA_API_KEY not set' }), { status: 500 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const comps = compFilter ? [compFilter.toUpperCase()] : ['PL', 'ELC']
  const dateTo = new Date().toISOString().slice(0, 10)
  const dateFrom = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const summary: Record<string, unknown> = { dateFrom, dateTo, comps: {} }
  const compsOut = summary.comps as Record<string, unknown>

  try {
    for (const comp of comps) {
      const fdUrl = `https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`
      let res: Response
      try {
        res = await fetch(fdUrl, { headers: { 'X-Auth-Token': key } })
      } catch (e) {
        compsOut[comp] = { error: `fetch failed: ${errMsg(e)}` }; continue
      }
      if (!res.ok) { compsOut[comp] = { error: `HTTP ${res.status}: ${await res.text()}` }; continue }
      const body = await res.json() as { matches?: FdMatch[] }
      const matches = body.matches ?? []

      let updated = 0, skippedUnknown = 0, skippedNoMatch = 0, skippedInProgress = 0, unchanged = 0
      const notes: unknown[] = []

      for (const m of matches) {
        if (m.status !== 'FINISHED') { skippedInProgress++; continue }
        if (m.score.fullTime.home == null || m.score.fullTime.away == null) { skippedInProgress++; continue }
        const home = m.homeTeam.name ? fdNormalize(m.homeTeam.name) : null
        const away = m.awayTeam.name ? fdNormalize(m.awayTeam.name) : null
        if (!home || !away) { skippedUnknown++; notes.push({ fd_home: m.homeTeam.name, fd_away: m.awayTeam.name }); continue }
        const apiTimeMs = new Date(m.utcDate).getTime()

        // Look up the corresponding pool fixture — team order OR reversed +
        // kickoff within ±2h to absorb FD reschedules.
        const { data: candidates } = await supabase.from('mow_pool_fixtures')
          .select('id, kickoff_at, home_club, away_club, home_score, away_score, fd_match_id')
          .eq('competition', comp)
          .or(`and(home_club.eq.${home},away_club.eq.${away}),and(home_club.eq.${away},away_club.eq.${home})`)
        const found = ((candidates as Array<{
          id: string; kickoff_at: string; home_club: string; away_club: string
          home_score: number | null; away_score: number | null; fd_match_id: number | null
        }>) ?? []).find(c =>
          Math.abs(new Date(c.kickoff_at).getTime() - apiTimeMs) <= TWO_HOURS_MS
        )
        if (!found) { skippedNoMatch++; continue }

        const swap = found.home_club === away
        const newHome = swap ? m.score.fullTime.away : m.score.fullTime.home
        const newAway = swap ? m.score.fullTime.home : m.score.fullTime.away

        if (found.home_score === newHome && found.away_score === newAway) { unchanged++; continue }

        const { error: updErr } = await supabase.from('mow_pool_fixtures')
          .update({
            home_score: newHome,
            away_score: newAway,
            fd_match_id: m.id,
            results_fetched_at: new Date().toISOString(),
          })
          .eq('id', found.id)
        if (!updErr) updated++
      }

      compsOut[comp] = { matches_in_feed: matches.length, updated, unchanged, skipped_unknown: skippedUnknown, skipped_no_match: skippedNoMatch, skipped_in_progress: skippedInProgress, unknown_names: notes.slice(0, 20) }
    }
    return new Response(JSON.stringify(summary, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: `unhandled: ${errMsg(e)}` }), { status: 500 })
  }
})
