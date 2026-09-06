import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Match, Result, Team, Fixture, AwardResult, AwardType } from '../types'
import MatchReport from '../components/MatchReport'
import SectionHeader from '../components/SectionHeader'
import { hasReportContent } from '../lib/report'
import CeefaxHeader from '../components/CeefaxHeader'
import MatchResultView, {
  type FixtureScorer, type FixtureWithTeams,
} from '../components/MatchResultView'
import MatchLineups, { type TeamLineup } from '../components/MatchLineups'
import { stripFC } from '../lib/format'

interface MatchRecord {
  match: Match
  result: Result | null
  teams: Team[]
  fixtures: FixtureWithTeams[]
  scorersByFixture: Record<string, FixtureScorer[]>
  awards: AwardResult[]
  lineups: TeamLineup[]
}

const AWARD_META: Record<AwardType, { label: string; icon: string }> = {
  motm:  { label: 'Man of the Match',   icon: '🏆' },
  dotd:  { label: 'Dick of the Day',    icon: '🤡' },
  theme: { label: 'Theme of the Night', icon: '🎭' },
}

function MatchAwards({ awards, names }: { awards: AwardResult[]; names: Record<string, string> }) {
  const types: AwardType[] = ['motm', 'dotd', 'theme']
  return (
    <div className="space-y-3">
      {types.map(type => {
        const rows = awards.filter(a => a.award_type === type)
        if (rows.length === 0) return null
        const shared = rows.length > 1 || rows.some(r => r.is_shared)
        const isOverride = rows.some(r => r.is_admin_override)
        return (
          <div key={type}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-accent)' }}>
              {AWARD_META[type].icon} {AWARD_META[type].label}
              {shared && <span style={{ color: 'var(--color-text-muted)' }}> · shared</span>}
              {isOverride && <span style={{ color: 'var(--color-text-muted)' }}> · admin call</span>}
            </p>
            <div className="space-y-0.5">
              {rows.map(r => (
                <p key={r.id} className="text-sm" style={{ color: 'var(--color-text)' }}>
                  <span className="font-semibold">{names[r.player_id] ?? 'Unknown player'}</span>
                  {!r.is_admin_override && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {' · '}{r.vote_count} vote{r.vote_count === 1 ? '' : 's'}
                    </span>
                  )}
                </p>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function HistoryPage() {
  const [records, setRecords] = useState<MatchRecord[]>([])
  const [awardNames, setAwardNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'completed')
        .order('match_date', { ascending: false })

      if (!matches || matches.length === 0) { setLoading(false); return }

      const matchIds = (matches as Match[]).map(m => m.id)

      const [{ data: results }, { data: teams }, { data: fixtures }, { data: awards }, { data: goals }] = await Promise.all([
        supabase.from('results').select('*').in('match_id', matchIds).eq('status', 'published'),
        supabase.from('teams').select('*').in('match_id', matchIds),
        supabase.from('fixtures').select('*').in('match_id', matchIds),
        supabase.from('award_results').select('*').in('match_id', matchIds),
        supabase
          .from('goals')
          .select('fixture_id, team_id, match_id, goals_count, own_goal, profiles:player_id(name, surname)')
          .in('match_id', matchIds),
      ])

      // Historical lineups — one fetch batch for all matches. Eager-loaded so
      // expanding a match card is instant (no per-tap N+1 query).
      const teamIds = ((teams as Team[]) ?? []).map(t => t.id)
      const [{ data: tpRows }, { data: formRows }] = await Promise.all([
        teamIds.length > 0
          ? supabase.from('team_players').select('team_id, player_id').in('team_id', teamIds)
          : Promise.resolve({ data: [] as { team_id: string; player_id: string }[] }),
        teamIds.length > 0
          ? supabase.from('team_formations').select('team_id, shape').in('team_id', teamIds)
          : Promise.resolve({ data: [] as { team_id: string; shape: string }[] }),
      ])
      const playerIds = [...new Set((tpRows ?? []).map(r => r.player_id))]
      const [{ data: playerProfs }, { data: histRows }] = await Promise.all([
        playerIds.length > 0
          ? supabase.from('profiles').select('id, name, surname').in('id', playerIds)
          : Promise.resolve({ data: [] as { id: string; name: string; surname: string | null }[] }),
        playerIds.length > 0
          ? supabase.from('v_player_match_history').select('player_id, first_match_date').in('player_id', playerIds)
          : Promise.resolve({ data: [] as { player_id: string; first_match_date: string | null }[] }),
      ])
      const playerNames: Record<string, { name: string; surname: string | null }> = {}
      for (const p of (playerProfs ?? []) as { id: string; name: string; surname: string | null }[]) {
        playerNames[p.id] = { name: p.name, surname: p.surname }
      }
      // A player is a debutant for match X if their first_match_date equals X's date.
      const firstMatchByPlayer: Record<string, string | null> = {}
      for (const h of (histRows ?? []) as { player_id: string; first_match_date: string | null }[]) {
        firstMatchByPlayer[h.player_id] = h.first_match_date
      }
      const playersByTeam: Record<string, string[]> = {}
      for (const tp of (tpRows ?? []) as { team_id: string; player_id: string }[]) {
        (playersByTeam[tp.team_id] ??= []).push(tp.player_id)
      }
      const shapeByTeam: Record<string, string> = {}
      for (const f of (formRows ?? []) as { team_id: string; shape: string }[]) {
        shapeByTeam[f.team_id] = f.shape
      }

      const awardList = (awards as AwardResult[]) || []
      const awardPlayerIds = [...new Set(awardList.map(a => a.player_id))]
      if (awardPlayerIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles').select('id, name, surname').in('id', awardPlayerIds)
        const nameMap: Record<string, string> = {}
        for (const p of (profs as { id: string; name: string; surname: string }[]) || []) {
          nameMap[p.id] = `${p.name} ${p.surname}`
        }
        setAwardNames(nameMap)
      }

      const teamMap: Record<string, Team> = {}
      for (const t of (teams as Team[]) || []) teamMap[t.id] = t

      // Index goals by match_id then fixture_id so MatchResultView can render
      // per-fixture scorers. Skip rows that can't be tied back to a fixture or
      // a known player profile.
      type GoalRow = {
        fixture_id: string | null
        team_id: string | null
        match_id: string | null
        goals_count: number
        own_goal: boolean
        profiles: { name: string; surname: string } | null
      }
      const goalsByMatch: Record<string, Record<string, FixtureScorer[]>> = {}
      for (const g of ((goals as unknown as GoalRow[]) || [])) {
        if (!g.fixture_id || !g.team_id || !g.match_id || !g.profiles) continue
        const byFixture = (goalsByMatch[g.match_id] ??= {})
        const list = (byFixture[g.fixture_id] ??= [])
        list.push({
          player_name: `${g.profiles.name} ${g.profiles.surname}`,
          team_id: g.team_id,
          goals_count: g.goals_count,
          own_goal: g.own_goal,
        })
      }

      const enrichedRecords: MatchRecord[] = (matches as Match[]).map(m => {
        const matchTeams = (teams as Team[] || []).filter(t => t.match_id === m.id)
        // Drop orphaned fixtures whose teams didn't load (mirrors loadMatchData).
        const matchFixtures = (fixtures as Fixture[] || [])
          .filter(f => f.match_id === m.id && teamMap[f.team1_id] && teamMap[f.team2_id])
          .map(f => ({ ...f, team1: teamMap[f.team1_id], team2: teamMap[f.team2_id] }))
        const matchResult = (results as Result[] || []).find(r => r.match_id === m.id) ?? null
        const matchAwards = awardList.filter(a => a.match_id === m.id)
        const scorersByFixture = goalsByMatch[m.id] ?? {}
        // Per-team lineups. Roster sorted alphabetically to match TeamsPage.
        const lineups: TeamLineup[] = matchTeams.map(team => {
          const ids = playersByTeam[team.id] ?? []
          const players = ids
            .map(pid => ({
              id: pid,
              name: playerNames[pid]?.name ?? 'Unknown',
              surname: playerNames[pid]?.surname ?? null,
              isCaptain: pid === team.captain_id,
              isDebut: firstMatchByPlayer[pid] === m.match_date,
            }))
            .sort((a, b) =>
              `${a.name} ${a.surname ?? ''}`.localeCompare(
                `${b.name} ${b.surname ?? ''}`,
                undefined, { sensitivity: 'base' }
              )
            )
          return { team, players, shape: shapeByTeam[team.id] ?? null }
        })
        return { match: m, result: matchResult, teams: matchTeams, fixtures: matchFixtures, scorersByFixture, awards: matchAwards, lineups }
      })

      setRecords(enrichedRecords)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading history...</div>
  }

  return (
    <div className="px-5 py-5">
      <CeefaxHeader
        pageId="P401 · ARCHIVE"
        title="HISTORY"
        meta={records.length > 0 ? `${records.length} MATCH${records.length === 1 ? '' : 'ES'} ON RECORD` : undefined}
      />

      {records.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
          <p className="text-4xl mb-3">📅</p>
          <p className="font-medium text-[var(--color-text)]">No matches played yet</p>
        </div>
      ) : (
        <div className="space-y-5">
          {records.map(({ match, result, teams, fixtures, scorersByFixture, awards, lineups }, recordIdx) => {
            const isExpanded = expanded === match.id
            const dateLabel = format(new Date(match.match_date + 'T12:00:00'), 'do MMM yyyy').toUpperCase()
            const weekNum = records.length - recordIdx
            const pageId = `P${400 + weekNum} · WK${weekNum}`
            const isTwoTeam = teams.length <= 2 && match.format !== 'tournament' && match.format !== '4-team'
            const mainFixture = isTwoTeam ? fixtures[0] : null

            return (
              <div key={match.id}>
                <div className="mb-1.5 px-2 flex items-baseline gap-2">
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--tt-cyan)', fontSize: 11, letterSpacing: '0.08em' }}>
                    {pageId}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>
                    {dateLabel}
                  </span>
                </div>
                <div className="rounded-2xl"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', backgroundClip: 'padding-box' }}>
                  <button
                    className="w-full px-5 py-4 text-left"
                    onClick={() => setExpanded(isExpanded ? null : match.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        {isTwoTeam && mainFixture ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-[var(--color-text)] text-sm truncate min-w-0">{stripFC(mainFixture.team1?.name)}</span>
                            <span className="font-display text-xl shrink-0 whitespace-nowrap" style={{ color: 'var(--color-accent)' }}>
                              {mainFixture.score1} – {mainFixture.score2}
                            </span>
                            <span className="font-semibold text-[var(--color-text)] text-sm truncate min-w-0">{stripFC(mainFixture.team2?.name)}</span>
                          </div>
                        ) : (
                          <p className="font-semibold text-[var(--color-text)] text-sm truncate">
                            4-Team Tournament · {teams.length} teams
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs px-2 py-1 rounded-md font-medium"
                          style={{
                            background: isTwoTeam ? 'var(--color-success-bg)' : 'var(--color-surface-2)',
                            color: isTwoTeam ? 'var(--color-success-text)' : 'var(--color-text-muted)',
                            border: `1px solid ${isTwoTeam ? 'var(--color-success-text)' : 'var(--color-border)'}`,
                          }}>
                          {match.format}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-4 space-y-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <MatchResultView
                        match={match}
                        result={result}
                        teams={teams}
                        fixtures={fixtures}
                        scorersByFixture={scorersByFixture}
                      />

                      {/* Historical lineups — collapsed by default */}
                      <MatchLineups lineups={lineups} />

                      {awards.length > 0 && (
                        <div className="rounded-2xl px-5 py-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                          <SectionHeader label="Match Awards" withDivider />
                          <MatchAwards awards={awards} names={awardNames} />
                        </div>
                      )}

                      {hasReportContent(result) && result && (
                        <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                          <SectionHeader label="Match Report" withDivider />
                          <MatchReport result={result} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
