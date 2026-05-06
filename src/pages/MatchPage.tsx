import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Match, Team, Fixture, Result } from '../types'
import { getNextThursdayDate, getMatchPhase } from '../lib/time'
import AdminMatchEntry from '../components/AdminMatchEntry'

interface FixtureWithTeams extends Fixture {
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

export default function MatchPage() {
  const { profile } = useAuth()
  const nextThursday = getNextThursdayDate()
  const phase = getMatchPhase(nextThursday)
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [fixtures, setFixtures] = useState<FixtureWithTeams[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMatch = useCallback(async () => {
    const { data: matchData } = await supabase
      .from('matches')
      .select('*')
      .eq('match_date', nextThursday)
      .single()

    if (!matchData) { setLoading(false); return }
    setMatch(matchData as Match)

    const { data: teamsData } = await supabase
      .from('teams')
      .select('*')
      .eq('match_id', matchData.id)

    setTeams((teamsData as Team[]) || [])

    const { data: fixturesData } = await supabase
      .from('fixtures')
      .select('*')
      .eq('match_id', matchData.id)

    if (fixturesData && teamsData) {
      const teamMap: Record<string, Team> = {}
      for (const t of teamsData as Team[]) teamMap[t.id] = t

      const enriched = (fixturesData as Fixture[])
        .filter(f => teamMap[f.team1_id] && teamMap[f.team2_id])
        .map(f => ({
          ...f,
          team1: teamMap[f.team1_id],
          team2: teamMap[f.team2_id],
        }))
      setFixtures(enriched)
    }

    const { data: resultData } = await supabase
      .from('results')
      .select('*')
      .eq('match_id', matchData.id)
      .single()

    setResult((resultData as Result) || null)
    setLoading(false)
  }, [nextThursday])

  useEffect(() => { fetchMatch() }, [fetchMatch])

  const canEnterResult = profile?.is_admin && (phase === 'match_live' || phase === 'post_match')

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: '#888' }}>Loading...</div>
  }

  if (profile?.is_admin && canEnterResult) {
    return <AdminMatchEntry
      match={match}
      nextThursday={nextThursday}
      teams={teams}
      fixtures={fixtures}
      result={result}
      onSaved={fetchMatch}
    />
  }

  return (
    <div className="px-4 py-5">
      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: '#0D6B52' }}>Match</p>
      <h1 className="font-display text-3xl text-white tracking-wide mb-5">RESULTS</h1>

      {!match || match.status === 'upcoming' ? (
        <div className="text-center py-12" style={{ color: '#555' }}>
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-white">No result yet</p>
          <p className="text-sm mt-1">Results posted after the match</p>
        </div>
      ) : match.format === 'tournament' ? (
        <FourTeamView result={result} teams={teams} fixtures={fixtures} />
      ) : (
        <ElevenVElevenView result={result} teams={teams} fixtures={fixtures} />
      )}
    </div>
  )
}

function ElevenVElevenView({ result, fixtures }: {
  result: Result | null
  teams?: Team[]
  fixtures: FixtureWithTeams[]
}) {
  const main = fixtures[0]
  return (
    <div className="space-y-4">
      {main && (
        <div className="p-5 rounded-2xl text-center"
          style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <div className="flex items-center justify-center gap-4">
            <span className="font-semibold text-white text-sm flex-1 text-right">{main.team1?.name}</span>
            <div className="flex items-center gap-2">
              <span className="font-display text-4xl text-white">{main.score1 ?? '-'}</span>
              <span className="text-xl" style={{ color: '#555' }}>—</span>
              <span className="font-display text-4xl text-white">{main.score2 ?? '-'}</span>
            </div>
            <span className="font-semibold text-white text-sm flex-1 text-left">{main.team2?.name}</span>
          </div>
        </div>
      )}

      {result?.scorers && (
        <div className="p-4 rounded-2xl" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <h3 className="text-xs uppercase tracking-widest mb-2" style={{ color: '#888' }}>Scorers</h3>
          <p className="text-sm text-white">{result.scorers}</p>
        </div>
      )}

      {result?.report_text && (
        <div className="p-4 rounded-2xl" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <h3 className="text-xs uppercase tracking-widest mb-2" style={{ color: '#888' }}>Match Report</h3>
          <p className="text-sm leading-relaxed" style={{ color: '#ccc' }}>{result.report_text}</p>
        </div>
      )}
    </div>
  )
}

