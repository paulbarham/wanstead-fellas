// Seed Season Card player + manager options from football-data.org.
//
// Called manually by admin (via mcp / dashboard) at season card build time
// and again if squads shift substantially post-transfer window. Idempotent
// upsert on (season_card_id, option_type, option_key).
//
// Endpoint used: `/competitions/PL/teams?season=YYYY` — returns 20 clubs
// each with a `squad` array (player id, name, position, dob) and `coach`
// object (id, name, dob). Free-tier eligible.
//
// Player option_key = FD's numeric player id as text — stable enough that
// admin can UPDATE resolved_answers with the id and it'll match.
// Manager option_key = FD's numeric coach id as text.
//
// Query params:
//   ?season_card=2026-27   default = latest season_cards row

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
  'Coventry City FC': 'coventry',
  'Hull City AFC': 'hull',
  'Ipswich Town FC': 'ipswich',
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

interface FdPlayer {
  id: number
  name: string | null
  position: string | null
  dateOfBirth: string | null
  shirtNumber: number | null
}
interface FdCoach {
  id: number | null
  name: string | null
  dateOfBirth: string | null
}
interface FdTeam {
  id: number
  name: string
  crest?: string
  squad?: FdPlayer[]
  coach?: FdCoach | null
}

const errMsg = (e: unknown): string => e instanceof Error ? e.message : String(e)

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const seasonWanted = url.searchParams.get('season_card')
  const key = Deno.env.get('FOOTBALL_DATA_API_KEY')
  if (!key) return new Response(JSON.stringify({ error: 'FOOTBALL_DATA_API_KEY not set' }), { status: 500 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: cardRow, error: cardErr } = await supabase.from('season_cards')
    .select('id, season')
    .eq(seasonWanted ? 'season' : 'season', seasonWanted ?? '')
    .maybeSingle()
  // If no exact match, grab the latest.
  let cardId: string | null = (cardRow as { id: string; season: string } | null)?.id ?? null
  let cardSeason: string | null = (cardRow as { id: string; season: string } | null)?.season ?? null
  if (!cardId) {
    const { data: latest } = await supabase.from('season_cards')
      .select('id, season')
      .order('season', { ascending: false })
      .limit(1).maybeSingle()
    cardId = (latest as { id: string; season: string } | null)?.id ?? null
    cardSeason = (latest as { id: string; season: string } | null)?.season ?? null
  }
  if (!cardId) return new Response(JSON.stringify({ error: 'no season_cards row found' }), { status: 404 })
  if (cardErr) { /* fall through — we already have a card via latest */ }

  const seasonForFd = cardSeason?.split('-')[0] // '2026-27' → '2026'

  const fdUrl = `https://api.football-data.org/v4/competitions/PL/teams?season=${seasonForFd}`
  let res: Response
  try {
    res = await fetch(fdUrl, { headers: { 'X-Auth-Token': key } })
  } catch (e) {
    return new Response(JSON.stringify({ error: `FD fetch failed: ${errMsg(e)}` }), { status: 502 })
  }
  if (!res.ok) {
    return new Response(JSON.stringify({
      error: `HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`,
    }), { status: 502 })
  }
  const body = await res.json() as { teams?: FdTeam[] }
  const teams = body.teams ?? []

  // Look up existing club default_rank so managers inherit their club's rank
  // (favourites-first ordering for the first-sacked market).
  const { data: clubRows } = await supabase.from('season_card_options')
    .select('option_key, default_rank')
    .eq('season_card_id', cardId)
    .eq('option_type', 'pl_club')
  const clubRank = new Map<string, number>()
  for (const c of (clubRows as { option_key: string; default_rank: number }[]) ?? []) {
    clubRank.set(c.option_key, c.default_rank)
  }

  const playerRows: Array<{
    season_card_id: string; option_type: string; option_key: string
    display_name: string; extra: Record<string, unknown>; default_rank: number
  }> = []
  const managerRows: typeof playerRows = []
  let skippedUnknownTeam = 0
  const unknownTeams = new Set<string>()

  for (const t of teams) {
    const clubSlug = fdNormalize(t.name)
    if (!clubSlug) {
      skippedUnknownTeam++
      unknownTeams.add(t.name)
      continue
    }
    const rank = clubRank.get(clubSlug) ?? 999

    for (const p of t.squad ?? []) {
      if (!p.name) continue
      playerRows.push({
        season_card_id: cardId,
        option_type: 'pl_player',
        option_key: String(p.id),
        display_name: p.name,
        extra: {
          club_slug: clubSlug,
          position: p.position,
          shirt: p.shirtNumber,
          dob: p.dateOfBirth,
        },
        // Players default-ranked alphabetically — search bar carries the
        // load; ranking would be arbitrary without last-season goal stats.
        default_rank: 999,
      })
    }

    if (t.coach?.name) {
      // FD free tier sometimes returns coach.id as null — fall back to a
      // slugified name so every manager still lands (option_key must be
      // unique per club anyway; club_slug prefix keeps it collision-safe
      // across managers with the same surname at different clubs).
      const managerKey = t.coach.id != null
        ? String(t.coach.id)
        : `${clubSlug}:${t.coach.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
      managerRows.push({
        season_card_id: cardId,
        option_type: 'pl_manager',
        option_key: managerKey,
        display_name: `${t.coach.name} (${clubSlug.replace(/_/g,' ')})`,
        extra: {
          club_slug: clubSlug,
          dob: t.coach.dateOfBirth,
        },
        // Manager rank inherits club rank — a top-6 job going first is
        // the bookies' shortest odds; relegation-scrap clubs down the list.
        default_rank: rank,
      })
    }
  }

  // Dedupe players by option_key before upserting. FD's squad endpoint can
  // return the same player id from two clubs (loan spells, dual registrations
  // during transfer window). Postgres INSERT ... ON CONFLICT refuses when
  // the incoming batch itself contains duplicates.
  const seen = new Set<string>()
  const dedupedPlayers: typeof playerRows = []
  for (const row of playerRows) {
    if (seen.has(row.option_key)) continue
    seen.add(row.option_key)
    dedupedPlayers.push(row)
  }
  playerRows.length = 0
  playerRows.push(...dedupedPlayers)

  let playersUpserted = 0, playersFailed = 0
  for (let i = 0; i < playerRows.length; i += 300) {
    const chunk = playerRows.slice(i, i + 300)
    const { error, data } = await supabase.from('season_card_options')
      .upsert(chunk, { onConflict: 'season_card_id,option_type,option_key' })
      .select('id')
    if (error) playersFailed += chunk.length
    else playersUpserted += data?.length ?? chunk.length
  }

  let managersUpserted = 0, managersFailed = 0
  if (managerRows.length > 0) {
    const { error, data } = await supabase.from('season_card_options')
      .upsert(managerRows, { onConflict: 'season_card_id,option_type,option_key' })
      .select('id')
    if (error) managersFailed = managerRows.length
    else managersUpserted = data?.length ?? managerRows.length
  }

  return new Response(JSON.stringify({
    season_card_id: cardId,
    season: cardSeason,
    teams_in_feed: teams.length,
    players_upserted: playersUpserted,
    players_failed: playersFailed,
    // Manager fields kept for API stability but FD free tier returns coach
    // all-null (verified 26 Jul 2026) so this is always 0. Managers are
    // hard-seeded via migration 065 instead.
    managers_upserted: managersUpserted,
    managers_failed: managersFailed,
    skipped_unknown_teams: skippedUnknownTeam,
    unknown_teams: Array.from(unknownTeams),
  }, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
