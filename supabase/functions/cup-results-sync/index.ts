// Polls football-data.org for FIFA World Cup matches and keeps cup_matches
// in sync. Two jobs:
//   1. INSERT any API fixtures we don't yet have (lets the predictor cover
//      all 64 WC games without anyone having to hand-seed them).
//   2. UPDATE rows where actual_outcome IS NULL with score + outcome once
//      the API marks them FINISHED. Admin-entered results are never
//      overwritten. The existing settle_cup_predictions trigger handles
//      scoring everyone's predictions.
//
// Env vars required:
//   FOOTBALL_DATA_API_KEY  free-tier key from football-data.org
//   SUPABASE_URL           (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// API-name → our cup_matches name. Only entries that actually differ.
// Anything not in this table is matched verbatim. Multiple API spellings
// for the same country are all mapped to our single name.
const TEAM_ALIASES: Record<string, string> = {
  'Korea Republic': 'South Korea',
  'Bosnia and Herzegovina': 'Bosnia & Herz.',
  'Bosnia-Herzegovina': 'Bosnia & Herz.',
  'United States': 'United States',
  'USA': 'United States',
  'Czech Republic': 'Czechia',
  'Türkiye': 'Turkey',
  'Turkiye': 'Turkey',
  'Netherlands': 'Netherlands',
  'Holland': 'Netherlands',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cote d\'Ivoire': 'Ivory Coast',
  'Cabo Verde': 'Cape Verde',
  'Cape Verde Islands': 'Cape Verde',
  'Congo DR': 'DR Congo',
  'DR Congo': 'DR Congo',
}

const normalize = (apiName: string): string => TEAM_ALIASES[apiName] ?? apiName

// API stage → our cup_matches.stage value. Group stage is special — uses the
// group letter from the API's `group` field.
function mapStage(api: { stage: string; group?: string | null }): { stage: string; group_letter: string | null; is_knockout: boolean } | null {
  const s = (api.stage || '').toUpperCase()
  if (s === 'GROUP_STAGE') {
    const g = (api.group || '').toUpperCase().replace('GROUP_', '')
    if (!g) return null
    const letter = g.charAt(0)
    if (letter < 'A' || letter > 'L') return null
    return { stage: `group_${letter.toLowerCase()}`, group_letter: letter, is_knockout: false }
  }
  if (s === 'LAST_32')        return { stage: 'r32', group_letter: null, is_knockout: true }
  if (s === 'LAST_16')        return { stage: 'r16', group_letter: null, is_knockout: true }
  if (s === 'QUARTER_FINALS') return { stage: 'qf',  group_letter: null, is_knockout: true }
  if (s === 'SEMI_FINALS')    return { stage: 'sf',  group_letter: null, is_knockout: true }
  if (s === 'THIRD_PLACE')    return { stage: 'third_place', group_letter: null, is_knockout: true }
  if (s === 'FINAL')          return { stage: 'final', group_letter: null, is_knockout: true }
  return null
}

interface ApiMatch {
  id: number
  utcDate: string
  status: string
  stage: string
  group?: string | null
  venue?: string | null
  homeTeam: { name: string | null }
  awayTeam: { name: string | null }
  score: {
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'
    fullTime: { home: number | null; away: number | null }
    extraTime?: { home: number | null; away: number | null }
    penalties?: { home: number | null; away: number | null }
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
  }
}

interface CupMatchRow {
  id: string
  team1: string
  team2: string
  kickoff: string
  is_knockout: boolean
  actual_outcome: string | null
  cards_synced_at: string | null
}

