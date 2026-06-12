// Polls football-data.org for finished FIFA World Cup matches and writes
// scores + outcomes into cup_matches. Only ever updates rows where
// actual_outcome IS NULL — admin-entered results are never overwritten, and
// the existing settle_cup_predictions trigger does the rest (so player
// predictions get scored automatically, just as they would on a manual
// admin entry).
//
// Env vars required:
//   FOOTBALL_DATA_API_KEY  free-tier key from football-data.org
//   SUPABASE_URL           (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// API-name → our cup_matches name. Only entries that actually differ.
// Anything not in this table is matched verbatim.
const TEAM_ALIASES: Record<string, string> = {
  'Korea Republic': 'South Korea',
  'Bosnia and Herzegovina': 'Bosnia & Herz.',
  'United States': 'United States',
  'USA': 'United States',
  'Czech Republic': 'Czechia',
}

const normalize = (apiName: string): string => TEAM_ALIASES[apiName] ?? apiName

interface ApiMatch {
  id: number
  utcDate: string
  status: string
  stage: string
  homeTeam: { name: string }
  awayTeam: { name: string }
  score: {
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'
    fullTime: { home: number | null; away: number | null }
    extraTime?: { home: number | null; away: number | null }
    penalties?: { home: number | null; away: number | null }
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
  }
}

interface CupMatch {
  id: string
  team1: string
  team2: string
  kickoff: string
  is_knockout: boolean
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

// Build the outcome string the rest of the app understands.
// Groups: 'team1' | 'draw' | 'team2'.
// Knockouts: 'teamN_{90|et|pen}'.
// `swap` flips the meaning of "team1"/"team2" because the API's home/away
// ordering may not match our team1/team2 ordering for a given fixture.
function computeOutcome(
  api: ApiMatch,
  isKnockout: boolean,
  swap: boolean,
): { outcome: string; score1: number; score2: number } | null {
  const home = api.score.fullTime.home
  const away = api.score.fullTime.away
  if (home == null || away == null) return null

  // Score: re-order so score1 corresponds to our team1.
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

  // Knockout: detect 90 / ET / PEN from the API's duration field.
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

  const apiRes = await fetch(
    'https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED',
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

  // Only consider unsettled fixtures — admin entries (actual_outcome NOT
  // NULL) are sacred and we never touch them.
  const { data: ourMatches, error: fetchErr } = await supabase
    .from('cup_matches')
    .select('id, team1, team2, kickoff, is_knockout')
    .is('actual_outcome', null)

  if (fetchErr) {
    return new Response(
      JSON.stringify({ error: `DB fetch: ${fetchErr.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const updates: { team1: string; team2: string; outcome: string; score: string }[] = []
  const errors: { team1: string; team2: string; error: string }[] = []

  for (const m of (ourMatches as CupMatch[])) {
    const ourKickoffMs = new Date(m.kickoff).getTime()
    const matched = apiMatches.find(a => {
      const apiHome = normalize(a.homeTeam.name)
      const apiAway = normalize(a.awayTeam.name)
      const apiTimeMs = new Date(a.utcDate).getTime()
      const timeMatch = Math.abs(apiTimeMs - ourKickoffMs) <= TWO_HOURS_MS
      const teamsMatch =
        (apiHome === m.team1 && apiAway === m.team2) ||
        (apiHome === m.team2 && apiAway === m.team1)
      return timeMatch && teamsMatch
    })
    if (!matched) continue

    const swap = normalize(matched.homeTeam.name) === m.team2
    const result = computeOutcome(matched, m.is_knockout, swap)
    if (!result) continue

    // .is('actual_outcome', null) on the update gives us race-safety: if an
    // admin entry landed between our SELECT and UPDATE, our write is a no-op.
    const { error: updErr, count } = await supabase
      .from('cup_matches')
      .update({
        score1: result.score1,
        score2: result.score2,
        actual_outcome: result.outcome,
      }, { count: 'exact' })
      .eq('id', m.id)
      .is('actual_outcome', null)

    if (updErr) {
      errors.push({ team1: m.team1, team2: m.team2, error: updErr.message })
    } else if ((count ?? 0) > 0) {
      updates.push({
        team1: m.team1,
        team2: m.team2,
        outcome: result.outcome,
        score: `${result.score1}-${result.score2}`,
      })
    }
  }

  return new Response(JSON.stringify({
    checked: ourMatches?.length ?? 0,
    api_finished: apiMatches.length,
    updated: updates.length,
    updates,
    errors,
  }), { headers: { 'Content-Type': 'application/json' } })
})
