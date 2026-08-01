#!/usr/bin/env node
// Generates the Wanstead Fellas monthly stats round-up as a one-page
// branded PDF. Run manually or from GitHub Actions on the 1st of each
// month for the previous month. Renders HTML, hands off to WeasyPrint.
//
// Usage:
//   node scripts/monthly-report.mjs           # previous month
//   node scripts/monthly-report.mjs 2026-06   # explicit month
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required)
//
// Output: docs/primers/monthly/YYYY-MM.pdf   (via weasyprint on stdin)

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── args + env ─────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

const args = process.argv.slice(2)
const month = args.find(a => /^\d{4}-\d{2}$/.test(a)) || previousMonthKey()
const fixtureArg = args.find(a => a.startsWith('--fixture='))
const fixturePath = fixtureArg ? fixtureArg.slice('--fixture='.length) : null

if (!/^\d{4}-\d{2}$/.test(month)) {
  console.error(`❌ Bad month arg: "${args[0]}". Expected YYYY-MM (e.g. 2026-06).`)
  process.exit(1)
}

// Local rendering mode: skip Supabase, read raw data from a JSON fixture.
// Used for iteration on the template without needing the service role key.
let supabase = null
if (!fixturePath) {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k])
  if (missing.length) {
    console.error(`❌ Missing env: ${missing.join(', ')}`)
    console.error(`   Pass --fixture=path/to/data.json to render from a local snapshot instead.`)
    process.exit(1)
  }
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

const [yStr, mStr] = month.split('-')
const y = Number(yStr), m = Number(mStr)
const first = `${yStr}-${mStr}-01`
const last  = new Date(y, m, 0).toISOString().slice(0, 10)

const MONTH_LABEL = new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })

console.log(`📊 Building monthly report for ${MONTH_LABEL} (${first} → ${last})…`)

// ── SQL ────────────────────────────────────────────────────────────────

async function q(name, sql) {
  const { data, error } = await supabase.rpc('exec_sql', { q: sql })
  if (!error) return data
  // Fallback: send raw query (Supabase's PostgREST doesn't have exec_sql by
  // default; we assume the caller has a `pgrst_exec_sql` RPC installed, OR
  // we use the JS query builder — for this generator we rely on the JS
  // builder except for the more complex aggregates, which we wrap into
  // views ahead of time. Keeping this fallback for future flexibility.
  throw new Error(`Query "${name}" failed: ${error?.message ?? 'no exec_sql RPC available'}`)
}

// Helper: run a raw sql via a service-role fetch through PostgREST's
// undocumented /rest/v1/rpc — cleaner is to use the JS builder for each
// table. We take that path.

async function fetchAll() {
  // Matches for the month
  const { data: matchRows } = await supabase
    .from('matches').select('id, match_date, format, status')
    .gte('match_date', first).lte('match_date', last)
    .order('match_date', { ascending: true })
  const matches = matchRows ?? []
  const matchIds = matches.map(r => r.id)
  const nights = matches.length

  // Everything else lives under those match ids
  const { data: teams } = await supabase.from('teams').select('id, match_id, name').in('match_id', matchIds.length ? matchIds : ['00000000-0000-0000-0000-000000000000'])
  const { data: fixtures } = await supabase.from('fixtures').select('id, match_id, team1_id, team2_id, score1, score2, shootout_winner').in('match_id', matchIds.length ? matchIds : ['00000000-0000-0000-0000-000000000000'])
  const { data: teamPlayers } = await supabase.from('team_players').select('team_id, player_id').in('team_id', teams?.map(t => t.id) ?? ['00000000-0000-0000-0000-000000000000'])
  const { data: goals } = await supabase.from('goals').select('player_id, team_id, match_id, goals_count, own_goal').in('match_id', matchIds.length ? matchIds : ['00000000-0000-0000-0000-000000000000'])
  const { data: awards } = await supabase.from('award_results').select('match_id, award_type, player_id, vote_count, is_shared').in('match_id', matchIds.length ? matchIds : ['00000000-0000-0000-0000-000000000000'])
  const { data: fitness } = await supabase.from('fitness_sessions').select('profile_id, match_date, distance_m, max_speed_kmh').gte('match_date', first).lte('match_date', last)
  const { data: fines } = await supabase.from('fines').select('player_id, match_date, type, amount, paid').gte('match_date', first).lte('match_date', last)

  // Player lookup — pull anyone referenced
  const referencedIds = new Set([
    ...(goals ?? []).map(g => g.player_id),
    ...(awards ?? []).map(a => a.player_id),
    ...(fitness ?? []).map(f => f.profile_id),
    ...(fines ?? []).map(f => f.player_id),
    ...(teamPlayers ?? []).map(tp => tp.player_id),
  ].filter(Boolean))
  const { data: profileRows } = await supabase.from('profiles').select('id, name, surname, auth_user_id, preferred_position_primary, preferred_foot').in('id', Array.from(referencedIds).length ? Array.from(referencedIds) : ['00000000-0000-0000-0000-000000000000'])
  const profiles = new Map((profileRows ?? []).map(p => [p.id, p]))

  const { data: allActive } = await supabase.from('profiles').select('id').not('auth_user_id', 'is', null)
  const activePoolSize = (allActive ?? []).length

  const nameOf = (id) => {
    const p = profiles.get(id)
    return p ? `${p.name} ${p.surname}` : '—'
  }
  const posOf = (id) => profiles.get(id)?.preferred_position_primary ?? null

  return {
    matches, teams: teams ?? [], fixtures: fixtures ?? [], teamPlayers: teamPlayers ?? [],
    goals: goals ?? [], awards: awards ?? [], fitness: fitness ?? [], fines: fines ?? [],
    nights, nameOf, posOf, activePoolSize,
  }
}

// ── computed sections ──────────────────────────────────────────────────

