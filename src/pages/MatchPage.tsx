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
import MatchResultView, { type FixtureScorer, type FixtureWithTeams } from '../components/MatchResultView'

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
      ) : (
        <div className="space-y-4">
          <MatchResultView
            match={match}
            result={result}
            teams={teams}
            fixtures={fixtures}
            scorersByFixture={scorersByFixture}
          />
          {hasReportContent(result) && result && (
            <div className="p-5 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between gap-2 pb-3 mb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <SectionHeader label="Match Report" />
              </div>
              <MatchReport result={result} />
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <MotmVotingCard />
      </div>
    </div>
  )
}

