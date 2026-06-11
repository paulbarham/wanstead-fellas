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
import CeefaxHeader from '../components/CeefaxHeader'

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

const stripFC = (s?: string) => (s ?? '').replace(/\s+(FC|XI)$/, '')

interface FixtureScorer {
  player_name: string
  team_id: string
  goals_count: number
  own_goal: boolean
}

function aggregateScorers(scorers: FixtureScorer[]): FixtureScorer[] {
  const map = new Map<string, FixtureScorer>()
  for (const s of scorers) {
    const key = `${s.player_name}|${s.team_id}|${s.own_goal ? 'og' : 'reg'}`
    const existing = map.get(key)
    if (existing) existing.goals_count += s.goals_count
    else map.set(key, { ...s })
  }
  return Array.from(map.values())
}

function renderScorerLabel(s: FixtureScorer): string {
  if (s.own_goal && s.goals_count > 1) return `${s.player_name} (${s.goals_count} OG)`
  if (s.own_goal) return `${s.player_name} (OG)`
  if (s.goals_count > 1) return `${s.player_name} (${s.goals_count})`
  return s.player_name
}

async function loadMatchData(matchId: string): Promise<{
  teams: Team[]
  fixtures: FixtureWithTeams[]
  result: Result | null
  scorersByFixture: Record<string, FixtureScorer[]>
}> {
  const [{ data: td }, { data: fd }, { data: rd }, { data: gd }] = await Promise.all([
    supabase.from('teams').select('*').eq('match_id', matchId),
    supabase.from('fixtures').select('*').eq('match_id', matchId),
    supabase.from('results').select('*').eq('match_id', matchId).maybeSingle(),
    supabase
      .from('goals')
      .select('fixture_id, team_id, goals_count, own_goal, profiles:player_id(name, surname)')
      .eq('match_id', matchId),
  ])
  const teams = (td as Team[]) || []
  const teamMap: Record<string, Team> = {}
  for (const t of teams) teamMap[t.id] = t
  const fixtures = ((fd as Fixture[]) || [])
    .filter(f => teamMap[f.team1_id] && teamMap[f.team2_id])
    .map(f => ({ ...f, team1: teamMap[f.team1_id], team2: teamMap[f.team2_id] }))

  const scorersByFixture: Record<string, FixtureScorer[]> = {}
  type GoalRow = {
    fixture_id: string | null
    team_id: string | null
    goals_count: number
    own_goal: boolean
    profiles: { name: string; surname: string } | null
  }
  for (const g of ((gd as unknown as GoalRow[]) || [])) {
    if (!g.fixture_id || !g.team_id || !g.profiles) continue
    const player_name = `${g.profiles.name} ${g.profiles.surname}`
    if (!scorersByFixture[g.fixture_id]) scorersByFixture[g.fixture_id] = []
    scorersByFixture[g.fixture_id].push({
      player_name,
      team_id: g.team_id,
      goals_count: g.goals_count,
      own_goal: g.own_goal,
    })
  }

  return { teams, fixtures, result: (rd as Result | null), scorersByFixture }
}

export default function MatchPage() {
  const { profile } = useAuth()
  const nextThursday = getNextThursdayDate()

  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [fixtures, setFixtures] = useState<FixtureWithTeams[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [scorersByFixture, setScorersByFixture] = useState<Record<string, FixtureScorer[]>>({})

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

    // Display the latest completed match that actually has a written report.
    // Skipping empties means a stub result (created when the admin closes a
    // Display match = latest completed. The "skip until report_text is
    // written" filter we used to have meant a freshly-saved match with no
    // written report got hidden behind the previous week's, which is
    // confusing right after Save Result. The score, scorers and fixtures
    // table are the result; the written report is optional and can be added
    // later via Edit Result.
    const { data: latestRaw } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'completed')
      .order('match_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const displayMatch = (latestRaw as Match | null) ?? null
    setMatch(displayMatch)

    if (displayMatch) {
      const disp = await loadMatchData(displayMatch.id)
      setTeams(disp.teams)
      setFixtures(disp.fixtures)
      setResult(disp.result)
      setScorersByFixture(disp.scorersByFixture)

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
        <AdminMatchEntry
          match={weekMatch}
          nextThursday={nextThursday}
          teams={weekTeams}
          fixtures={weekFixtures}
          result={weekResult}
          onSaved={fetchMatch}
        />
        <div className="px-4 pb-4">
          <MotmVotingCard />
        </div>
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
      <CeefaxHeader
        pageId="P303 · MATCH REPORT"
        title="RESULTS"
        meta={matchDateLabel ? matchDateLabel.toUpperCase() : undefined}
        trailing={profile?.is_admin && match ? (
          <button
            onClick={() => setEditingResult(true)}
            className="text-xs font-medium px-2 py-1 rounded-lg"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            ✎ Edit
          </button>
        ) : undefined}
      />

      {!match ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-[var(--color-text)]">No result yet</p>
          <p className="text-sm mt-1">Results posted after the match</p>
        </div>
      ) : (teams.length > 2 || match.format === 'tournament' || match.format === '4-team') ? (
        <FourTeamView result={result} teams={teams} fixtures={fixtures} scorersByFixture={scorersByFixture} />
      ) : (
        <ElevenVElevenView result={result} teams={teams} fixtures={fixtures} scorersByFixture={scorersByFixture} />
      )}

      <div className="mt-4">
        <MotmVotingCard />
      </div>
    </div>
  )
}

function ElevenVElevenView({ result, fixtures, scorersByFixture }: {
  result: Result | null
  teams?: Team[]
  fixtures: FixtureWithTeams[]
  scorersByFixture: Record<string, FixtureScorer[]>
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
              <p className="text-center" style={{ color: 'var(--color-text-muted)', fontSize: 11, letterSpacing: '0.1em' }}>▶ DRAW</p>
            )}
          </div>

          {(() => {
            const fixtureScorers = aggregateScorers(scorersByFixture[main.id] ?? [])
            if (fixtureScorers.length === 0) return null
            const team1Scorers = fixtureScorers.filter(s => s.team_id === main.team1_id)
            const team2Scorers = fixtureScorers.filter(s => s.team_id === main.team2_id)
            return (
              <div className="px-5 py-4 flex items-start gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="flex-1 text-right text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                  {team1Scorers.map(renderScorerLabel).join(', ') || '—'}
                </div>
                <span style={{ width: 24 }} />
                <div className="flex-1 text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                  {team2Scorers.map(renderScorerLabel).join(', ') || '—'}
                </div>
              </div>
            )
          })()}
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

function FourTeamView({ result, teams, fixtures, scorersByFixture }: {
  result: Result | null
  teams: Team[]
  fixtures: FixtureWithTeams[]
  scorersByFixture: Record<string, FixtureScorer[]>
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

      {/* Fixtures */}
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
    // Counts as played once at least one score is recorded; the other side's
    // null means 0 (admin only tapped + on one stepper).
    if (f.score1 == null && f.score2 == null) continue
    const s1 = f.score1 ?? 0
    const s2 = f.score2 ?? 0
    const t1 = rows[f.team1_id]
    const t2 = rows[f.team2_id]
    if (!t1 || !t2) continue

    t1.played++; t2.played++
    t1.gf += s1; t1.ga += s2
    t2.gf += s2; t2.ga += s1

    if (s1 > s2) {
      t1.won++; t1.pts += 3; t2.lost++
    } else if (s1 < s2) {
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
