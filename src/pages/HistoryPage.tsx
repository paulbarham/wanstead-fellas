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

export default function HistoryPage() {
  const [records, setRecords] = useState<MatchRecord[]>([])
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
          .map(f => ({
            ...f,
            team1: teamMap[f.team1_id],
            team2: teamMap[f.team2_id],
          }))
        const matchResult = (results as Result[] || []).find(r => r.match_id === m.id) ?? null
        return { match: m, result: matchResult, teams: matchTeams, fixtures: matchFixtures }
      })

      setRecords(enrichedRecords)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: '#888' }}>Loading history...</div>
  }

  return (
    <div className="px-4 py-5">
      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: '#0D6B52' }}>Archive</p>
      <h1 className="font-display text-3xl text-white tracking-wide mb-5">HISTORY</h1>

      {records.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#555' }}>
          <p className="text-4xl mb-3">📅</p>
          <p className="font-medium text-white">No matches played yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(({ match, result, teams, fixtures }) => {
            const isExpanded = expanded === match.id
            const dateLabel = format(new Date(match.match_date + 'T12:00:00'), 'EEE do MMM yyyy')
            const mainFixture = match.format === '11v11' ? fixtures[0] : null

            return (
              <div key={match.id} className="rounded-2xl overflow-hidden"
                style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
                <button
                  className="w-full px-4 py-4 text-left"
                  onClick={() => setExpanded(isExpanded ? null : match.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs mb-1" style={{ color: '#888' }}>{dateLabel}</p>
                      {match.format === '11v11' && mainFixture ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{mainFixture.team1?.name}</span>
                          <span className="font-display text-xl" style={{ color: '#0D6B52' }}>
                            {mainFixture.score1} – {mainFixture.score2}
                          </span>
                          <span className="font-semibold text-white text-sm">{mainFixture.team2?.name}</span>
                        </div>
                      ) : (
                        <p className="font-semibold text-white text-sm">
                          4-Team Tournament · {teams.length} teams
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full"
                        style={{
                          background: match.format === '11v11' ? '#0a1a10' : '#1a0a0a',
                          color: match.format === '11v11' ? '#0D6B52' : '#A0714F',
                        }}>
                        {match.format}
                      </span>
                      <span style={{ color: '#555' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t space-y-3" style={{ borderColor: '#2e2e2e' }}>
                    {result?.scorers && (
                      <div className="pt-3">
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#888' }}>Scorers</p>
                        <p className="text-sm text-white">{result.scorers}</p>
                      </div>
                    )}

                    {match.format !== '11v11' && fixtures.length > 0 && (
                      <div>
                        <p className="text-xs uppercase tracking-widest mb-2 pt-3" style={{ color: '#888' }}>Results</p>
                        <div className="space-y-1">
                          {fixtures.map(f => (
                            <div key={f.id} className="flex items-center gap-2 text-sm">
                              <span className="flex-1 text-right text-white">{f.team1?.name}</span>
                              <span className="font-display text-base" style={{ color: '#0D6B52' }}>
                                {f.score1} – {f.score2}
                              </span>
                              <span className="flex-1 text-white">{f.team2?.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result?.report_text && (
                      <div>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#888' }}>Report</p>
                        <p className="text-sm leading-relaxed" style={{ color: '#ccc' }}>{result.report_text}</p>
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
