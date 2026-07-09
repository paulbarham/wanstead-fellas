// Shared "how a finished match looks" — the score / group-table / fixtures
// presentation used on both the Match tab (current week) and the History tab
// (prior weeks). One source of truth so the two surfaces never drift.
//
// Does NOT render the structured Match Report — the caller is responsible for
// placing that (Match tab puts it inline; History puts it below the awards
// block). Keeps this component focused on results-style content.

import type { Match, Result, Team, Fixture, ReportPredictions } from '../types'
import SectionHeader from './SectionHeader'
import PredictedVsActual from './PredictedVsActual'
import { stripFC } from '../lib/format'

export interface FixtureScorer {
  player_name: string
  team_id: string
  goals_count: number
  own_goal: boolean
}

// Callers must enrich fixtures with their resolved team rows before passing
// in (filter out any orphaned fixture whose team_id doesn't resolve). This
// matches what loadMatchData and HistoryPage already do.
export interface FixtureWithTeams extends Fixture {
  team1: Team
  team2: Team
}

interface GroupRow {
  team: Team
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  pts: number
}

export function aggregateScorers(scorers: FixtureScorer[]): FixtureScorer[] {
  const map = new Map<string, FixtureScorer>()
  for (const s of scorers) {
    const key = `${s.player_name}|${s.team_id}|${s.own_goal ? 'og' : 'reg'}`
    const existing = map.get(key)
    if (existing) existing.goals_count += s.goals_count
    else map.set(key, { ...s })
  }
  return Array.from(map.values())
}

export function renderScorerLabel(s: FixtureScorer): string {
  if (s.own_goal && s.goals_count > 1) return `${s.player_name} (${s.goals_count} OG)`
  if (s.own_goal) return `${s.player_name} (OG)`
  if (s.goals_count > 1) return `${s.player_name} (${s.goals_count})`
  return s.player_name
}

function buildTable(teams: Team[], fixtures: FixtureWithTeams[]): GroupRow[] {
  const rows: Record<string, GroupRow> = {}
  for (const t of teams) {
    rows[t.id] = { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 }
  }
  for (const f of fixtures) {
    if (f.score1 == null && f.score2 == null) continue
    const s1 = f.score1 ?? 0
    const s2 = f.score2 ?? 0
    const t1 = rows[f.team1_id]
    const t2 = rows[f.team2_id]
    if (!t1 || !t2) continue
    t1.played++; t2.played++
    t1.gf += s1; t1.ga += s2
    t2.gf += s2; t2.ga += s1
    if (s1 > s2) { t1.won++; t1.pts += 3; t2.lost++ }
    else if (s1 < s2) { t2.won++; t2.pts += 3; t1.lost++ }
    else {
      t1.drawn++; t1.pts += 1; t2.drawn++; t2.pts += 1
      // Drawn fixture → penalty shootout: winner takes a bonus point (migration 035).
      if (f.shootout_winner === 1) t1.pts += 1
      else if (f.shootout_winner === 2) t2.pts += 1
    }
  }
  return Object.values(rows).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    return (b.gf - b.ga) - (a.gf - a.ga)
  })
}

// Legacy free-text scorers — matches entered before the goals table existed.
// Format: "Team A: Player1, Player2 (2)\nTeam B: Player3" (one line per team).
function LegacyScorers({ scorers }: { scorers: string }) {
  let lines = scorers.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 1 && (scorers.match(/:/g) ?? []).length > 1) {
    const parts = scorers
      .split(/(?<=\S)\s+(?=[A-Z][a-z]+ [A-Z][a-z]+(?:\s+(?:FC|XI))?:)/)
      .map(l => l.trim()).filter(Boolean)
    if (parts.length > 1 && parts.every(p => p.includes(':'))) lines = parts
  }
  if (lines.length === 1 && !scorers.includes(':')) {
    return <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text)' }}>{scorers}</p>
  }
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
          return (
            <p key={i} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text)' }}>
              <span style={{ fontWeight: 600 }}>{stripFC(line.slice(0, colonIdx).trim())}</span>
              {': '}{line.slice(colonIdx + 1).trim()}
            </p>
          )
        }
        return <p key={i} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text)' }}>{line}</p>
      })}
    </div>
  )
}

