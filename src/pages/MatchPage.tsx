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

async function loadMatchData(matchId: string): Promise<{
  teams: Team[]
  fixtures: FixtureWithTeams[]
  result: Result | null
}> {
  const [{ data: td }, { data: fd }, { data: rd }] = await Promise.all([
    supabase.from('teams').select('*').eq('match_id', matchId),
    supabase.from('fixtures').select('*').eq('match_id', matchId),
    supabase.from('results').select('*').eq('match_id', matchId).maybeSingle(),
  ])
  const teams = (td as Team[]) || []
  const teamMap: Record<string, Team> = {}
  for (const t of teams) teamMap[t.id] = t
  const fixtures = ((fd as Fixture[]) || [])
    .filter(f => teamMap[f.team1_id] && teamMap[f.team2_id])
    .map(f => ({ ...f, team1: teamMap[f.team1_id], team2: teamMap[f.team2_id] }))
  return { teams, fixtures, result: (rd as Result | null) }
}

export default function MatchPage() {
  const { profile } = useAuth()
  const nextThursday = getNextThursdayDate()
  const phase = getMatchPhase(nextThursday)

  // Display: the most recent completed match
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [fixtures, setFixtures] = useState<FixtureWithTeams[]>([])
  const [result, setResult] = useState<Result | null>(null)

  // Current week: used by the admin entry form
  const [weekMatch, setWeekMatch] = useState<Match | null>(null)
  const [weekTeams, setWeekTeams] = useState<Team[]>([])
  const [weekFixtures, setWeekFixtures] = useState<FixtureWithTeams[]>([])
  const [weekResult, setWeekResult] = useState<Result | null>(null)

  const [loading, setLoading] = useState(true)

  const fetchMatch = useCallback(async () => {
    // Always fetch this week's match (needed for admin form)
    const { data: thisWeekRaw } = await supabase
      .from('matches')
      .select('*')
      .eq('match_date', nextThursday)
      .maybeSingle()
    const thisWeek = thisWeekRaw as Match | null
    setWeekMatch(thisWeek)

    // Display match: use this week only if completed, otherwise fall back to most recent completed
    let displayMatch: Match | null = thisWeek?.status === 'completed' ? thisWeek : null
    if (!displayMatch) {
      const { data: latestRaw } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'completed')
        .order('match_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      displayMatch = latestRaw as Match | null
    }
    setMatch(displayMatch)

    // Load display match data
    if (displayMatch) {
      const disp = await loadMatchData(displayMatch.id)
      setTeams(disp.teams)
      setFixtures(disp.fixtures)
      setResult(disp.result)

      // If this week's match differs from display, load it too (for admin form)
      if (thisWeek && thisWeek.id !== displayMatch.id) {
        const week = await loadMatchData(thisWeek.id)
        setWeekTeams(week.teams)
        setWeekFixtures(week.fixtures)
        setWeekResult(week.result)
      } else {
        setWeekTeams(disp.teams)
        setWeekFixtures(disp.fixtures)
        setWeekResult(disp.result)
      }
    } else if (thisWeek) {
      // No completed match exists yet — load week data for admin form
      const week = await loadMatchData(thisWeek.id)
      setWeekTeams(week.teams)
      setWeekFixtures(week.fixtures)
      setWeekResult(week.result)
    }

    setLoading(false)
  }, [nextThursday])

  useEffect(() => { fetchMatch() }, [fetchMatch])

  // Admin entry form: show during live/post phase regardless of week match state
  const canEnterResult = profile?.is_admin && (phase === 'match_live' || phase === 'post_match')

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: '#647060' }}>Loading...</div>
  }

  if (profile?.is_admin && canEnterResult) {
    return <AdminMatchEntry
      match={weekMatch}
      nextThursday={nextThursday}
      teams={weekTeams}
      fixtures={weekFixtures}
      result={weekResult}
      onSaved={fetchMatch}
    />
  }

  const isCurrentWeek = match?.match_date === nextThursday
  const matchDateLabel = match
    ? format(new Date(match.match_date + 'T12:00:00'), 'EEE do MMM yyyy')
    : null

  return (
    <div className="px-4 py-5">
      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: '#0D6B52' }}>
        {isCurrentWeek ? 'Match' : 'Last Result'}
      </p>
      <div className="flex items-end justify-between mb-5">
        <h1 className="font-display text-3xl text-[#18201A] tracking-wide">RESULTS</h1>
        {matchDateLabel && (
          <span className="text-xs pb-0.5" style={{ color: '#9CA897' }}>{matchDateLabel}</span>
        )}
      </div>

      {!match ? (
        <div className="text-center py-12" style={{ color: '#9CA897' }}>
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-[#18201A]">No result yet</p>
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
          style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="font-semibold text-[#18201A] text-sm flex-1 text-right leading-tight">{main.team1?.name}</span>
              <div className="flex items-center gap-3">
                <span className="font-display text-6xl text-[#18201A] leading-none">{main.score1 ?? '–'}</span>
                <span className="font-display text-2xl leading-none" style={{ color: '#333' }}>–</span>
                <span className="font-display text-6xl text-[#18201A] leading-none">{main.score2 ?? '–'}</span>
              </div>
              <span className="font-semibold text-[#18201A] text-sm flex-1 leading-tight">{main.team2?.name}</span>
            </div>
            {winner && (
              <p className="text-center text-xs font-medium" style={{ color: '#0D6B52' }}>
                {winner} win
              </p>
            )}
            {!winner && main.score1 != null && (
              <p className="text-center text-xs" style={{ color: '#9CA897' }}>Draw</p>
            )}
          </div>

          {result?.scorers && (
            <div className="px-5 py-3" style={{ borderTop: '1px solid #E2E4DC' }}>
              <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: '#9CA897' }}>Scorers</p>
              <p className="text-sm text-[#18201A]">{result.scorers}</p>
            </div>
          )}
        </div>
      )}

      {result?.report_text && (
        <div className="p-4 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#9CA897' }}>Match Report</p>
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
      <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #E2E4DC' }}>
          <h3 className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#9CA897' }}>Group Table</h3>
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
              <th className="px-2 py-2 font-medium" style={{ color: '#647060' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => {
              const isLeader = i === 0 && row.pts > 0
              return (
                <tr key={row.team.id} style={{ borderTop: '1px solid #FFFFFF' }}>
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
      <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #E2E4DC' }}>
          <h3 className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#9CA897' }}>Results</h3>
        </div>
        <div>
          {fixtures.map((f, i) => (
            <div key={f.id} className="px-4 py-3 flex items-center gap-2"
              style={{ borderTop: i > 0 ? '1px solid #FFFFFF' : 'none' }}>
              <span className="flex-1 text-xs text-right font-medium" style={{ color: '#ccc' }}>{f.team1?.name}</span>
              <div className="flex items-center gap-2 px-3">
                <span className="font-display text-2xl text-[#18201A]">{f.score1 ?? '–'}</span>
                <span className="text-xs" style={{ color: '#333' }}>–</span>
                <span className="font-display text-2xl text-[#18201A]">{f.score2 ?? '–'}</span>
              </div>
              <span className="flex-1 text-xs font-medium" style={{ color: '#ccc' }}>{f.team2?.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scorers */}
      {result?.scorers && (
        <div className="p-4 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#9CA897' }}>Scorers</p>
          <p className="text-sm text-[#18201A] leading-relaxed">{result.scorers}</p>
        </div>
      )}

      {/* Match report */}
      {result?.report_text && (
        <div className="p-4 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#9CA897' }}>
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
