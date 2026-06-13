// Polls football-data.org for FIFA World Cup matches and keeps cup_matches
// in sync. Plus pulls per-match red cards from api-football.com IF the
// account has paid access to the current season (free tier of api-football
// excludes WC 2026 — verified 2026-06-13 — so this pass currently no-ops
// even with the key set; cards stay as cup_sweepstake_team_status.manual_reds
// entered by admin).
//
// Reliability: every external fetch is wrapped so a transient network blip or
// API timeout degrades gracefully (bail this run, or skip the cards pass)
// instead of throwing an uncaught error that aborts the whole sync with an
// opaque 500. A top-level guard surfaces any remaining error as JSON so it's
// diagnosable from net._http_response / the function logs.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const FD_TEAM_ALIASES: Record<string, string> = {
  'Korea Republic': 'South Korea', 'Bosnia and Herzegovina': 'Bosnia & Herz.',
  'Bosnia-Herzegovina': 'Bosnia & Herz.', 'USA': 'United States',
  'Czech Republic': 'Czechia', 'Türkiye': 'Turkey', 'Turkiye': 'Turkey',
  'Holland': 'Netherlands', "Côte d'Ivoire": 'Ivory Coast',
  'Cote d\'Ivoire': 'Ivory Coast', 'Cabo Verde': 'Cape Verde',
  'Cape Verde Islands': 'Cape Verde', 'Congo DR': 'DR Congo',
}
const fdNormalize = (n: string): string => FD_TEAM_ALIASES[n] ?? n

const AF_TEAM_ALIASES: Record<string, string> = {
  'Korea Republic': 'South Korea', 'South-Korea': 'South Korea',
  'USA': 'United States', 'Bosnia and Herzegovina': 'Bosnia & Herz.',
  'Bosnia-Herzegovina': 'Bosnia & Herz.', 'Czech-Republic': 'Czechia',
  'Czech Republic': 'Czechia', 'Türkiye': 'Turkey', 'Turkiye': 'Turkey',
  'New-Zealand': 'New Zealand', 'Saudi-Arabia': 'Saudi Arabia',
  'South-Africa': 'South Africa', "Côte d'Ivoire": 'Ivory Coast',
  'Ivory-Coast': 'Ivory Coast', 'Cote d\'Ivoire': 'Ivory Coast',
  'Cabo Verde': 'Cape Verde', 'Cape-Verde': 'Cape Verde',
  'Cape Verde Islands': 'Cape Verde', 'Congo DR': 'DR Congo',
  'DR-Congo': 'DR Congo', 'Holland': 'Netherlands',
}
const afNormalize = (n: string): string => AF_TEAM_ALIASES[n] ?? n

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

interface FdMatch {
  id: number; utcDate: string; status: string; stage: string
  group?: string | null; venue?: string | null
  homeTeam: { name: string | null }; awayTeam: { name: string | null }
  score: { duration: 'REGULAR'|'EXTRA_TIME'|'PENALTY_SHOOTOUT'
           fullTime: { home: number | null; away: number | null }
           winner: 'HOME_TEAM'|'AWAY_TEAM'|'DRAW'|null }
}
interface CupMatchRow {
  id: string; team1: string; team2: string; kickoff: string
  is_knockout: boolean; actual_outcome: string | null; cards_synced_at: string | null
}
interface AfFixtureListItem { fixture: { id: number; date: string }; teams: { home: { name: string }; away: { name: string } } }
interface AfEvent { team: { name: string }; type: string; detail: string }

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const errMsg = (e: unknown): string => e instanceof Error ? e.message : String(e)

function computeOutcome(api: FdMatch, isKnockout: boolean, swap: boolean) {
  const home = api.score.fullTime.home, away = api.score.fullTime.away
  if (home == null || away == null) return null
  const score1 = swap ? away : home, score2 = swap ? home : away
  if (!isKnockout) {
    let outcome: string
    if (api.score.winner === 'DRAW') outcome = 'draw'
    else if (api.score.winner === 'HOME_TEAM') outcome = swap ? 'team2' : 'team1'
    else if (api.score.winner === 'AWAY_TEAM') outcome = swap ? 'team1' : 'team2'
    else return null
    return { outcome, score1, score2 }
  }
  let mode: '90'|'et'|'pen'
  if (api.score.duration === 'PENALTY_SHOOTOUT') mode = 'pen'
  else if (api.score.duration === 'EXTRA_TIME') mode = 'et'
  else mode = '90'
  let winnerSide: 'team1'|'team2'
  if (api.score.winner === 'HOME_TEAM') winnerSide = swap ? 'team2' : 'team1'
  else if (api.score.winner === 'AWAY_TEAM') winnerSide = swap ? 'team1' : 'team2'
  else return null
  return { outcome: `${winnerSide}_${mode}`, score1, score2 }
}

