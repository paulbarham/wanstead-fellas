import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Match, Result, Team, Fixture, AwardResult, AwardType } from '../types'
import MatchReport from '../components/MatchReport'
import SectionHeader from '../components/SectionHeader'
import { hasReportContent, hasStructuredReport } from '../lib/report'
import CeefaxHeader from '../components/CeefaxHeader'

interface MatchRecord {
  match: Match
  result: Result | null
  teams: Team[]
  fixtures: (Fixture & { team1?: Team; team2?: Team })[]
  awards: AwardResult[]
}

const stripFC = (s?: string) => (s ?? '').replace(/\s+(FC|XI)$/, '')

const AWARD_META: Record<AwardType, { label: string; icon: string }> = {
  motm: { label: 'Man of the Match', icon: '🏆' },
  dotd: { label: 'Dick of the Day', icon: '🤡' },
}

function MatchAwards({ awards, names }: { awards: AwardResult[]; names: Record<string, string> }) {
  const types: AwardType[] = ['motm', 'dotd']
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

export default function HistoryPage() {
  const [records, setRecords] = useState<MatchRecord[]>([])
  const [awardNames, setAwardNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set())

  function toggleReport(matchId: string, e: React.MouseEvent) {
    e.stopPropagation()
    setExpandedReports(prev => {
      const next = new Set(prev)
      next.has(matchId) ? next.delete(matchId) : next.add(matchId)
      return next
    })
  }

  useEffect(() => {
    async function load() {
      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'completed')
        .order('match_date', { ascending: false })

      if (!matches || matches.length === 0) { setLoading(false); return }

      const matchIds = (matches as Match[]).map(m => m.id)

      const [{ data: results }, { data: teams }, { data: fixtures }, { data: awards }] = await Promise.all([
        supabase.from('results').select('*').in('match_id', matchIds),
        supabase.from('teams').select('*').in('match_id', matchIds),
        supabase.from('fixtures').select('*').in('match_id', matchIds),
        supabase.from('award_results').select('*').in('match_id', matchIds),
      ])

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

      const enrichedRecords: MatchRecord[] = (matches as Match[]).map(m => {
        const matchTeams = (teams as Team[] || []).filter(t => t.match_id === m.id)
        const matchFixtures = (fixtures as Fixture[] || [])
          .filter(f => f.match_id === m.id)
          .map(f => ({ ...f, team1: teamMap[f.team1_id], team2: teamMap[f.team2_id] }))
        const matchResult = (results as Result[] || []).find(r => r.match_id === m.id) ?? null
        const matchAwards = awardList.filter(a => a.match_id === m.id)
        return { match: m, result: matchResult, teams: matchTeams, fixtures: matchFixtures, awards: matchAwards }
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
          {records.map(({ match, result, teams, fixtures, awards }, recordIdx) => {
            const isExpanded = expanded === match.id
            const isReportExpanded = expandedReports.has(match.id)
            const dateLabel = format(new Date(match.match_date + 'T12:00:00'), 'do MMM yyyy').toUpperCase()
            const weekNum = records.length - recordIdx
            const pageId = `P${400 + weekNum} · WK${weekNum}`
            const isTwoTeam = teams.length <= 2 && match.format !== 'tournament' && match.format !== '4-team'
            const mainFixture = isTwoTeam ? fixtures[0] : null
            const reportText = result?.report_text ?? null
            const structuredReport = hasStructuredReport(result)
            const reportIsLong = !structuredReport && reportText && reportText.length > 200

            return (
              <div key={match.id}>
                <div className="mb-1.5 px-2 flex items-baseline gap-2">
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--tt-cyan)',
                      fontSize: 11,
                      letterSpacing: '0.08em',
                    }}
                  >
                    {pageId}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-text)',
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {dateLabel}
                  </span>
                </div>
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <button
                  className="w-full px-5 py-4 text-left"
                  onClick={() => setExpanded(isExpanded ? null : match.id)}
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
                  <div style={{ borderTop: '1px solid var(--color-border)' }}>
                    {result?.scorers && (
                      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <SectionHeader label="Scorers" withDivider />
                        <ScorersList scorers={result.scorers} />
                      </div>
                    )}

                    {!isTwoTeam && fixtures.length > 0 && (
                      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <SectionHeader label="Results" withDivider />
                        <div className="space-y-1.5">
                          {fixtures.map(f => (
                            <div key={f.id} className="flex items-center gap-3 text-xs">
                              <span className="flex-1 text-right font-medium text-[var(--color-text)]">{stripFC(f.team1?.name)}</span>
                              <span className="font-display text-base tabular-nums" style={{ color: 'var(--color-accent)' }}>
                                {f.score1} – {f.score2}
                              </span>
                              <span className="flex-1 font-medium text-[var(--color-text)]">{stripFC(f.team2?.name)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {awards.length > 0 && (
                      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <SectionHeader label="Match Awards" withDivider />
                        <MatchAwards awards={awards} names={awardNames} />
                      </div>
                    )}

                    {hasReportContent(result) && result && (
                      <div className="px-5 py-4">
                        <SectionHeader label="Match Report" withDivider />
                        {structuredReport ? (
                          <MatchReport result={result} />
                        ) : (
                          <div
                            style={{
                              fontSize: '14px',
                              lineHeight: '1.6',
                              color: 'var(--color-text-muted)',
                              whiteSpace: 'pre-wrap',
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitBoxOrient: 'vertical',
                              WebkitLineClamp: isReportExpanded ? 'unset' : 3,
                            } as React.CSSProperties}
                          >
                            {reportText}
                          </div>
                        )}
                        {reportIsLong && (
                          <button
                            onClick={(e) => toggleReport(match.id, e)}
                            className="text-xs mt-2 font-semibold"
                            style={{ color: 'var(--color-accent)' }}
                          >
                            {isReportExpanded ? 'Read less ▲' : 'Read more ▼'}
                          </button>
                        )}
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