function buildSections(d) {
  // Headline stats
  const games = d.fixtures.length
  const totalGoals = d.goals.reduce((s, g) => s + Number(g.goals_count), 0)
  const fellas = new Set(d.teamPlayers.map(tp => tp.player_id)).size || d.activePoolSize

  // Top scorers (exclude OGs)
  const scorers = new Map()
  for (const g of d.goals) {
    if (g.own_goal) continue
    scorers.set(g.player_id, (scorers.get(g.player_id) ?? 0) + Number(g.goals_count))
  }
  const topScorers = Array.from(scorers.entries())
    .map(([id, goals]) => ({ id, name: d.nameOf(id), goals }))
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
  const goldenBoot = topScorers[0] ?? null
  const runnersUp = topScorers.slice(1, 6)  // next 5, ranked

  // MOTM: list distinct MOTM winners (dedup, keep first appearance)
  const motmWinners = new Map()  // player_id → wins
  for (const a of d.awards) {
    if (a.award_type !== 'motm') continue
    motmWinners.set(a.player_id, (motmWinners.get(a.player_id) ?? 0) + 1)
  }
  const motmList = Array.from(motmWinners.entries())
    .map(([id, wins]) => ({ id, name: d.nameOf(id), wins }))
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
  const motmTopWins = motmList[0]?.wins ?? 0
  const motmShared = motmList.filter(m => m.wins === motmTopWins)

  // Winning-team leaderboard: night-level winners (top of round-robin points).
  // For each match: compute per-team pts (3W + 1D). Team with max pts is the
  // night's winner. All players on that team get +1 to their "night wins".
  const nightWinners = []  // list of team_ids
  for (const match of d.matches) {
    const fx = d.fixtures.filter(f => f.match_id === match.id)
    const teamStats = new Map()
    for (const f of fx) {
      const [a, b, sa, sb] = [f.team1_id, f.team2_id, f.score1, f.score2]
      for (const t of [a, b]) if (!teamStats.has(t)) teamStats.set(t, { pts: 0, gf: 0, ga: 0 })
      const A = teamStats.get(a), B = teamStats.get(b)
      A.gf += sa; A.ga += sb; B.gf += sb; B.ga += sa
      if (sa > sb) { A.pts += 3 }
      else if (sb > sa) { B.pts += 3 }
      else { A.pts += 1; B.pts += 1 }
    }
    if (teamStats.size === 0) continue
    const ranked = Array.from(teamStats.entries()).map(([id, s]) => ({ id, ...s, gd: s.gf - s.ga }))
      .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf)
    nightWinners.push(ranked[0].id)
  }
  const winTeamSet = new Set(nightWinners)
  const wins = new Map()
  for (const tp of d.teamPlayers) {
    if (winTeamSet.has(tp.team_id)) wins.set(tp.player_id, (wins.get(tp.player_id) ?? 0) + 1)
  }
  const winsList = Array.from(wins.entries())
    .map(([id, w]) => ({ id, name: d.nameOf(id), wins: w }))
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
  const topWinCount = winsList[0]?.wins ?? 0
  const winnersShared = winsList.filter(w => w.wins === topWinCount)

  // The Wall: per-player night-level avg GA + clean-sheet-nights
  //   For each player-night: sum GA of the team they were on across the night.
  //   avg = total GA / nights played. clean = nights where team's GA = 0.
  const wallAgg = new Map()  // player_id → { nights, totalGa, cleanNights }
  for (const match of d.matches) {
    const fx = d.fixtures.filter(f => f.match_id === match.id)
    const teamGa = new Map()
    for (const f of fx) {
      teamGa.set(f.team1_id, (teamGa.get(f.team1_id) ?? 0) + Number(f.score2))
      teamGa.set(f.team2_id, (teamGa.get(f.team2_id) ?? 0) + Number(f.score1))
    }
    const nightTeams = d.teams.filter(t => t.match_id === match.id).map(t => t.id)
    for (const t of nightTeams) {
      const roster = d.teamPlayers.filter(tp => tp.team_id === t).map(tp => tp.player_id)
      const ga = teamGa.get(t) ?? 0
      for (const pid of roster) {
        const cur = wallAgg.get(pid) ?? { nights: 0, totalGa: 0, cleanNights: 0 }
        cur.nights += 1
        cur.totalGa += ga
        if (ga === 0) cur.cleanNights += 1
        wallAgg.set(pid, cur)
      }
    }
  }
  const wallCandidates = Array.from(wallAgg.entries())
    .map(([id, s]) => ({ id, name: d.nameOf(id), ...s, avgGa: s.nights ? s.totalGa / s.nights : Infinity }))
    .filter(x => x.nights >= 2)  // min 2 nights so a one-off shutout doesn't take the crown
    .sort((a, b) => a.avgGa - b.avgGa || b.cleanNights - a.cleanNights || a.name.localeCompare(b.name))
  const wall = wallCandidates[0] ?? null

  // The Engine: km run
  const engineAgg = new Map()  // player_id → { totalM, sessions }
  for (const f of d.fitness) {
    const cur = engineAgg.get(f.profile_id) ?? { totalM: 0, sessions: 0 }
    cur.totalM += Number(f.distance_m)
    cur.sessions += 1
    engineAgg.set(f.profile_id, cur)
  }
  const engineList = Array.from(engineAgg.entries())
    .map(([id, s]) => ({ id, name: d.nameOf(id), totalKm: s.totalM / 1000, sessions: s.sessions, kmPerGame: s.totalM / 1000 / (s.sessions || 1) }))
    .sort((a, b) => b.totalKm - a.totalKm || a.name.localeCompare(b.name))
  const engine = engineList[0] ?? null

  // Iron Men — anyone who played every match of the month
  const nightAppearances = new Map()  // player_id → Set(match_id)
  for (const tp of d.teamPlayers) {
    const team = d.teams.find(t => t.id === tp.team_id)
    if (!team) continue
    const set = nightAppearances.get(tp.player_id) ?? new Set()
    set.add(team.match_id)
    nightAppearances.set(tp.player_id, set)
  }
  const ironMen = Array.from(nightAppearances.entries())
    .filter(([, s]) => s.size === d.nights && d.nights > 0)
    .map(([id]) => ({ id, name: d.nameOf(id) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // DOTD leader: player with highest single-match DOTD vote_count; break ties
  // by total DOTD nom count in the month, then alphabetical.
  const dotds = d.awards.filter(a => a.award_type === 'dotd')
  const dotdBest = new Map()   // player_id → max_votes
  const dotdNoms = new Map()   // player_id → count
  for (const a of dotds) {
    dotdBest.set(a.player_id, Math.max(dotdBest.get(a.player_id) ?? 0, Number(a.vote_count)))
    dotdNoms.set(a.player_id, (dotdNoms.get(a.player_id) ?? 0) + 1)
  }
  const dotdList = Array.from(dotdBest.entries())
    .map(([id, best]) => ({ id, name: d.nameOf(id), bestVotes: best, noms: dotdNoms.get(id) ?? 0 }))
    .sort((a, b) => b.bestVotes - a.bestVotes || b.noms - a.noms || a.name.localeCompare(b.name))
  const dotd = dotdList[0] ?? null

  // Fines Pot
  const finesByType = new Map()  // type → { total, paid, players: Map<name, count> }
  for (const f of d.fines) {
    const cur = finesByType.get(f.type) ?? { total: 0, paid: 0, players: new Map() }
    cur.total += Number(f.amount)
    if (f.paid) cur.paid += Number(f.amount)
    cur.players.set(d.nameOf(f.player_id), (cur.players.get(d.nameOf(f.player_id)) ?? 0) + 1)
    finesByType.set(f.type, cur)
  }
  const fineTotal = Array.from(finesByType.values()).reduce((s, x) => s + x.total, 0)
  const finePaid  = Array.from(finesByType.values()).reduce((s, x) => s + x.paid, 0)

  const FINE_LABELS = {
    lost_ball: { icon: '⚽', label: 'Lost ball' },
    dropout:   { icon: '📕', label: 'Dropout'   },
    late:      { icon: '⏰', label: 'Late'      },
    cuntiness: { icon: '😐', label: 'Cuntiness' },
  }
  const fineRows = ['lost_ball', 'dropout', 'late', 'cuntiness'].map(type => {
    const meta = FINE_LABELS[type]
    const bucket = finesByType.get(type)
    if (!bucket) return { ...meta, total: 0, players: 'Nobody · spotless this month', spotless: true }
    const playersLabel = Array.from(bucket.players.entries())
      .map(([name, n]) => n > 1 ? `${name} ×${n}` : name).join(' · ')
    return { ...meta, total: bucket.total, players: playersLabel, spotless: false }
  })

  // ── Deeper stats ─────────────────────────────────────────────────────
  // Appearances per player (nights named on a team sheet)
  const appearances = new Map()
  for (const [id, set] of nightAppearances) appearances.set(id, set.size)

  // Golden boot goals-per-game
  if (goldenBoot) {
    const apps = appearances.get(goldenBoot.id) || 0
    goldenBoot.apps = apps
    goldenBoot.perGame = apps ? goldenBoot.goals / apps : 0
  }

  // Best single-night haul + hat-tricks (3+ in one night, OGs excluded)
  const haulMap = new Map()  // `${pid}|${mid}` → goals that night
  for (const g of d.goals) {
    if (g.own_goal) continue
    const k = `${g.player_id}|${g.match_id}`
    haulMap.set(k, (haulMap.get(k) ?? 0) + Number(g.goals_count))
  }
  let bestHaul = null
  const hatTricks = []
  for (const [k, v] of haulMap) {
    const pid = k.split('|')[0]
    if (!bestHaul || v > bestHaul.goals) bestHaul = { id: pid, name: d.nameOf(pid), goals: v }
    if (v >= 3) hatTricks.push({ id: pid, name: d.nameOf(pid), goals: v })
  }
  hatTricks.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))

  // Win-rate king — best win% among players with a meaningful sample
  const minNights = Math.max(2, Math.ceil(d.nights / 2))
  const winRateKing = Array.from(appearances.entries())
    .map(([id, played]) => ({ id, name: d.nameOf(id), played, wins: wins.get(id) ?? 0 }))
    .filter(x => x.played >= minNights)
    .map(x => ({ ...x, rate: x.played ? x.wins / x.played : 0 }))
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins || a.name.localeCompare(b.name))[0] ?? null

  // Match-result extremes across every fixture in the month
  const teamName = (id) => d.teams.find(t => t.id === id)?.name ?? '—'
  const dateOf = (mid) => d.matches.find(m => m.id === mid)?.match_date ?? null
  let biggestWin = null   // largest margin (draws excluded)
  let highScore = null    // most combined goals
  let shootouts = 0
  for (const f of d.fixtures) {
    const s1 = Number(f.score1), s2 = Number(f.score2)
    if (f.shootout_winner != null) shootouts++
    const margin = Math.abs(s1 - s2)
    const combined = s1 + s2
    if (margin > 0 && (!biggestWin || margin > biggestWin.margin)) {
      const winId = s1 > s2 ? f.team1_id : f.team2_id
      const loseId = s1 > s2 ? f.team2_id : f.team1_id
      biggestWin = { margin, score: `${Math.max(s1, s2)}–${Math.min(s1, s2)}`, winner: teamName(winId), loser: teamName(loseId), date: dateOf(f.match_id) }
    }
    if (!highScore || combined > highScore.combined) {
      highScore = { combined, score: `${s1}–${s2}`, a: teamName(f.team1_id), b: teamName(f.team2_id), date: dateOf(f.match_id) }
    }
  }

  // Leakiest — foil to The Wall (worst avg GA, min 2 nights)
  const leakiest = Array.from(wallAgg.entries())
    .map(([id, s]) => ({ id, name: d.nameOf(id), ...s, avgGa: s.nights ? s.totalGa / s.nights : 0 }))
    .filter(x => x.nights >= 2)
    .sort((a, b) => b.avgGa - a.avgGa || a.name.localeCompare(b.name))[0] ?? null

  // Fastest — top recorded sprint speed (data may be absent)
  const fastest = d.fitness
    .filter(f => f.max_speed_kmh != null && Number(f.max_speed_kmh) > 0)
    .map(f => ({ id: f.profile_id, name: d.nameOf(f.profile_id), kmh: Number(f.max_speed_kmh) }))
    .sort((a, b) => b.kmh - a.kmh)[0] ?? null

  // Own goals — the calamity tally
  const ogMap = new Map()
  for (const g of d.goals) if (g.own_goal) ogMap.set(g.player_id, (ogMap.get(g.player_id) ?? 0) + Number(g.goals_count))
  const ogList = Array.from(ogMap.entries()).map(([id, n]) => ({ id, name: d.nameOf(id), n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  const ogTotal = ogList.reduce((s, x) => s + x.n, 0)

  // Goals by position band (open play, OGs excluded)
  const POS_BANDS = ['ATT', 'MID', 'DEF', 'GK']
  const posGoals = new Map(POS_BANDS.map(p => [p, 0]))
  let posKnownGoals = 0
  for (const g of d.goals) {
    if (g.own_goal) continue
    const p = d.posOf(g.player_id)
    if (p && posGoals.has(p)) { posGoals.set(p, posGoals.get(p) + Number(g.goals_count)); posKnownGoals += Number(g.goals_count) }
  }
  const goalsByPosition = POS_BANDS.map(p => ({ band: p, goals: posGoals.get(p), pct: posKnownGoals ? posGoals.get(p) / posKnownGoals : 0 }))

  return {
    headline: { nights: d.nights, games, goals: totalGoals, fellas },
    goldenBoot, runnersUp, motmShared, winnersShared,
    wall, engine, ironMen, dotd,
    bestHaul, hatTricks, winRateKing, biggestWin, highScore, shootouts,
    leakiest, fastest, ownGoals: { total: ogTotal, list: ogList },
    goalsByPosition, posKnownGoals,
    fines: { total: fineTotal, paid: finePaid, rows: fineRows },
  }
}

// ── HTML template ──────────────────────────────────────────────────────

function render(monthLabel, s) {
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]))
  const pill = (name) => `<span class="pill">${esc(name)}</span>`

  const scorerRows = s.runnersUp.map((r, i) => `
    <div class="scorer-row">
      <span class="rank">${String(i + 2).padStart(2, '0')}</span>
      <span class="name">${esc(r.name)}</span>
      <span class="goals">${r.goals}</span>
    </div>`).join('')

  const motmBody = s.motmShared.length === 0
    ? '<p class="empty">No MOTM winners yet.</p>'
    : `<p class="honour-sub">${s.motmShared.length > 1 ? `Shared ${s.motmShared.length} ways this month` : 'Undisputed'}</p>
       <div class="honour-grid">${s.motmShared.map(m => `<div class="honour-name">${esc(m.name)}</div>`).join('')}</div>`

  const winnersBody = s.winnersShared.length === 0
    ? '<p class="empty">No round-robin winners recorded.</p>'
    : `<p class="honour-sub">${s.winnersShared.length > 1 ? `${numWord(s.winnersShared.length)} fellas tied on ${s.winnersShared[0].wins} win${s.winnersShared[0].wins === 1 ? '' : 's'}` : `${esc(s.winnersShared[0].name)} · ${s.winnersShared[0].wins} wins`}</p>
       <div class="honour-grid">${s.winnersShared.map(w => `<div class="honour-name">${esc(w.name)}</div>`).join('')}</div>`

  const ironBody = s.ironMen.length === 0
    ? '<p class="empty">No-one made every night this month.</p>'
    : `<div class="pill-row">${s.ironMen.map(p => pill(p.name)).join('')}</div>`

  const wallBlock = s.wall ? `
    <div class="stat-card">
      <div class="stat-label">🧱 THE WALL</div>
      <div class="stat-name">${esc(s.wall.name.toUpperCase())}</div>
      <div class="stat-sub">Meanest defence in ${monthLabel.split(' ')[0]}</div>
      <div class="stat-values">
        <div class="v"><span class="val">${s.wall.avgGa.toFixed(2)}</span><span class="unit">AVG GA</span></div>
        <div class="v"><span class="val">${s.wall.cleanNights}</span><span class="unit">CLEAN SHEET${s.wall.cleanNights === 1 ? '' : 'S'}</span></div>
      </div>
    </div>` : ''

  const engineBlock = s.engine ? `
    <div class="stat-card">
      <div class="stat-label">🏃 THE ENGINE</div>
      <div class="stat-name">${esc(s.engine.name.toUpperCase())}</div>
      <div class="stat-sub">Most ground covered</div>
      <div class="stat-values">
        <div class="v"><span class="val">${s.engine.totalKm.toFixed(2)}</span><span class="unit">TOTAL KM</span></div>
        <div class="v"><span class="val">${s.engine.kmPerGame.toFixed(2)}</span><span class="unit">KM / GAME</span></div>
      </div>
    </div>` : `
    <div class="stat-card muted">
      <div class="stat-label">🏃 THE ENGINE</div>
      <div class="stat-sub">No fitness sessions logged this month</div>
    </div>`

  const dotdBlock = s.dotd ? `
    <div class="shame-card">
      <div class="shame-label">😐 DICK OF THE DAY</div>
      <div class="shame-name">${esc(s.dotd.name.toUpperCase())}</div>
      <div class="shame-count"><span class="n">${s.dotd.noms}</span><span class="u">NOM${s.dotd.noms === 1 ? '' : 'S'}</span></div>
    </div>` : `
    <div class="shame-card muted">
      <div class="shame-label">😐 DICK OF THE DAY</div>
      <div class="shame-sub">Nobody nominated this month</div>
    </div>`

  const fineRowsHtml = s.fines.rows.map(r => `
    <div class="fine-row ${r.spotless ? 'spotless' : ''}">
      <span class="ft">${r.icon} ${esc(r.label)}</span>
      <span class="fp">${esc(r.players)}</span>
      <span class="fa">£${r.total}</span>
    </div>`).join('')

  // Best Haul + hat-tricks
  const hatSuffix = s.hatTricks.length
    ? `<div class="stat-sub">${s.hatTricks.length} hat-trick${s.hatTricks.length === 1 ? '' : 's'}+ this month · ${s.hatTricks.map(h => `${esc(h.name.split(' ')[0])} (${h.goals})`).join(' · ')}</div>`
    : '<div class="stat-sub">No hat-tricks this month</div>'
  const haulBlock = s.bestHaul ? `
    <div class="stat-card">
      <div class="stat-label">🎯 BEST HAUL</div>
      <div class="stat-name">${esc(s.bestHaul.name.toUpperCase())}</div>
      ${hatSuffix}
      <div class="stat-values">
        <div class="v"><span class="val">${s.bestHaul.goals}</span><span class="unit">IN ONE NIGHT</span></div>
      </div>
    </div>` : ''

  // Goals by position bar
  const POS_COLOUR = { ATT: '#E8578A', MID: '#FFD400', DEF: '#4FC3E8', GK: '#4ADC7A' }
  const posBarBlock = s.posKnownGoals ? `
    <div class="stat-card">
      <div class="stat-label">📍 GOALS BY POSITION</div>
      <div class="posbar">${s.goalsByPosition.filter(b => b.goals > 0).map(b => `<span class="seg" style="width:${(b.pct * 100).toFixed(1)}%;background:${POS_COLOUR[b.band]}"></span>`).join('')}</div>
      <div class="poslegend">${s.goalsByPosition.filter(b => b.goals > 0).map(b => `<span class="lg"><span class="dot" style="background:${POS_COLOUR[b.band]}"></span>${b.band} ${Math.round(b.pct * 100)}%</span>`).join('')}</div>
    </div>` : `
    <div class="stat-card muted">
      <div class="stat-label">📍 GOALS BY POSITION</div>
      <div class="stat-sub">Not enough position data this month</div>
    </div>`

  // Form · Results tiles
  const winRateBlock = s.winRateKing ? `
    <div class="stat-card">
      <div class="stat-label">📈 WIN-RATE KING</div>
      <div class="stat-name">${esc(s.winRateKing.name.toUpperCase())}</div>
      <div class="stat-sub">Most nights on the winning team, rate-adjusted</div>
      <div class="stat-values">
        <div class="v"><span class="val">${Math.round(s.winRateKing.rate * 100)}%</span><span class="unit">WIN RATE</span></div>
        <div class="v"><span class="val">${s.winRateKing.wins}/${s.winRateKing.played}</span><span class="unit">W / PLAYED</span></div>
      </div>
    </div>` : ''

  const biggestWinBlock = s.biggestWin ? `
    <div class="stat-card">
      <div class="stat-label">💥 BIGGEST WIN</div>
      <div class="stat-name">${esc(s.biggestWin.score)}</div>
      <div class="stat-sub">${esc(s.biggestWin.winner)} over ${esc(s.biggestWin.loser)}${s.biggestWin.date ? ` · ${fmtDay(s.biggestWin.date)}` : ''}</div>
    </div>` : ''

  const highScoreBlock = s.highScore ? `
    <div class="stat-card">
      <div class="stat-label">🔥 HIGHEST-SCORING GAME</div>
      <div class="stat-name">${esc(s.highScore.score)}</div>
      <div class="stat-sub">${esc(s.highScore.a)} v ${esc(s.highScore.b)}${s.highScore.date ? ` · ${fmtDay(s.highScore.date)}` : ''} · ${s.highScore.combined} goals</div>
    </div>` : ''

  const shootoutBlock = s.shootouts > 0 ? `
    <div class="stat-card">
      <div class="stat-label">🥅 SHOOTOUTS</div>
      <div class="stat-name">${s.shootouts}</div>
      <div class="stat-sub">Drawn game${s.shootouts === 1 ? '' : 's'} settled from the spot (+1 bonus pt)</div>
    </div>` : `
    <div class="stat-card muted">
      <div class="stat-label">🥅 SHOOTOUTS</div>
      <div class="stat-sub">No shootouts this month</div>
    </div>`

  const leakyBlock = s.leakiest ? `
    <div class="stat-card">
      <div class="stat-label">🕳️ THE SIEVE</div>
      <div class="stat-name">${esc(s.leakiest.name.toUpperCase())}</div>
      <div class="stat-sub">Leakiest defence in ${monthLabel.split(' ')[0]}</div>
      <div class="stat-values">
        <div class="v"><span class="val">${s.leakiest.avgGa.toFixed(2)}</span><span class="unit">AVG GA</span></div>
        <div class="v"><span class="val">${s.leakiest.nights}</span><span class="unit">NIGHTS</span></div>
      </div>
    </div>` : ''

  const fastestBlock = s.fastest ? `
    <div class="stat-card">
      <div class="stat-label">⚡ FASTEST</div>
      <div class="stat-name">${esc(s.fastest.name.toUpperCase())}</div>
      <div class="stat-sub">Top recorded sprint</div>
      <div class="stat-values">
        <div class="v"><span class="val">${s.fastest.kmh.toFixed(1)}</span><span class="unit">KM/H</span></div>
      </div>
    </div>` : `
    <div class="stat-card muted">
      <div class="stat-label">⚡ FASTEST</div>
      <div class="stat-sub">No sprint speeds logged this month</div>
    </div>`

  const ogBlock = s.ownGoals.total > 0 ? `
    <div class="shame-card">
      <div class="textcol">
        <div class="shame-label">🙈 OWN GOALS</div>
        <div class="shame-name">${esc(s.ownGoals.list[0].name.toUpperCase())}${s.ownGoals.list.length > 1 ? ' + others' : ''}</div>
      </div>
      <div class="shame-count"><span class="n">${s.ownGoals.total}</span><span class="u">OG${s.ownGoals.total === 1 ? '' : 'S'}</span></div>
    </div>` : `
    <div class="shame-card muted">
      <div class="textcol">
        <div class="shame-label">🙈 OWN GOALS</div>
        <div class="shame-sub">Nobody scored in their own net — clean month</div>
      </div>
    </div>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Wanstead Fellas — ${esc(monthLabel)} Monthly Report</title>
<style>
  @page {
    size: A4;
    margin: 10mm 10mm;
    background: #0F1710;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #0F1710;
    color: #E8F0E9;
    font-family: 'Helvetica', 'Arial', sans-serif;
    font-size: 10pt;
    line-height: 1.4;
  }

  /* ── Print pagination ───────────────────────────────────────
     Keep each whole section together so page breaks fall cleanly
     between sections — never mid-card, never a stranded heading.
     (A section too tall to fit still breaks; avoid is a preference.) */
  .section-label { break-after: avoid; page-break-after: avoid; }
  .section, .masthead, .two-col, .stat-card, .honour-card, .shame-card,
  .boot, .scorers, .fines, .iron-block {
    break-inside: avoid; page-break-inside: avoid;
  }
  .section + .section { margin-top: 2pt; }

  /* ── Masthead ─────────────────────────────────────────────── */
  .masthead {
    background: linear-gradient(180deg, #0D6B52 0%, #095440 100%);
    padding: 10pt 14pt 12pt;
    border-radius: 10pt;
    position: relative;
    border-bottom: 3pt solid #FFD400;
  }
  .masthead .top {
    display: table; width: 100%; margin-bottom: 4pt;
  }
  .masthead .brand {
    display: table-cell; vertical-align: middle;
    font-family: 'Courier New', monospace;
    font-size: 8pt; letter-spacing: 0.2em;
    color: #FFFFFF; text-transform: uppercase;
  }
  .masthead .brand .wf {
    display: inline-block;
    width: 15pt; height: 15pt;
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 2pt;
    text-align: center; line-height: 15pt;
    font-family: 'Arial Black', sans-serif;
    font-size: 8pt; font-weight: 900;
    letter-spacing: 0;
    margin-right: 6pt;
    vertical-align: middle;
  }
  .masthead .handle {
    display: table-cell; vertical-align: middle;
    text-align: right;
    font-family: 'Courier New', monospace;
    font-size: 7.5pt; letter-spacing: 0.05em;
    color: rgba(255,255,255,0.6);
  }
  .masthead .title-row {
    display: table; width: 100%;
  }
  .masthead h1 {
    display: table-cell; vertical-align: middle;
    font-family: 'Arial Black', sans-serif;
    font-size: 34pt;
    color: #FFFFFF; margin: 0;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .masthead .badge {
    display: table-cell; vertical-align: middle;
    text-align: right;
  }
  .masthead .badge span {
    display: inline-block;
    background: #FFD400; color: #0F1710;
    font-family: 'Arial Black', sans-serif;
    font-size: 8pt; letter-spacing: 0.16em;
    padding: 4pt 10pt; border-radius: 6pt;
    text-transform: uppercase;
  }

  /* ── Headline stat strip ─────────────────────────────────── */
  .headline {
    display: table;
    width: 100%;
    margin-top: 10pt;
    background: transparent;
    border-bottom: 1px solid rgba(255,212,0,0.3);
    padding-bottom: 6pt;
  }
  .headline .cell {
    display: table-cell;
    text-align: center;
    padding: 4pt 0;
    border-right: 1px solid rgba(255,255,255,0.05);
    vertical-align: middle;
  }
  .headline .cell:last-child { border-right: none; }
  .headline .n {
    display: block;
    font-family: 'Arial Black', sans-serif;
    font-size: 30pt;
    color: #FFFFFF;
    line-height: 1;
  }
  .headline .u {
    display: block;
    font-family: 'Courier New', monospace;
    font-size: 8pt;
    letter-spacing: 0.2em;
    color: rgba(255,212,0,0.7);
    margin-top: 3pt;
    text-transform: uppercase;
  }

  /* ── Section headings ─────────────────────────────────────── */
  .section-label {
    font-family: 'Courier New', monospace;
    font-size: 8pt;
    letter-spacing: 0.2em;
    color: #FFD400;
    text-transform: uppercase;
    margin: 10pt 0 5pt;
    padding-left: 2pt;
  }
  .section-label::before {
    content: "— ";
    color: #FFD400;
  }

  /* ── Two-column row ──────────────────────────────────────── */
  .two-col {
    display: table;
    width: 100%;
    border-spacing: 6pt 0;
    table-layout: fixed;
  }
  .two-col > div {
    display: table-cell;
    vertical-align: top;
  }

  /* ── Attack: Golden Boot card ────────────────────────────── */
  .boot {
    background: linear-gradient(160deg, #FFD400 0%, #D4A800 100%);
    color: #1A1400;
    padding: 12pt 14pt;
    border-radius: 8pt;
    height: 100%;
    display: table;
    width: 100%;
  }
  .boot .inner {
    display: table-cell;
    vertical-align: middle;
  }
  .boot .label {
    font-family: 'Courier New', monospace;
    font-size: 8pt;
    letter-spacing: 0.18em;
    color: rgba(26,20,0,0.7);
    text-transform: uppercase;
    margin-bottom: 4pt;
  }
  .boot .name {
    font-family: 'Arial Black', sans-serif;
    font-size: 22pt;
    color: #1A1400;
    line-height: 1;
    letter-spacing: 0.01em;
  }
  .boot .count {
    display: table-cell;
    vertical-align: middle;
    text-align: right;
    padding-left: 8pt;
    width: 30%;
  }
  .boot .count .n {
    font-family: 'Arial Black', sans-serif;
    font-size: 40pt;
    color: #1A1400;
    line-height: 1;
  }
  .boot .count .u {
    display: block;
    font-family: 'Courier New', monospace;
    font-size: 7pt;
    letter-spacing: 0.16em;
    color: rgba(26,20,0,0.7);
    text-align: right;
    text-transform: uppercase;
  }

  /* Scorers list */
  .scorers {
    background: #15211A;
    border-radius: 8pt;
    padding: 5pt 10pt;
    height: 100%;
  }
  .scorer-row {
    display: table;
    width: 100%;
    padding: 3pt 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .scorer-row:last-child { border-bottom: none; }
  .scorer-row .rank {
    display: table-cell;
    font-family: 'Courier New', monospace;
    font-size: 9pt;
    color: #9CA897;
    letter-spacing: 0.05em;
    width: 24pt;
  }
  .scorer-row .name {
    display: table-cell;
    font-size: 10pt;
    color: #E8F0E9;
  }
  .scorer-row .goals {
    display: table-cell;
    text-align: right;
    font-family: 'Arial Black', sans-serif;
    color: #FFD400;
    font-size: 11pt;
    width: 30pt;
  }

  /* ── Honour cards (MOTM / winning team) ─────────────────── */
  .honour-card {
    background: #15211A;
    border: 1px solid #2D4A2F;
    border-radius: 8pt;
    padding: 8pt 10pt;
  }
  .honour-label {
    font-family: 'Arial Black', sans-serif;
    font-size: 10pt;
    color: #FFD400;
    letter-spacing: 0.06em;
    margin: 0 0 3pt;
  }
  .honour-sub {
    font-size: 8pt;
    color: #9CA897;
    margin: 0 0 6pt;
    letter-spacing: 0.02em;
  }
  .honour-grid {
    display: block;
    width: 100%;
    margin-top: 2pt;
  }
  .honour-name {
    display: inline-block;
    width: 48%;
    vertical-align: top;
    box-sizing: border-box;
    font-size: 9pt;
    color: #E8F0E9;
    font-weight: 500;
    padding: 2pt 4pt;
  }
  .empty { font-size: 9pt; color: #647060; font-style: italic; }

  /* ── Stat cards (Wall / Engine) ─────────────────────────── */
  .stat-card {
    background: #15211A;
    border: 1px solid #2D4A2F;
    border-radius: 8pt;
    padding: 9pt 11pt;
  }
  .stat-card.muted { opacity: 0.6; }
  .stat-label {
    font-family: 'Courier New', monospace;
    font-size: 8pt;
    letter-spacing: 0.16em;
    color: #FFD400;
    text-transform: uppercase;
    margin-bottom: 3pt;
  }
  .stat-name {
    font-family: 'Arial Black', sans-serif;
    font-size: 16pt;
    color: #FFFFFF;
    line-height: 1;
    letter-spacing: 0.01em;
  }
  .stat-sub {
    font-size: 7.5pt;
    color: #9CA897;
    letter-spacing: 0.03em;
    margin: 3pt 0 6pt;
    text-transform: none;
  }
  .stat-values {
    display: table; width: 100%; margin-top: 4pt;
  }
  .stat-values .v {
    display: table-cell;
    text-align: right;
    padding-right: 4pt;
  }
  .stat-values .v:not(:last-child) { border-right: 1px solid rgba(255,255,255,0.06); padding-right: 8pt; }
  .stat-values .v + .v { padding-left: 8pt; }
  .stat-values .val {
    display: block;
    font-family: 'Arial Black', sans-serif;
    font-size: 15pt;
    color: #FFD400;
    line-height: 1;
  }
  .stat-values .unit {
    display: block;
    font-family: 'Courier New', monospace;
    font-size: 7pt;
    letter-spacing: 0.14em;
    color: #9CA897;
    text-align: right;
    margin-top: 2pt;
    text-transform: uppercase;
  }

  /* ── Iron Men pills ─────────────────────────────────────── */
  .iron-block {
    background: #15211A;
    border: 1px solid #2D4A2F;
    border-radius: 8pt;
    padding: 8pt 10pt;
  }
  .pill-row {
    display: block;
  }
  .pill {
    display: inline-block;
    background: rgba(74,220,122,0.10);
    border: 1px solid #2D4A2F;
    color: #E8F0E9;
    font-size: 8.5pt;
    padding: 3pt 8pt;
    border-radius: 12pt;
    margin: 2pt 3pt 2pt 0;
    font-weight: 500;
  }

  /* ── Shame files ─────────────────────────────────────────── */
  .shame-card {
    background: #15211A;
    border: 1px solid #7A3A3A;
    border-radius: 8pt;
    padding: 9pt 11pt;
    display: table;
    width: 100%;
  }
  .shame-card.muted { opacity: 0.6; border-color: #2D4A2F; }
  .shame-card .textcol {
    display: table-cell; vertical-align: middle;
  }
  .shame-label {
    font-family: 'Courier New', monospace;
    font-size: 8pt;
    letter-spacing: 0.16em;
    color: #F59E0B;
    text-transform: uppercase;
    margin-bottom: 3pt;
  }
  .shame-name {
    font-family: 'Arial Black', sans-serif;
    font-size: 18pt;
    color: #FFFFFF;
    line-height: 1;
  }
  .shame-count {
    display: table-cell;
    text-align: right;
    vertical-align: middle;
    width: 30%;
  }
  .shame-count .n {
    font-family: 'Arial Black', sans-serif;
    font-size: 24pt;
    color: #FFFFFF;
    line-height: 1;
  }
  .shame-count .u {
    display: block;
    font-family: 'Courier New', monospace;
    font-size: 7pt;
    letter-spacing: 0.16em;
    color: #9CA897;
    text-align: right;
    margin-top: 2pt;
    text-transform: uppercase;
  }
  .shame-sub {
    font-size: 8pt; color: #647060; font-style: italic;
  }

  .fines {
    background: #15211A;
    border: 1px solid #2D4A2F;
    border-radius: 8pt;
    padding: 7pt 10pt;
  }
  .fines-head {
    display: table; width: 100%; margin-bottom: 4pt;
  }
  .fines-head .label {
    display: table-cell;
    font-family: 'Arial Black', sans-serif;
    font-size: 10pt;
    color: #FFD400;
    letter-spacing: 0.06em;
  }
  .fines-head .totals {
    display: table-cell; text-align: right;
    font-family: 'Arial Black', sans-serif;
    font-size: 12pt;
    color: #FFD400;
  }
  .fines-head .totals .out {
    font-family: 'Courier New', monospace;
    font-size: 7.5pt;
    color: rgba(255,212,0,0.7);
    letter-spacing: 0.1em;
    margin-left: 3pt;
    text-transform: uppercase;
  }
  .fine-row {
    display: table; width: 100%;
    padding: 3pt 0;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .fine-row:last-child { border-bottom: none; }
  .fine-row .ft {
    display: table-cell;
    font-size: 9pt;
    color: #FFD400;
    width: 30%;
  }
  .fine-row .fp {
    display: table-cell;
    font-size: 8.5pt;
    color: #E8F0E9;
  }
  .fine-row .fa {
    display: table-cell;
    text-align: right;
    font-family: 'Arial Black', sans-serif;
    font-size: 10pt;
    color: #FFD400;
    width: 15%;
  }
  .fine-row.spotless .fp { color: #4ADC7A; font-style: italic; }
  .fine-row.spotless .fa { color: #4ADC7A; }

  .footer {
    background: linear-gradient(180deg, #0D6B52 0%, #095440 100%);
    color: #FFFFFF;
    padding: 6pt 10pt;
    text-align: center;
    border-radius: 6pt;
    margin-top: 8pt;
    font-family: 'Courier New', monospace;
    font-size: 7.5pt;
    letter-spacing: 0.12em;
  }
  .footer strong { color: #FFD400; font-weight: 700; }
  .footer .tag { display: block; margin-top: 2pt; color: rgba(255,255,255,0.7); font-size: 7pt; }

  /* ── Goals-by-position bar ──────────────────────────────── */
  .posbar {
    display: block;
    width: 100%;
    height: 12pt;
    border-radius: 6pt;
    overflow: hidden;
    margin: 6pt 0 5pt;
    background: rgba(255,255,255,0.05);
    font-size: 0;
  }
  .posbar .seg { display: inline-block; height: 12pt; }
  .poslegend { display: block; }
  .poslegend .lg {
    display: inline-block;
    font-family: 'Courier New', monospace;
    font-size: 7pt;
    letter-spacing: 0.1em;
    color: #9CA897;
    margin: 0 8pt 0 0;
    text-transform: uppercase;
  }
  .poslegend .dot {
    display: inline-block;
    width: 6pt; height: 6pt;
    border-radius: 50%;
    margin-right: 3pt;
    vertical-align: middle;
  }
  .stat-row { margin-top: 6pt; }
</style>
</head>
<body>

<div class="masthead">
  <div class="top">
    <div class="brand">
      <span class="wf">WF</span> WANSTEAD FELLAS
    </div>
    <div class="handle">@wanstead_football_fellas</div>
  </div>
  <div class="title-row">
    <h1>${esc(monthLabel.toUpperCase())}</h1>
    <div class="badge"><span>Monthly Report</span></div>
  </div>
  <div class="headline">
    <div class="cell"><span class="n">${s.headline.nights}</span><span class="u">Nights</span></div>
    <div class="cell"><span class="n">${s.headline.games}</span><span class="u">Games</span></div>
    <div class="cell"><span class="n">${s.headline.goals}</span><span class="u">Goals</span></div>
    <div class="cell"><span class="n">${s.headline.fellas}</span><span class="u">Fellas</span></div>
  </div>
</div>

<div class="section keep">
  <div class="section-label">Attack · Goals</div>
  <div class="two-col">
    <div>
      ${s.goldenBoot ? `
      <div class="boot">
        <div class="inner">
          <div class="label">Golden Boot${s.goldenBoot.perGame ? ` · ${s.goldenBoot.perGame.toFixed(1)} / game` : ''}</div>
          <div class="name">${esc(s.goldenBoot.name.toUpperCase())}</div>
        </div>
        <div class="count">
          <span class="n">${s.goldenBoot.goals}</span>
          <span class="u">Goals</span>
        </div>
      </div>` : '<div class="scorers"><p class="empty">No goals scored this month.</p></div>'}
    </div>
    <div>
      <div class="scorers">${scorerRows || '<p class="empty">No other scorers.</p>'}</div>
    </div>
  </div>
  <div class="two-col stat-row">
    <div>${haulBlock}</div>
    <div>${posBarBlock}</div>
  </div>
</div>

<div class="section keep">
  <div class="section-label">Form · Results</div>
  <div class="two-col">
    <div>${winRateBlock}</div>
    <div>${biggestWinBlock}</div>
  </div>
  <div class="two-col stat-row">
    <div>${highScoreBlock}</div>
    <div>${shootoutBlock}</div>
  </div>
</div>

<div class="section keep">
  <div class="section-label">Honours</div>
  <div class="two-col">
    <div class="honour-card">
      <div class="honour-label">🏆 MAN OF THE MATCH</div>
      ${motmBody}
    </div>
    <div class="honour-card">
      <div class="honour-label">🥇 WINNING TEAM</div>
      ${winnersBody}
    </div>
  </div>
</div>

<div class="section keep">
  <div class="section-label">Defence · Distance</div>
  <div class="two-col">
    <div>${wallBlock}</div>
    <div>${leakyBlock}</div>
  </div>
  <div class="two-col stat-row">
    <div>${engineBlock}</div>
    <div>${fastestBlock}</div>
  </div>
</div>

<div class="section keep">
  <div class="section-label">Iron Men · Played all ${s.headline.nights}</div>
  <div class="iron-block">${ironBody}</div>
</div>

<div class="section keep">
  <div class="section-label">The Shame Files</div>
  <div class="two-col">
    <div>${dotdBlock}</div>
    <div>${ogBlock}</div>
  </div>
  <div class="stat-row">
    <div class="fines">
      <div class="fines-head">
        <span class="label">💷 FINES POT</span>
        <span class="totals">£${s.fines.total}<span class="out"> · £${s.fines.paid} paid</span></span>
      </div>
      ${fineRowsHtml}
    </div>
  </div>
</div>

<div class="footer">
  Full live tables in the app · <strong>Stats tab</strong>
  <span class="tag">@wanstead_football_fellas · Thursdays under the lights</span>
</div>

</body>
</html>`
}