// Bookings shape from /v4/matches/{id} — only the fields we use.
interface ApiBooking {
  team: { name: string }
  card: 'YELLOW' | 'YELLOW_RED' | 'RED'
}
interface ApiMatchDetail {
  id: number
  homeTeam: { name: string }
  awayTeam: { name: string }
  bookings?: ApiBooking[]
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

function computeOutcome(
  api: ApiMatch,
  isKnockout: boolean,
  swap: boolean,
): { outcome: string; score1: number; score2: number } | null {
  const home = api.score.fullTime.home
  const away = api.score.fullTime.away
  if (home == null || away == null) return null
  const score1 = swap ? away : home
  const score2 = swap ? home : away
  if (!isKnockout) {
    let outcome: string
    if (api.score.winner === 'DRAW') outcome = 'draw'
    else if (api.score.winner === 'HOME_TEAM') outcome = swap ? 'team2' : 'team1'
    else if (api.score.winner === 'AWAY_TEAM') outcome = swap ? 'team1' : 'team2'
    else return null
    return { outcome, score1, score2 }
  }
  let mode: '90' | 'et' | 'pen'
  if (api.score.duration === 'PENALTY_SHOOTOUT') mode = 'pen'
  else if (api.score.duration === 'EXTRA_TIME') mode = 'et'
  else mode = '90'
  let winnerSide: 'team1' | 'team2'
  if (api.score.winner === 'HOME_TEAM') winnerSide = swap ? 'team2' : 'team1'
  else if (api.score.winner === 'AWAY_TEAM') winnerSide = swap ? 'team1' : 'team2'
  else return null
  return { outcome: `${winnerSide}_${mode}`, score1, score2 }
}

Deno.serve(async () => {
  const apiKey = Deno.env.get('FOOTBALL_DATA_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'FOOTBALL_DATA_API_KEY not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // Fetch ALL matches (no status filter) so we can also create scheduled
  // fixtures that haven't been seeded into cup_matches yet.
  const apiRes = await fetch(
    'https://api.football-data.org/v4/competitions/WC/matches',
    { headers: { 'X-Auth-Token': apiKey } },
  )
  if (!apiRes.ok) {
    return new Response(
      JSON.stringify({ error: `API ${apiRes.status}: ${await apiRes.text()}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const payload = await apiRes.json() as { matches: ApiMatch[] }
  const apiMatches = payload.matches ?? []

  const { data: allRows, error: fetchErr } = await supabase
    .from('cup_matches')
    .select('id, team1, team2, kickoff, is_knockout, actual_outcome, cards_synced_at')

  if (fetchErr) {
    return new Response(
      JSON.stringify({ error: `DB fetch: ${fetchErr.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const ourMatches = (allRows as CupMatchRow[]) ?? []

  const updates: { team1: string; team2: string; outcome: string; score: string }[] = []
  const inserts: { team1: string; team2: string; kickoff: string; stage: string }[] = []
  const errors: { team1: string; team2: string; error: string }[] = []
  const matchedApiIds = new Set<number>()
  const skipped_api: { home: string | null; away: string | null; reason: string }[] = []

  // Find our row for a given API match by normalized teams + kickoff window.
  function findOurMatch(a: ApiMatch): CupMatchRow | null {
    const apiHome = a.homeTeam.name ? normalize(a.homeTeam.name) : null
    const apiAway = a.awayTeam.name ? normalize(a.awayTeam.name) : null
    if (!apiHome || !apiAway) return null
    const apiTimeMs = new Date(a.utcDate).getTime()
    return ourMatches.find(m => {
      const teamsMatch =
        (apiHome === m.team1 && apiAway === m.team2) ||
        (apiHome === m.team2 && apiAway === m.team1)
      const timeMatch = Math.abs(new Date(m.kickoff).getTime() - apiTimeMs) <= TWO_HOURS_MS
      return teamsMatch && timeMatch
    }) ?? null
  }

  for (const a of apiMatches) {
    if (!a.homeTeam.name || !a.awayTeam.name) {
      // Knockout placeholder before draw is known — skip until teams resolve.
      skipped_api.push({ home: a.homeTeam.name, away: a.awayTeam.name, reason: 'no team name yet' })
      continue
    }

    const ours = findOurMatch(a)

    // INSERT path — fixture we don't yet have. Don't bother creating rows
    // for FINISHED games that have already happened (no one can predict
    // those any more); only create SCHEDULED / IN_PLAY fixtures.
    if (!ours) {
      if (a.status === 'FINISHED') {
        skipped_api.push({ home: a.homeTeam.name, away: a.awayTeam.name, reason: 'finished before we tracked it' })
        continue
      }
      const stageInfo = mapStage(a)
      if (!stageInfo) {
        skipped_api.push({ home: a.homeTeam.name, away: a.awayTeam.name, reason: `unknown stage ${a.stage}/${a.group ?? ''}` })
        continue
      }
      const team1 = normalize(a.homeTeam.name)
      const team2 = normalize(a.awayTeam.name)
      const { error: insErr } = await supabase
        .from('cup_matches')
        .insert({
          stage: stageInfo.stage,
          group_letter: stageInfo.group_letter,
          team1,
          team2,
          kickoff: a.utcDate,
          venue: a.venue ?? null,
          is_knockout: stageInfo.is_knockout,
        })
      if (insErr) {
        errors.push({ team1, team2, error: `insert: ${insErr.message}` })
      } else {
        inserts.push({ team1, team2, kickoff: a.utcDate, stage: stageInfo.stage })
        matchedApiIds.add(a.id)
      }
      continue
    }

    matchedApiIds.add(a.id)
    // UPDATE path — only if API marks it finished AND we haven't already
    // settled it. .is('actual_outcome', null) on the update gives race-safety.
    if (a.status !== 'FINISHED' || ours.actual_outcome != null) continue
    const swap = normalize(a.homeTeam.name) === ours.team2
    const result = computeOutcome(a, ours.is_knockout, swap)
    if (!result) continue

    const { error: updErr, count } = await supabase
      .from('cup_matches')
      .update({
        score1: result.score1,
        score2: result.score2,
        actual_outcome: result.outcome,
      }, { count: 'exact' })
      .eq('id', ours.id)
      .is('actual_outcome', null)

    if (updErr) {
      errors.push({ team1: ours.team1, team2: ours.team2, error: updErr.message })
    } else if ((count ?? 0) > 0) {
      updates.push({
        team1: ours.team1,
        team2: ours.team2,
        outcome: result.outcome,
        score: `${result.score1}-${result.score2}`,
      })
    }
  }

  // ── Cards pass ────────────────────────────────────────────────────────
  // For each finished match we haven't yet synced cards for, fetch the
  // detail endpoint, tally RED + YELLOW_RED bookings per team, and write
  // back to cup_matches.reds1 / reds2 plus cards_synced_at so we don't
  // re-fetch. Cap per run so we stay inside football-data.org's free-tier
  // 10-req/min limit even when backfilling a lot at once.
  const CARDS_FETCH_CAP = 8
  // Re-read fresh so newly-updated rows from above are included.
  const { data: postRows } = await supabase
    .from('cup_matches')
    .select('id, team1, team2, actual_outcome, cards_synced_at')
    .not('actual_outcome', 'is', null)
    .is('cards_synced_at', null)
    .limit(CARDS_FETCH_CAP)
  const needsCards = (postRows as { id: string; team1: string; team2: string }[]) ?? []

  const apiById = new Map<string, ApiMatch>()
  // We didn't keep API rows indexed earlier — index by team-pair + kickoff
  // so we can look up the API id for each of our rows that needs cards.
  // But the simplest is: re-iterate apiMatches once and match by team/time
  // for each of our needsCards rows.
  const cardUpdates: { team1: string; team2: string; reds1: number; reds2: number }[] = []
  const cardErrors: { team1: string; team2: string; error: string }[] = []
  for (const our of needsCards) {
    const api = apiMatches.find(a => {
      if (!a.homeTeam.name || !a.awayTeam.name) return false
      const h = normalize(a.homeTeam.name)
      const w = normalize(a.awayTeam.name)
      return (h === our.team1 && w === our.team2) || (h === our.team2 && w === our.team1)
    })
    if (!api) {
      cardErrors.push({ team1: our.team1, team2: our.team2, error: 'no API match found for cards fetch' })
      continue
    }
    const detailRes = await fetch(`https://api.football-data.org/v4/matches/${api.id}`, {
      headers: { 'X-Auth-Token': apiKey },
    })
    if (!detailRes.ok) {
      cardErrors.push({ team1: our.team1, team2: our.team2, error: `detail ${detailRes.status}` })
      continue
    }
    const detail = await detailRes.json() as ApiMatchDetail
    let reds1 = 0
    let reds2 = 0
    for (const b of detail.bookings ?? []) {
      if (b.card !== 'RED' && b.card !== 'YELLOW_RED') continue
      const bookedTeam = normalize(b.team.name)
      if (bookedTeam === our.team1) reds1++
      else if (bookedTeam === our.team2) reds2++
    }
    const { error: updErr } = await supabase
      .from('cup_matches')
      .update({ reds1, reds2, cards_synced_at: new Date().toISOString() })
      .eq('id', our.id)
    if (updErr) {
      cardErrors.push({ team1: our.team1, team2: our.team2, error: `cards update: ${updErr.message}` })
    } else {
      cardUpdates.push({ team1: our.team1, team2: our.team2, reds1, reds2 })
    }
    // Track API id so we can mention in the response which rows we re-hit
    apiById.set(our.id, api)
  }

  return new Response(JSON.stringify({
    api_total: apiMatches.length,
    our_total: ourMatches.length,
    inserted: inserts.length,
    updated: updates.length,
    cards_synced: cardUpdates.length,
    inserts,
    updates,
    card_updates: cardUpdates,
    errors: [...errors, ...cardErrors],
    skipped_api,
  }), { headers: { 'Content-Type': 'application/json' } })
})