function FourTeamView({ teams, fixtures }: {
  result: Result | null
  teams: Team[]
  fixtures: FixtureWithTeams[]
}) {
  const table = buildTable(teams, fixtures)

  return (
    <div className="space-y-4">
      {/* Group table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#2e2e2e' }}>
          <h3 className="font-semibold text-white text-sm">Group Table</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: '#888' }}>
              <th className="px-4 py-2 text-left">Team</th>
              <th className="px-2 py-2">P</th>
              <th className="px-2 py-2">W</th>
              <th className="px-2 py-2">D</th>
              <th className="px-2 py-2">L</th>
              <th className="px-2 py-2">GD</th>
              <th className="px-2 py-2 font-bold text-white">Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => (
              <tr key={row.team.id} style={{ borderTop: '1px solid #2e2e2e' }}>
                <td className="px-4 py-2 font-medium text-white">
                  <span className="mr-2 text-xs" style={{ color: '#888' }}>{i + 1}</span>
                  {row.team.name}
                </td>
                <td className="px-2 py-2 text-center" style={{ color: '#888' }}>{row.played}</td>
                <td className="px-2 py-2 text-center" style={{ color: '#888' }}>{row.won}</td>
                <td className="px-2 py-2 text-center" style={{ color: '#888' }}>{row.drawn}</td>
                <td className="px-2 py-2 text-center" style={{ color: '#888' }}>{row.lost}</td>
                <td className="px-2 py-2 text-center" style={{ color: '#888' }}>{row.gf - row.ga}</td>
                <td className="px-2 py-2 text-center font-bold text-white">{row.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fixtures */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#2e2e2e' }}>
          <h3 className="font-semibold text-white text-sm">Fixtures</h3>
        </div>
        <div className="divide-y" style={{ borderColor: '#2e2e2e' }}>
          {fixtures.map(f => (
            <div key={f.id} className="px-4 py-3 flex items-center gap-2">
              <span className="flex-1 text-sm text-right font-medium text-white">{f.team1?.name}</span>
              <div className="flex gap-1 items-center px-3">
                <span className="font-display text-xl text-white">{f.score1 ?? '-'}</span>
                <span className="text-xs" style={{ color: '#555' }}>v</span>
                <span className="font-display text-xl text-white">{f.score2 ?? '-'}</span>
              </div>
              <span className="flex-1 text-sm font-medium text-white">{f.team2?.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function buildTable(teams: Team[], fixtures: FixtureWithTeams[]): GroupRow[] {
  const rows: Record<string, GroupRow> = {}
  for (const t of teams) {
    rows[t.id] = { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 }
  }

  for (const f of fixtures) {
    if (f.score1 == null || f.score2 == null) continue
    const t1 = rows[f.team1_id]
    const t2 = rows[f.team2_id]
    if (!t1 || !t2) continue

    t1.played++; t2.played++
    t1.gf += f.score1; t1.ga += f.score2
    t2.gf += f.score2; t2.ga += f.score1

    if (f.score1 > f.score2) {
      t1.won++; t1.pts += 3; t2.lost++
    } else if (f.score1 < f.score2) {
      t2.won++; t2.pts += 3; t1.lost++
    } else {
      t1.drawn++; t1.pts += 1
      t2.drawn++; t2.pts += 1
    }
  }

  return Object.values(rows).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    return (b.gf - b.ga) - (a.gf - a.ga)
  })
}