function fmtDay(isoDate) {
  const [, m, dd] = String(isoDate).split('-').map(Number)
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(m || 1) - 1]
  return `${dd} ${mon}`
}

function numWord(n) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
  return words[n] ?? String(n)
}

function previousMonthKey() {
  const d = new Date()
  d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── main ───────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'

let data
if (fixturePath) {
  console.log(`📁 Reading fixture from ${fixturePath}`)
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const profiles = new Map((raw.profileRows ?? []).map(p => [p.id, p]))
  const nameOf = (id) => {
    const p = profiles.get(id)
    return p ? `${p.name} ${p.surname}` : '—'
  }
  const posOf = (id) => profiles.get(id)?.preferred_position_primary ?? null
  data = {
    matches: raw.matches ?? [],
    teams: raw.teams ?? [],
    fixtures: raw.fixtures ?? [],
    teamPlayers: raw.teamPlayers ?? [],
    goals: raw.goals ?? [],
    awards: raw.awards ?? [],
    fitness: raw.fitness ?? [],
    fines: raw.fines ?? [],
    nights: (raw.matches ?? []).length,
    nameOf,
    posOf,
    activePoolSize: raw.activePoolSize ?? 0,
  }
} else {
  data = await fetchAll()
}
console.log(`   ${data.nights} nights, ${data.fixtures.length} fixtures, ${data.teamPlayers.length} team-players, ${data.goals.length} goal rows, ${data.awards.length} award rows.`)

const sections = buildSections(data)
console.log(`   Golden boot: ${sections.goldenBoot?.name ?? '—'} (${sections.goldenBoot?.goals ?? 0})`)
console.log(`   Wall: ${sections.wall?.name ?? '—'} (${sections.wall?.avgGa.toFixed(2) ?? '—'} avg GA)`)
console.log(`   Engine: ${sections.engine?.name ?? '—'} (${sections.engine?.totalKm.toFixed(2) ?? '—'} km)`)
console.log(`   Iron men: ${sections.ironMen.length}`)
console.log(`   Fines: £${sections.fines.total} (${sections.fines.rows.filter(r => !r.spotless).length} categories)`)

const html = render(MONTH_LABEL, sections)
const htmlPath = resolve(REPO_ROOT, `docs/primers/monthly/${month}.html`)
const pdfPath  = resolve(REPO_ROOT, `docs/primers/monthly/${month}.pdf`)

mkdirSync(dirname(htmlPath), { recursive: true })
writeFileSync(htmlPath, html, 'utf8')
console.log(`📝 Wrote ${htmlPath}`)

try {
  execSync(`weasyprint "${htmlPath}" "${pdfPath}"`, { stdio: 'inherit' })
  console.log(`✅ Wrote ${pdfPath}`)
} catch (err) {
  console.error(`❌ WeasyPrint failed: ${err.message}`)
  process.exit(1)
}