function TwoTeamResult({ fixtures, scorersByFixture, legacyScorers }: {
  fixtures: FixtureWithTeams[]
  scorersByFixture: Record<string, FixtureScorer[]>
  legacyScorers: string | null
}) {
  const main = fixtures[0]
  const winner = main?.score1 != null && main?.score2 != null
    ? main.score1 > main.score2 ? main.team1?.name
    : main.score2 > main.score1 ? main.team2?.name
    : null
    : null

  const fixtureScorers = main ? aggregateScorers(scorersByFixture[main.id] ?? []) : []
  const team1Scorers = main ? fixtureScorers.filter(s => s.team_id === main.team1_id) : []
  const team2Scorers = main ? fixtureScorers.filter(s => s.team_id === main.team2_id) : []
  const hasPerFixtureScorers = fixtureScorers.length > 0
  const hasLegacyScorers = !hasPerFixtureScorers && !!legacyScorers && legacyScorers.trim().length > 0

  if (!main) return null
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="px-5 pt-5 pb-4" style={{ fontFamily: 'var(--font-mono)' }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="flex-1 text-right" style={{ fontSize: 14, color: 'var(--color-text)' }}>{stripFC(main.team1?.name)}</span>
          <div className="flex items-center gap-3">
            <span style={{ color: 'var(--tt-yellow)', fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{main.score1 ?? '–'}</span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 20 }}>–</span>
            <span style={{ color: 'var(--tt-yellow)', fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{main.score2 ?? '–'}</span>
          </div>
          <span className="flex-1" style={{ fontSize: 14, color: 'var(--color-text)' }}>{stripFC(main.team2?.name)}</span>
        </div>
        {winner && (
          <p className="text-center" style={{ color: 'var(--tt-yellow)', fontSize: 11, letterSpacing: '0.1em' }}>
            ▶ {winner?.toString().toUpperCase()} WIN
          </p>
        )}
        {!winner && main.score1 != null && (
          (main.shootout_winner === 1 || main.shootout_winner === 2) ? (
            <p className="text-center" style={{ color: 'var(--tt-yellow)', fontSize: 11, letterSpacing: '0.1em' }}>
              ▶ DRAW · {stripFC((main.shootout_winner === 1 ? main.team1 : main.team2)?.name)?.toUpperCase()} WIN ON PENS
            </p>
          ) : (
            <p className="text-center" style={{ color: 'var(--color-text-muted)', fontSize: 11, letterSpacing: '0.1em' }}>▶ DRAW</p>
          )
        )}
      </div>

      {hasPerFixtureScorers && (
        <div className="px-5 py-4 flex items-start gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex-1 text-right text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
            {team1Scorers.map(renderScorerLabel).join(', ') || '—'}
          </div>
          <span style={{ width: 24 }} />
          <div className="flex-1 text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
            {team2Scorers.map(renderScorerLabel).join(', ') || '—'}
          </div>
        </div>
      )}

      {hasLegacyScorers && (
        <div className="px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <SectionHeader label="Scorers" withDivider />
          <LegacyScorers scorers={legacyScorers!} />
        </div>
      )}
    </div>
  )
}

function FourTeamResult({ teams, fixtures, scorersByFixture, legacyScorers, predictions }: {
  teams: Team[]
  fixtures: FixtureWithTeams[]
  scorersByFixture: Record<string, FixtureScorer[]>
  legacyScorers: string | null
  predictions: ReportPredictions | null
}) {
  const table = buildTable(teams, fixtures)
  const anyPerFixtureScorers = fixtures.some(f => (scorersByFixture[f.id]?.length ?? 0) > 0)
  const hasLegacyScorers = !anyPerFixtureScorers && !!legacyScorers && legacyScorers.trim().length > 0

  return (
    <div className="space-y-4">
      {/* Group table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <SectionHeader label="Group Table" />
        </div>
        <table className="w-full" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--tt-cyan)' }}>
              <th className="py-2 text-center font-semibold" style={{ width: 32, paddingLeft: 8, paddingRight: 4, letterSpacing: '0.06em' }}>#</th>
              <th className="py-2 text-left font-semibold" style={{ paddingRight: 4, letterSpacing: '0.06em' }}>TEAM</th>
              <th className="px-2 py-2 font-semibold" style={{ letterSpacing: '0.06em' }}>P</th>
              <th className="px-2 py-2 font-semibold" style={{ letterSpacing: '0.06em' }}>W</th>
              <th className="px-2 py-2 font-semibold" style={{ letterSpacing: '0.06em' }}>D</th>
              <th className="px-2 py-2 font-semibold" style={{ letterSpacing: '0.06em' }}>L</th>
              <th className="px-2 py-2 font-semibold" style={{ letterSpacing: '0.06em' }}>GD</th>
              <th className="px-2 py-2 font-semibold" style={{ color: 'var(--tt-yellow)', letterSpacing: '0.06em' }}>PTS</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => {
              const isLeader = i === 0 && row.pts > 0
              const cellColor = isLeader ? 'var(--tt-yellow)' : 'var(--color-text)'
              const mutedColor = isLeader ? 'var(--tt-yellow)' : 'var(--color-text-muted)'
              return (
                <tr key={row.team.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td className="py-2.5 text-center" style={{ width: 32, paddingLeft: 8, paddingRight: 4, color: mutedColor, fontWeight: isLeader ? 700 : 400 }}>
                    {i + 1}
                  </td>
                  <td className="py-2.5" style={{ paddingRight: 4, color: cellColor, fontWeight: isLeader ? 700 : 400 }}>
                    {stripFC(row.team.name)}
                  </td>
                  <td className="px-2 py-2.5 text-center" style={{ color: mutedColor }}>{row.played}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: mutedColor }}>{row.won}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: mutedColor }}>{row.drawn}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: mutedColor }}>{row.lost}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: mutedColor }}>{row.gf - row.ga >= 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: isLeader ? 'var(--tt-yellow)' : 'var(--tt-cyan)', fontWeight: 700 }}>
                    {row.pts}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Predicted vs. Actual — sits between the table and the results */}
      <PredictedVsActual predictions={predictions} />

      {/* Fixtures (with per-fixture scorers if available) */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <SectionHeader label="Results" />
        </div>
        <div>
          {fixtures.map((f, i) => {
            const fixtureScorers = aggregateScorers(scorersByFixture[f.id] ?? [])
            const team1Scorers = fixtureScorers.filter(s => s.team_id === f.team1_id)
            const team2Scorers = fixtureScorers.filter(s => s.team_id === f.team2_id)
            return (
              <div key={f.id} className="px-4 py-3"
                style={{ borderTop: i > 0 ? '1px solid var(--color-border)' : 'none' }}>
                <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span className="flex-1 text-right" style={{ fontSize: 13, color: 'var(--color-text)' }}>{stripFC(f.team1?.name)}</span>
                  <div className="flex items-center gap-2 px-2">
                    <span style={{ color: 'var(--tt-yellow)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{f.score1 ?? '–'}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>–</span>
                    <span style={{ color: 'var(--tt-yellow)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{f.score2 ?? '–'}</span>
                  </div>
                  <span className="flex-1" style={{ fontSize: 13, color: 'var(--color-text)' }}>{stripFC(f.team2?.name)}</span>
                </div>
                {(f.shootout_winner === 1 || f.shootout_winner === 2) && (
                  <p className="text-center mt-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--tt-yellow)', fontSize: 10, letterSpacing: '0.08em' }}>
                    {stripFC((f.shootout_winner === 1 ? f.team1 : f.team2)?.name)?.toUpperCase()} WON ON PENS (+1)
                  </p>
                )}
                {fixtureScorers.length > 0 && (
                  <div className="flex items-start gap-2 mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span className="flex-1 text-right leading-snug" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                      {team1Scorers.map(renderScorerLabel).join(', ') || '—'}
                    </span>
                    <span className="px-2" style={{ width: 68 }} />
                    <span className="flex-1 leading-snug" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                      {team2Scorers.map(renderScorerLabel).join(', ') || '—'}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legacy whole-match scorers blob (only for old matches lacking goals rows) */}
      {hasLegacyScorers && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <SectionHeader label="Scorers" />
          </div>
          <div className="px-4 py-3">
            <LegacyScorers scorers={legacyScorers!} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function MatchResultView({ match, result, teams, fixtures, scorersByFixture }: {
  match: Match
  result: Result | null
  teams: Team[]
  fixtures: FixtureWithTeams[]
  scorersByFixture: Record<string, FixtureScorer[]>
}) {
  const isMultiTeam = teams.length > 2 || match.format === 'tournament' || match.format === '4-team'
  if (isMultiTeam) {
    return (
      <FourTeamResult
        teams={teams}
        fixtures={fixtures}
        scorersByFixture={scorersByFixture}
        legacyScorers={result?.scorers ?? null}
        predictions={result?.predictions ?? null}
      />
    )
  }
  return (
    <div className="space-y-4">
      <TwoTeamResult fixtures={fixtures} scorersByFixture={scorersByFixture} legacyScorers={result?.scorers ?? null} />
      <PredictedVsActual predictions={result?.predictions ?? null} />
    </div>
  )
}
