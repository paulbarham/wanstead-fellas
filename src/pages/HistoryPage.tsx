import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Match, Result, Team, Fixture } from '../types'

interface MatchRecord {
  match: Match
  result: Result | null
  teams: Team[]
  fixtures: (Fixture & { team1?: Team; team2?: Team })[]
}

const LABEL_STYLE = { color: '#647060', letterSpacing: '0.8px' } as const
const LABEL_CLASS = 'text-[10px] font-semibold uppercase'

function ScorersList({ scorers }: { scorers: string }) {
  const lines = scorers.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length <= 1 && !scorers.includes(':')) {
    return <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#18201A' }}>{scorers}</p>
  }
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
          return (
            <div key={i}>
              <p className={LABEL_CLASS} style={{ ...LABEL_STYLE, marginBottom: 2 }}>
                {line.slice(0, colonIdx).trim()}
              </p>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#18201A' }}>
                {line.slice(colonIdx + 1).trim()}
              </p>
            </div>
          )
        }
        return <p key={i} style={{ fontSize: '14px', lineHeight: '1.5', color: '#18201A' }}>{line}</p>
      })}
    </div>
  )
}

export default function HistoryPage() {
  const [records, setRecords] = useState<MatchRecord[]>([])
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

      const [{ data: results }, { data: teams }, { data: fixtures }] = await Promise.all([
        supabase.from('results').select('*').in('match_id', matchIds),
        supabase.from('teams').select('*').in('match_id', matchIds),
        supabase.from('fixtures').select('*').in('match_id', matchIds),
      ])

      const teamMap: Record<string, Team> = {}
      for (const t of (teams as Team[]) || []) teamMap[t.id] = t

      const enrichedRecords: MatchRecord[] = (matches as Match[]).map(m => {
        const matchTeams = (teams as Team[] || []).filter(t => t.match_id === m.id)
        const matchFixtures = (fixtures as Fixture[] || [])
          .filter(f => f.match_id === m.id)
          .map(f => ({ ...f, team1: teamMap[f.team1_id], team2: teamMap[f.team2_id] }))
        const matchResult = (results as Result[] || []).find(r => r.match_id === m.id) ?? null
        return { match: m, result: matchResult, teams: matchTeams, fixtures: matchFixtures }
      })

      setRecords(enrichedRecords)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: '#647060' }}>Loading history...</div>
  }

  return (
    <div className="px-4 py-5">
      <p className={LABEL_CLASS + ' mb-1'} style={LABEL_STYLE}>Archive</p>
      <h1 className="font-display text-[#18201A] tracking-wide mb-5" style={{ fontSize: '28px' }}>HISTORY</h1>

      {records.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#9CA897' }}>
          <p className="text-4xl mb-3">📅</p>
          <p className="font-medium text-[#18201A]">No matches played yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map(({ match, result, teams, fixtures }) => {
            const isExpanded = expanded === match.id
            const isReportExpanded = expandedReports.has(match.id)
            const dateLabel = format(new Date(match.match_date + 'T12:00:00'), 'EEE do MMM yyyy')
            const isTwoTeam = match.format !== 'tournament' && match.format !== '4-team'
            const mainFixture = isTwoTeam ? fixtures[0] : null
            const reportText = result?.report_text ?? null
            const reportIsLong = reportText && reportText.length > 200

            return (
              <div key={match.id} className="rounded-2xl overflow-hidden"
                style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
                <button
                  className="w-full px-4 py-4 text-left"
                  onClick={() => setExpanded(isExpanded ? null : match.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs mb-1" style={{ color: '#647060' }}>{dateLabel}</p>
                      {isTwoTeam && mainFixture ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#18201A] text-sm">{mainFixture.team1?.name}</span>
                          <span className="font-display text-xl" style={{ color: '#0D6B52' }}>
                            {mainFixture.score1} – {mainFixture.score2}
                          </span>
                          <span className="font-semibold text-[#18201A] text-sm">{mainFixture.team2?.name}</span>
                        </div>
                      ) : (
                        <p className="font-semibold text-[#18201A] text-sm">
                          4-Team Tournament · {teams.length} teams
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-md font-medium"
                        style={{
                          background: isTwoTeam ? '#DCFCE7' : '#F7F8F5',
                          color: isTwoTeam ? '#0D6B52' : '#647060',
                          border: `1px solid ${isTwoTeam ? '#86EFAC' : '#E2E4DC'}`,
                        }}>
                        {match.format}
                      </span>
                      <span className="text-xs" style={{ color: '#9CA897' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid #E2E4DC' }}>
                    {result?.scorers && (
                      <div className="px-4 py-4" style={{ borderBottom: '1px solid #F2F3EE' }}>
                        <p className={LABEL_CLASS + ' mb-3'} style={LABEL_STYLE}>Scorers</p>
                        <ScorersList scorers={result.scorers} />
                      </div>
                    )}

                    {!isTwoTeam && fixtures.length > 0 && (
                      <div className="px-4 py-4" style={{ borderBottom: '1px solid #F2F3EE' }}>
                        <p className={LABEL_CLASS + ' mb-2'} style={LABEL_STYLE}>Results</p>
                        <div className="space-y-1.5">
                          {fixtures.map(f => (
                            <div key={f.id} className="flex items-center gap-3 text-xs">
                              <span className="flex-1 text-right font-medium text-[#18201A]">{f.team1?.name}</span>
                              <span className="font-display text-base tabular-nums" style={{ color: '#0D6B52' }}>
                                {f.score1} – {f.score2}
                              </span>
                              <span className="flex-1 font-medium text-[#18201A]">{f.team2?.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {reportText && (
                      <div className="px-4 py-4">
                        <p className={LABEL_CLASS + ' mb-2'} style={LABEL_STYLE}>Report</p>
                        <p
                          style={{
                            fontSize: '14px',
                            lineHeight: '1.6',
                            color: '#647060',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: isReportExpanded ? 'unset' : 3,
                          } as React.CSSProperties}
                        >
                          {reportText}
                        </p>
                        {reportIsLong && (
                          <button
                            onClick={(e) => toggleReport(match.id, e)}
                            className="text-xs mt-2 font-semibold"
                            style={{ color: '#0D6B52' }}
                          >
                            {isReportExpanded ? 'Read less ▲' : 'Read more ▼'}
                          </button>
                        )}
                        {result?.highlights && (
                          <p className="text-xs mt-2 font-medium" style={{ color: '#0D6B52' }}>{result.highlights}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
