// Seed / refresh mow_pool_fixtures from football-data.org.
//
// Called manually by admin (via mcp / dashboard) at season start and again
// mid-season if the feed publishes fixture reschedules. Idempotent — upserts
// on (competition, home_club, away_club, kickoff_at). Non-WF-followed clubs
// are silently skipped (no fella in the group supports them, so the picker
// couldn't weight them anyway).
//
// Free-tier football-data.org covers PL + Championship. L1/L2 are paywalled
// so we skip them for v1 — the roadmap tracks this as the "lower-league
// coverage" gap; when a source lands we drop it in the same shape.
//
// Query params:
//   ?season=2026     default = current calendar year (2026-27 season = 2026)
//   ?comp=PL         optional filter (PL / ELC); default = both

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const FD_TEAM_ALIASES: Record<string, string> = {
  'Arsenal FC': 'arsenal',
  'Aston Villa FC': 'aston_villa',
  'AFC Bournemouth': 'bournemouth',
  'Brentford FC': 'brentford',
  'Brighton & Hove Albion FC': 'brighton',
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
  'Bolton Wanderers FC': 'bolton',
  'Lincoln City FC': 'lincoln',
  'Cardiff City FC': 'cardiff',
}
function fdNormalize(name: string | null): string | null {
  if (!name) return null
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
  matchday?: number | null
  status: string
  homeTeam: { name: string | null }
  awayTeam: { name: string | null }
  score: { fullTime: { home: number | null; away: number | null } }
}

const errMsg = (e: unknown): string => e instanceof Error ? e.message : String(e)

Deno.serve(async (req) => {
  const url = new URL(req.url)
  // "season" query param for FD is the START year (2026 = 2026-27 season).
  const season = url.searchParams.get('season') ?? String(new Date().getUTCFullYear())
  const seasonLabel = `${season}-${String(Number(season) + 1).slice(2)}`
  const compFilter = url.searchParams.get('comp')
  const comps = compFilter ? [compFilter.toUpperCase()] : ['PL', 'ELC']
  const key = Deno.env.get('FOOTBALL_DATA_API_KEY')
  if (!key) return new Response(JSON.stringify({ error: 'FOOTBALL_DATA_API_KEY not set' }), { status: 500 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const summary: Record<string, unknown> = { season: seasonLabel, comps: {} }
  const compsOut = summary.comps as Record<string, unknown>

  for (const comp of comps) {
    const fdUrl = `https://api.football-data.org/v4/competitions/${comp}/matches?season=${season}`
    let res: Response
    try {
      res = await fetch(fdUrl, { headers: { 'X-Auth-Token': key } })
    } catch (e) {
      compsOut[comp] = { error: `fetch failed: ${errMsg(e)}` }; continue
    }
    if (!res.ok) {
      compsOut[comp] = { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 400)}` }
      continue
    }
    const body = await res.json() as { matches?: FdMatch[] }
    const matches = body.matches ?? []

    const rows: Array<{
      season: string; competition: string; gameweek: number | null
      home_club: string; away_club: string; kickoff_at: string
      home_score: number | null; away_score: number | null
      fd_match_id: number
    }> = []
    let skippedUnknown = 0
    const unknownNames = new Set<string>()

    for (const m of matches) {
      const home = fdNormalize(m.homeTeam.name)
      const away = fdNormalize(m.awayTeam.name)
      if (!home || !away) {
        skippedUnknown++
        if (m.homeTeam.name) unknownNames.add(m.homeTeam.name)
        if (m.awayTeam.name) unknownNames.add(m.awayTeam.name)
        continue
      }
      rows.push({
        season: seasonLabel,
        competition: comp,
        gameweek: m.matchday ?? null,
        home_club: home,
        away_club: away,
        kickoff_at: m.utcDate,
        home_score: m.status === 'FINISHED' ? m.score.fullTime.home : null,
        away_score: m.status === 'FINISHED' ? m.score.fullTime.away : null,
        fd_match_id: m.id,
      })
    }

    let upserted = 0, failed = 0
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200)
      const { error, data } = await supabase
        .from('mow_pool_fixtures')
        .upsert(chunk, { onConflict: 'competition,home_club,away_club,kickoff_at' })
        .select('id')
      if (error) failed += chunk.length
      else upserted += data?.length ?? chunk.length
    }
    compsOut[comp] = {
      matches_in_feed: matches.length,
      matched_rows: rows.length,
      upserted, failed,
      skipped_unknown_club: skippedUnknown,
      unknown_names: Array.from(unknownNames).slice(0, 30),
    }
  }

  return new Response(JSON.stringify(summary, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
