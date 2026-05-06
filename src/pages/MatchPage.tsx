import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
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
  const [isCurrentWeek, setIsCurrentWeek] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [fixtures, setFixtures] = useState<FixtureWithTeams[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMatch = useCallback(async () => {
    // Try this week's match first
    const { data: weekMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('match_date', nextThursday)
      .maybeSingle()

    // Fall back to the most recent completed match if nothing this week
    let matchData: Match | null = weekMatch as Match | null
    if (!matchData) {
      const { data: latest } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'completed')
        .order('match_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      matchData = latest as Match | null
      setIsCurrentWeek(false)
    } else {
      setIsCurrentWeek(true)
    }

    if (!matchData) { setLoading(false); return }
    setMatch(matchData)

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
      .maybeSingle()

    setResult((resultData as Result) || null)
    setLoading(false)
  }, [nextThursday])

  useEffect(() => { fetchMatch() }, [fetchMatch])

  // Only show admin entry form for the current week's match during live/post phases
  const canEnterResult = profile?.is_admin && isCurrentWeek && (phase === 'match_live' || phase === 'post_match')

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

  const matchDateLabel = match && match.status !== 'upcoming'
    ? format(new Date(match.match_date + 'T12:00:00'), 'EEE do MMM yyyy')
    : null

  return (
    <div className="px-4 py-5">
      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: '#0D6B52' }}>
        {isCurrentWeek ? 'Match' : 'Last Result'}
      </p>
      <div className="flex items-end justify-between mb-5">
        <h1 className="font-display text-3xl text-white tracking-wide">RESULTS</h1>
        {matchDateLabel && (
          <span className="text-xs pb-0.5" style={{ color: '#555' }}>{matchDateLabel}</span>
        )}
      </div>

      {!match || match.status === 'upcoming' ? (
        <div className="text-center py-12" style={{ color: '#555' }}>
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-white">No result yet</p>
          <p className="text-sm mt-1">Results posted after the match</p>
        </div>
      ) : (match.format === 'tournament' || match.format === '4-team') ? (
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
  const winner = main?.score1 != null && main?.score2 != null
    ? main.score1 > main.score2 ? main.team1?.name
    : main.score2 > main.score1 ? main.team2?.name
    : null
    : null

  return (
    <div className="space-y-3">
      {main && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="font-semibold text-white text-sm flex-1 text-right leading-tight">{main.team1?.name}</span>
              <div className="flex items-center gap-3">
                <span className="font-display text-6xl text-white leading-none">{main.score1 ?? '–'}</span>
                <span className="font-display text-2xl leading-none" style={{ color: '#333' }}>–</span>
                <span className="font-display text-6xl text-white leading-none">{main.score2 ?? '–'}</span>
              </div>
              <span className="font-semibold text-white text-sm flex-1 leading-tight">{main.team2?.name}</span>
            </div>
            {winner && (
              <p className="text-center text-xs font-medium" style={{ color: '#0D6B52' }}>
                {winner} win
              </p>
            )}
            {!winner && main.score1 != null && (
              <p className="text-center text-xs" style={{ color: '#555' }}>Draw</p>
            )}
          </div>

          {result?.scorers && (
            <div className="px-5 py-3" style={{ borderTop: '1px solid #2e2e2e' }}>
              <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: '#555' }}>Scorers</p>
              <p className="text-sm text-white">{result.scorers}</p>
            </div>
          )}
        </div>
      )}

      {result?.report_text && (
        <div className="p-4 rounded-2xl" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#555' }}>Match Report</p>
          <p className="text-sm leading-relaxed" style={{ color: '#bbb' }}>{result.report_text}</p>
        </div>
      )}
    </div>
  )
}

function FourTeamView({ result, teams, fixtures }: {
  result: Result | null
  teams: Team[]
  fixtures: FixtureWithTeams[]
}) {
  const table = buildTable(teams, fixtures)
  const winner = table[0]

  return (
    <div className="space-y-3">
      {/* Group table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #2e2e2e' }}>
          <h3 className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#555' }}>Group Table</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: '#444' }}>
              <th className="px-4 py-2 text-left font-medium">Team</th>
              <th className="px-2 py-2 font-medium">P</th>
              <th className="px-2 py-2 font-medium">W</th>
              <th className="px-2 py-2 font-medium">D</th>
              <th className="px-2 py-2 font-medium">L</th>
              <th className="px-2 py-2 font-medium">GD</th>
              <th className="px-2 py-2 font-medium" style={{ color: '#888' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => {
              const isLeader = i === 0 && row.pts > 0
              return (
                <tr key={row.team.id} style={{ borderTop: '1px solid #1e1e1e' }}>
                  <td className="px-4 py-2.5 font-medium"
                    style={{ color: isLeader ? 'white' : '#999' }}>
                    <span className="mr-2 text-xs" style={{ color: isLeader ? '#0D6B52' : '#333' }}>{i + 1}</span>
                    {row.team.name}
                    {isLeader && <span className="ml-2 text-xs" style={{ color: '#0D6B52' }}>★</span>}
                  </td>
                  <td className="px-2 py-2.5 text-center" style={{ color: '#444' }}>{row.played}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: '#444' }}>{row.won}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: '#444' }}>{row.drawn}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: '#444' }}>{row.lost}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: '#444' }}>{row.gf - row.ga >= 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</td>
                  <td className="px-2 py-2.5 text-center font-bold"
                    style={{ color: isLeader ? '#0D6B52' : '#888' }}>{row.pts}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Fixtures */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #2e2e2e' }}>
          <h3 className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#555' }}>Results</h3>
        </div>
        <div>
          {fixtures.map((f, i) => (
            <div key={f.id} className="px-4 py-3 flex items-center gap-2"
              style={{ borderTop: i > 0 ? '1px solid #1e1e1e' : 'none' }}>
              <span className="flex-1 text-xs text-right font-medium" style={{ color: '#ccc' }}>{f.team1?.name}</span>
              <div className="flex items-center gap-2 px-3">
                <span className="font-display text-2xl text-white">{f.score1 ?? '–'}</span>
                <span className="text-xs" style={{ color: '#333' }}>–</span>
                <span className="font-display text-2xl text-white">{f.score2 ?? '–'}</span>
              </div>
              <span className="flex-1 text-xs font-medium" style={{ color: '#ccc' }}>{f.team2?.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scorers */}
      {result?.scorers && (
        <div className="p-4 rounded-2xl" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#555' }}>Scorers</p>
          <p className="text-sm text-white leading-relaxed">{result.scorers}</p>
        </div>
      )}

      {/* Match report */}
      {result?.report_text && (
        <div className="p-4 rounded-2xl" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#555' }}>
            Match Report
            {winner && <span className="ml-2 normal-case" style={{ color: '#0D6B52' }}>· {winner.team.name} win</span>}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: '#bbb' }}>{result.report_text}</p>
          {result.highlights && (
            <p className="text-xs mt-3 font-medium" style={{ color: '#0D6B52' }}>{result.highlights}</p>
          )}
        </div>
      )}
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
