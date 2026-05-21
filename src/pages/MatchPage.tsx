import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Match, Team, Fixture, Result } from '../types'
import { getNextThursdayDate } from '../lib/time'
import AdminMatchEntry from '../components/AdminMatchEntry'
import MatchReport from '../components/MatchReport'
import SectionHeader from '../components/SectionHeader'
import { hasReportContent } from '../lib/report'
import MotmVotingCard from '../components/MotmVotingCard'

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

const LABEL_STYLE = { color: 'var(--color-text-muted)', letterSpacing: '0.8px' } as const
const LABEL_CLASS = 'text-[10px] font-semibold uppercase'
const stripFC = (s?: string) => (s ?? '').replace(/\s+(FC|XI)$/, '')

function ScorersList({ scorers }: { scorers: string }) {
  let lines = scorers.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 1 && (scorers.match(/:/g) ?? []).length > 1) {
    const parts = scorers
      .split(/(?<=\S)\s+(?=[A-Z][a-z]+ [A-Z][a-z]+(?:\s+(?:FC|XI))?:)/)
      .map(l => l.trim()).filter(Boolean)
    if (parts.length > 1 && parts.every(p => p.includes(':'))) lines = parts
  }
  if (lines.length === 1 && !scorers.includes(':')) {
    return <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--color-text)' }}>{scorers}</p>
  }
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
          return (
            <p key={i} style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--color-text)' }}>
              <span style={{ fontWeight: 600 }}>{stripFC(line.slice(0, colonIdx).trim())}</span>
              {': '}{line.slice(colonIdx + 1).trim()}
            </p>
          )
        }
        return <p key={i} style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--color-text)' }}>{line}</p>
      })}
    </div>
  )
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

  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [fixtures, setFixtures] = useState<FixtureWithTeams[]>([])
  const [result, setResult] = useState<Result | null>(null)

  const [weekMatch, setWeekMatch] = useState<Match | null>(null)
  const [weekTeams, setWeekTeams] = useState<Team[]>([])
  const [weekFixtures, setWeekFixtures] = useState<FixtureWithTeams[]>([])
  const [weekResult, setWeekResult] = useState<Result | null>(null)

  const [loading, setLoading] = useState(true)
  const [editingResult, setEditingResult] = useState(false)

  const fetchMatch = useCallback(async () => {
    // "This week" for admin entry = latest unfinished (published) match. This
    // survives the rollover after Thu 22:00 London when getNextThursday()
    // advances to next week's Thursday — we still surface tonight's match so
    // results can be entered.
    const { data: thisWeekRaw } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'published')
      .order('match_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const thisWeek = thisWeekRaw as Match | null
    setWeekMatch(thisWeek)

    const { data: latestRaw } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'completed')
      .order('match_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const displayMatch = latestRaw as Match | null
    setMatch(displayMatch)

    if (displayMatch) {
      const disp = await loadMatchData(displayMatch.id)
      setTeams(disp.teams)
      setFixtures(disp.fixtures)
      setResult(disp.result)

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
      const week = await loadMatchData(thisWeek.id)
      setWeekTeams(week.teams)
      setWeekFixtures(week.fixtures)
      setWeekResult(week.result)
    }

    setLoading(false)
  }, [nextThursday])

  useEffect(() => { fetchMatch() }, [fetchMatch])

  const canEnterResult = !!profile?.is_admin && !!weekMatch

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  }

  if (profile?.is_admin && canEnterResult) {
    return (
      <>
        <div className="px-4 pt-4">
          <MotmVotingCard />
        </div>
        <AdminMatchEntry
          match={weekMatch}
          nextThursday={nextThursday}
          teams={weekTeams}
          fixtures={weekFixtures}
          result={weekResult}
          onSaved={fetchMatch}
        />
      </>
    )
  }

  if (profile?.is_admin && editingResult && match) {
    return (
      <>
        <div className="px-4 pt-4 flex items-center justify-between">
          <button
            onClick={() => setEditingResult(false)}
            className="text-xs font-medium"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ← Cancel
          </button>
          <span className="text-[10px] uppercase font-semibold tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
            Editing Result
          </span>
        </div>
        <AdminMatchEntry
          match={match}
          nextThursday={nextThursday}
          teams={teams}
          fixtures={fixtures}
          result={result}
          onSaved={() => { setEditingResult(false); fetchMatch() }}
        />
      </>
    )
  }

  const matchDateLabel = match
    ? format(new Date(match.match_date + 'T12:00:00'), 'do MMM yyyy')
    : null

  return (
    <div className="px-4 py-5">
      <p className={LABEL_CLASS + ' mb-1'} style={LABEL_STYLE}>Match</p>
      <div className="flex items-end justify-between mb-5">
        <h1 className="font-display text-[var(--color-text)] tracking-wide" style={{ fontSize: '28px' }}>RESULTS</h1>
        <div className="flex items-center gap-2 pb-0.5">
          {matchDateLabel && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{matchDateLabel}</span>
          )}
          {profile?.is_admin && match && (
            <button
              onClick={() => setEditingResult(true)}
              className="text-xs font-medium px-2 py-1 rounded-lg"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              ✎ Edit
            </button>
          )}
        </div>
      </div>

      <MotmVotingCard />

      {!match ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-[var(--color-text)]">No result yet</p>
          <p className="text-sm mt-1">Results posted after the match</p>
        </div>
      ) : (teams.length > 2 || match.format === 'tournament' || match.format === '4-team') ? (
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
    <div className="space-y-4">
      {main && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="font-semibold text-[var(--color-text)] text-sm flex-1 text-right leading-tight">{stripFC(main.team1?.name)}</span>
              <div className="flex items-center gap-3">
                <span className="font-display text-6xl text-[var(--color-text)] leading-none">{main.score1 ?? '–'}</span>
                <span className="font-display text-2xl leading-none" style={{ color: 'var(--color-text-muted)' }}>–</span>
                <span className="font-display text-6xl text-[var(--color-text)] leading-none">{main.score2 ?? '–'}</span>
              </div>
              <span className="font-semibold text-[var(--color-text)] text-sm flex-1 leading-tight">{stripFC(main.team2?.name)}</span>
            </div>
            {winner && (
              <p className="text-center text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                {winner} win
              </p>
            )}
            {!winner && main.score1 != null && (
              <p className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Draw</p>
            )}
          </div>

          {result?.scorers && (
            <div className="px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <SectionHeader label="Scorers" withDivider />
              <ScorersList scorers={result.scorers} />
            </div>
          )}
        </div>
      )}

      {hasReportContent(result) && result && (
        <div className="p-5 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <SectionHeader label="Match Report" withDivider />
          <MatchReport result={result} />
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
    <div className="space-y-4">
      {/* Group table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <SectionHeader label="Group Table" />
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--color-text-muted)' }}>
              <th className="py-2 text-center font-medium" style={{ width: 36, paddingLeft: 8, paddingRight: 4 }}>#</th>
              <th className="py-2 text-left font-medium" style={{ paddingRight: 4 }}>Team</th>
              <th className="px-2 py-2 font-medium">P</th>
              <th className="px-2 py-2 font-medium">W</th>
              <th className="px-2 py-2 font-medium">D</th>
              <th className="px-2 py-2 font-medium">L</th>
              <th className="px-2 py-2 font-medium">GD</th>
              <th className="px-2 py-2 font-medium" style={{ color: 'var(--color-primary)' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => {
              const isLeader = i === 0 && row.pts > 0
              return (
                <tr key={row.team.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td className="py-2.5 text-center font-medium" style={{ width: 36, paddingLeft: 8, paddingRight: 4, color: isLeader ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                    {i + 1}
                  </td>
                  <td className="py-2.5 font-medium text-[var(--color-text)]" style={{ paddingRight: 4 }}>
                    {stripFC(row.team.name)}
                    {isLeader && <span className="ml-1.5 text-xs" style={{ color: 'var(--color-primary)' }}>★</span>}
                  </td>
                  <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.played}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.won}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.drawn}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.lost}</td>
                  <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.gf - row.ga >= 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</td>
                  <td className="px-2 py-2.5 text-center font-bold"
                    style={{ color: isLeader ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{row.pts}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Fixtures */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <SectionHeader label="Results" />
        </div>
        <div>
          {fixtures.map((f, i) => (
            <div key={f.id} className="px-4 py-3 flex items-center gap-2"
              style={{ borderTop: i > 0 ? '1px solid var(--color-border)' : 'none' }}>
              <span className="flex-1 text-xs text-right font-medium text-[var(--color-text)]">{stripFC(f.team1?.name)}</span>
              <div className="flex items-center gap-2 px-3">
                <span className="font-display text-2xl text-[var(--color-text)]">{f.score1 ?? '–'}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>–</span>
                <span className="font-display text-2xl text-[var(--color-text)]">{f.score2 ?? '–'}</span>
              </div>
              <span className="flex-1 text-xs font-medium text-[var(--color-text)]">{stripFC(f.team2?.name)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scorers */}
      {result?.scorers && (
        <div className="p-5 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <SectionHeader label="Scorers" withDivider />
          <ScorersList scorers={result.scorers} />
        </div>
      )}

      {/* Match report */}
      {hasReportContent(result) && result && (
        <div className="p-5 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between gap-2 pb-3 mb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <SectionHeader label="Match Report" />
            {winner && <span className="text-xs font-medium shrink-0" style={{ color: 'var(--color-accent)' }}>{stripFC(winner.team.name)} win</span>}
          </div>
          <MatchReport result={result} />
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
