import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Match, Team, Fixture, Result } from '../types'
import { useNavigate } from 'react-router-dom'
import { getNextThursdayDate, nowLondon } from '../lib/time'
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
    supabase.from('results').select('*').eq('match_id', matchId).eq('status', 'published').maybeSingle(),
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
  const navigate = useNavigate()
  const nextThursday = getNextThursdayDate()

  const [match, setMatch] = useState<Match | null>(null)
  // Admin-only signal: is there an unpublished draft for the next scheduled
  // match? If so, on match day the placeholder branch shows a Publish CTA
  // linking back to the Team Builder — otherwise admin has to guess why
  // AdminMatchEntry hasn't appeared.
  const [hasUnpublishedDraft, setHasUnpublishedDraft] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [fixtures, setFixtures] = useState<FixtureWithTeams[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [scorersByFixture, setScorersByFixture] = useState<Record<string, FixtureScorer[]>>({})
  const [votingOpen, setVotingOpen] = useState(false)

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

    // Display match = the latest match with status='completed', regardless
    // of whether the written report has been filled in yet. The score,
    // scorers and fixtures table are the result; the prose report is
    // optional and can be added later via Edit Result. (Previously we
    // filtered on report_text but that hid freshly-saved matches behind
    // the prior week's report, which was confusing right after Save.)
    const { data: latestRaw } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'completed')
      .order('match_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    let displayMatch = (latestRaw as Match | null) ?? null

    // Hide the previous week's completed match once the coming match is on
    // the horizon — either it's match day itself, teams have been published,
    // or teams have been drafted (unpublished). Otherwise a player opening
    // the Match tab on Wed/Thu sees "MATCH REPORT · <last week>" as the
    // headline, which is stale — tonight's game is imminent. The awaiting-
    // result placeholder is a better read (and on the admin view surfaces
    // the "Publish teams" CTA when a draft exists). Once tonight's result
    // is submitted the newer completed match returns naturally.
    const now = nowLondon()
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const nextThursdayIso = getNextThursdayDate()
    const { data: comingDraft } = await supabase
      .from('team_drafts').select('match_date').eq('match_date', nextThursdayIso).maybeSingle()
    const hasComingWeekTeams = !!thisWeek || !!comingDraft
    if (displayMatch && displayMatch.match_date < nextThursdayIso &&
        (todayIso === nextThursdayIso || hasComingWeekTeams)) {
      displayMatch = null
    }
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

    // Decide where the awards card mounts: pinned at the top while the latest
    // voting window is open, otherwise in the mid-slot (between result and
    // report). MotmVotingCard still decides ballot-vs-results internally.
    const { data: vw } = await supabase
      .from('voting_windows')
      .select('opens_at, closes_at')
      .order('closes_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    // Admin-only: surface the Publish CTA on the placeholder view when a
    // draft exists but no matches row has been published yet. Reuses the
    // draft lookup done above for the hide-rule.
    setHasUnpublishedDraft(!!profile?.is_admin && !!comingDraft && !thisWeek)

    if (vw) {
      const v = vw as { opens_at: string; closes_at: string }
      const nowMs = Date.now()
      setVotingOpen(nowMs >= new Date(v.opens_at).getTime() && nowMs <= new Date(v.closes_at).getTime())
    } else {
      setVotingOpen(false)
    }

    setLoading(false)
  }, [nextThursday, profile?.id, profile?.is_admin])

  useEffect(() => { fetchMatch() }, [fetchMatch])

  // `can_enter_results` is a narrow delegate role — same access as admin
  // for entering scores/scorers, but no other admin capability.
  const canManageResults = !!(profile?.is_admin || profile?.can_enter_results)
  const canEnterResult = canManageResults && !!weekMatch

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
  }

  if (canEnterResult) {
    return (
      <>
        <AdminMatchEntry
          match={weekMatch}
          teams={weekTeams}
          fixtures={weekFixtures}
          result={weekResult}
          onSaved={fetchMatch}
          canWriteReport={!!profile?.is_admin}
        />
        <div className="px-4 pb-4">
          <MotmVotingCard expectedMatchId={weekMatch?.id ?? null} />
        </div>
      </>
    )
  }

  if (canManageResults && editingResult && match) {
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
          teams={teams}
          fixtures={fixtures}
          result={result}
          onSaved={() => { setEditingResult(false); fetchMatch() }}
          canWriteReport={!!profile?.is_admin}
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
        trailing={canManageResults && match ? (
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
        <>
          <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
            <p className="text-4xl mb-3">📊</p>
            <p className="font-medium text-[var(--color-text)]">No result yet</p>
            <p className="text-sm mt-1">
              {weekTeams.length > 0
                ? 'Teams are up — pick your formation on the Teams tab. Results posted after the match.'
                : 'Results posted after the match'}
            </p>
          </div>
          {hasUnpublishedDraft && (
            <div className="mb-4 p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-primary)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>
                Teams drafted but not published
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                Publish tonight's teams to unlock fixture entry and open the voting window. Fixtures generate automatically.
              </p>
              <button
                onClick={() => navigate('/teams')}
                className="w-full py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--color-primary)', color: '#FFFFFF' }}
              >
                Go to Team Builder →
              </button>
            </div>
          )}
          <MotmVotingCard expectedMatchId={weekMatch?.id ?? null} />
        </>
      ) : (
        <div className="space-y-4">
          {/* Voting open → pin the ballot above the result so it's the first
              thing members see while there's something to vote on. */}
          {votingOpen && <MotmVotingCard expectedMatchId={match.id} />}
          <MatchResultView
            match={match}
            result={result}
            teams={teams}
            fixtures={fixtures}
            scorersByFixture={scorersByFixture}
          />
          {/* Voting closed → the awards results sit between the result and the
              written report, matching the History tab's order. */}
          {!votingOpen && <MotmVotingCard expectedMatchId={match.id} />}
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
    </div>
  )
}