Deno.serve(async () => {
  const fdKey = Deno.env.get('FOOTBALL_DATA_API_KEY')
  const afKey = Deno.env.get('API_FOOTBALL_KEY')
  if (!fdKey) return new Response(JSON.stringify({ error: 'FOOTBALL_DATA_API_KEY not set' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  try {
  let fdRes: Response
  try {
    fdRes = await fetch('https://api.football-data.org/v4/competitions/WC/matches', { headers: { 'X-Auth-Token': fdKey } })
  } catch (e) {
    // Transient network/timeout on the results feed — bail this run cleanly so
    // the next scheduled run retries, instead of crashing with a generic 500.
    return new Response(JSON.stringify({ error: `FD fetch failed: ${errMsg(e)}` }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
  if (!fdRes.ok) return new Response(JSON.stringify({ error: `FD ${fdRes.status}: ${await fdRes.text()}` }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  const fdMatches = ((await fdRes.json()) as { matches: FdMatch[] }).matches ?? []

  const { data: allRows, error: fetchErr } = await supabase.from('cup_matches').select('id, team1, team2, kickoff, is_knockout, actual_outcome, cards_synced_at')
  if (fetchErr) return new Response(JSON.stringify({ error: `DB fetch: ${fetchErr.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  const ourMatches = (allRows as CupMatchRow[]) ?? []

  const updates: { team1: string; team2: string; outcome: string; score: string }[] = []
  const inserts: { team1: string; team2: string; kickoff: string; stage: string }[] = []
  const errors: { team1: string; team2: string; error: string }[] = []
  const skipped_api: { home: string|null; away: string|null; reason: string }[] = []

  function findOurFdMatch(a: FdMatch): CupMatchRow | null {
    const apiHome = a.homeTeam.name ? fdNormalize(a.homeTeam.name) : null
    const apiAway = a.awayTeam.name ? fdNormalize(a.awayTeam.name) : null
    if (!apiHome || !apiAway) return null
    const apiTimeMs = new Date(a.utcDate).getTime()
    return ourMatches.find(m => {
      const teamsMatch = (apiHome === m.team1 && apiAway === m.team2) || (apiHome === m.team2 && apiAway === m.team1)
      const timeMatch = Math.abs(new Date(m.kickoff).getTime() - apiTimeMs) <= TWO_HOURS_MS
      return teamsMatch && timeMatch
    }) ?? null
  }

  for (const a of fdMatches) {
    if (!a.homeTeam.name || !a.awayTeam.name) { skipped_api.push({ home: a.homeTeam.name, away: a.awayTeam.name, reason: 'no team name yet' }); continue }
    const ours = findOurFdMatch(a)
    if (!ours) {
      if (a.status === 'FINISHED') { skipped_api.push({ home: a.homeTeam.name, away: a.awayTeam.name, reason: 'finished before we tracked it' }); continue }
      const stageInfo = mapStage(a)
      if (!stageInfo) { skipped_api.push({ home: a.homeTeam.name, away: a.awayTeam.name, reason: `unknown stage ${a.stage}/${a.group ?? ''}` }); continue }
      const team1 = fdNormalize(a.homeTeam.name), team2 = fdNormalize(a.awayTeam.name)
      const { error: insErr } = await supabase.from('cup_matches').insert({
        stage: stageInfo.stage, group_letter: stageInfo.group_letter,
        team1, team2, kickoff: a.utcDate, venue: a.venue ?? null, is_knockout: stageInfo.is_knockout,
      })
      if (insErr) errors.push({ team1, team2, error: `insert: ${insErr.message}` })
      else inserts.push({ team1, team2, kickoff: a.utcDate, stage: stageInfo.stage })
      continue
    }
    if (a.status !== 'FINISHED' || ours.actual_outcome != null) continue
    const swap = fdNormalize(a.homeTeam.name) === ours.team2
    const result = computeOutcome(a, ours.is_knockout, swap)
    if (!result) continue
    const { error: updErr, count } = await supabase.from('cup_matches')
      .update({ score1: result.score1, score2: result.score2, actual_outcome: result.outcome }, { count: 'exact' })
      .eq('id', ours.id).is('actual_outcome', null)
    if (updErr) errors.push({ team1: ours.team1, team2: ours.team2, error: updErr.message })
    else if ((count ?? 0) > 0) updates.push({ team1: ours.team1, team2: ours.team2, outcome: result.outcome, score: `${result.score1}-${result.score2}` })
  }

  // api-football pass: kept wired in case the account is upgraded later.
  // Free plan errors out with 'Free plans do not have access to this season,
  // try from 2022 to 2024' so fixtures_seen stays 0 and we skip everything.
  const cardUpdates: { team1: string; team2: string; reds1: number; reds2: number }[] = []
  const cardSkipped: { team1: string; team2: string; reason: string }[] = []
  const afStats = { enabled: !!afKey, list_status: 0, fixtures_seen: 0, processed: 0 }
  if (afKey) {
    const { data: needsRows } = await supabase.from('cup_matches')
      .select('id, team1, team2, kickoff').not('actual_outcome', 'is', null).is('cards_synced_at', null).limit(8)
    const needs = (needsRows as { id: string; team1: string; team2: string; kickoff: string }[]) ?? []
    if (needs.length > 0) {
      let afListRes: Response | null = null
      try {
        afListRes = await fetch('https://v3.football.api-sports.io/fixtures?league=1&season=2026', {
          headers: { 'x-apisports-key': afKey },
        })
      } catch (e) {
        // Cards are a nice-to-have; a fetch failure here must not abort the run.
        cardSkipped.push({ team1: '-', team2: '-', reason: `AF list fetch failed: ${errMsg(e)}` })
      }
      afStats.list_status = afListRes?.status ?? 0
      if (afListRes && afListRes.ok) {
        const afList = await afListRes.json() as { response: AfFixtureListItem[] }
        const afFixtures = afList.response ?? []
        afStats.fixtures_seen = afFixtures.length
        for (const our of needs) {
          const ourTime = new Date(our.kickoff).getTime()
          const af = afFixtures.find(f => {
            const h = afNormalize(f.teams.home.name), w = afNormalize(f.teams.away.name)
            const t = new Date(f.fixture.date).getTime()
            const teamsMatch = (h === our.team1 && w === our.team2) || (h === our.team2 && w === our.team1)
            return teamsMatch && Math.abs(t - ourTime) <= TWO_HOURS_MS
          })
          if (!af) { cardSkipped.push({ team1: our.team1, team2: our.team2, reason: 'no AF fixture matched' }); continue }
          let evRes: Response
          try {
            evRes = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${af.fixture.id}`, {
              headers: { 'x-apisports-key': afKey },
            })
          } catch (e) {
            cardSkipped.push({ team1: our.team1, team2: our.team2, reason: `events fetch failed: ${errMsg(e)}` }); continue
          }
          if (!evRes.ok) { cardSkipped.push({ team1: our.team1, team2: our.team2, reason: `events ${evRes.status}` }); continue }
          const evJson = await evRes.json() as { response: AfEvent[] }
          const events = evJson.response ?? []
          let reds1 = 0, reds2 = 0
          for (const e of events) {
            if (e.type !== 'Card') continue
            const d = (e.detail || '').toLowerCase()
            if (!d.includes('red') && !d.includes('second yellow')) continue
            const bookedTeam = afNormalize(e.team.name)
            if (bookedTeam === our.team1) reds1++
            else if (bookedTeam === our.team2) reds2++
          }
          const { error: updErr } = await supabase.from('cup_matches')
            .update({ reds1, reds2, cards_synced_at: new Date().toISOString() })
            .eq('id', our.id)
          if (updErr) errors.push({ team1: our.team1, team2: our.team2, error: `cards update: ${updErr.message}` })
          else cardUpdates.push({ team1: our.team1, team2: our.team2, reds1, reds2 })
          afStats.processed++
        }
      }
    }
  }

  return new Response(JSON.stringify({
    api_total: fdMatches.length, our_total: ourMatches.length,
    inserted: inserts.length, updated: updates.length, cards_synced: cardUpdates.length,
    af: afStats, inserts, updates, card_updates: cardUpdates, card_skipped: cardSkipped, errors, skipped_api,
  }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    // Last-resort guard: surface the real message instead of a generic
    // "Internal Server Error" so future failures are diagnosable from logs.
    return new Response(JSON.stringify({ error: `unhandled: ${errMsg(e)}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
