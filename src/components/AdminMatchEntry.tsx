import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Match, Team, Fixture, Result } from '../types'

interface FixtureWithTeams extends Fixture {
  team1: Team
  team2: Team
}

interface Props {
  match: Match | null
  nextThursday: string
  teams: Team[]
  fixtures: FixtureWithTeams[]
  result: Result | null
  onSaved: () => void
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
    if (f.score1 > f.score2) { t1.won++; t1.pts += 3; t2.lost++ }
    else if (f.score1 < f.score2) { t2.won++; t2.pts += 3; t1.lost++ }
    else { t1.drawn++; t1.pts++; t2.drawn++; t2.pts++ }
  }
  return Object.values(rows).sort((a, b) => b.pts !== a.pts ? b.pts - a.pts : (b.gf - b.ga) - (a.gf - a.ga))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function AdminMatchEntry({ match, nextThursday: _nextThursday, teams, fixtures: initialFixtures, result: initialResult, onSaved }: Props) {
  const isElevenVEleven = match?.format === '11v11' || teams.length <= 2
  const [fixtures, setFixtures] = useState<FixtureWithTeams[]>(initialFixtures)
  const [reportText, setReportText] = useState(initialResult?.report_text ?? '')
  const [scorers, setScorers] = useState(initialResult?.scorers ?? '')
  const [highlights, setHighlights] = useState(initialResult?.highlights ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [fixturesError, setFixturesError] = useState<string | null>(null)
  const [regenConfirm, setRegenConfirm] = useState(false)
  const generatingRef = useRef(false)

  const table = buildTable(teams, fixtures)

  async function updateFixtureScore(fixtureId: string, field: 'score1' | 'score2', value: string) {
    const num = value === '' ? null : parseInt(value)
    const prevFixture = fixtures.find(f => f.id === fixtureId)
    setFixtures(prev => prev.map(f => f.id === fixtureId ? { ...f, [field]: num } : f))
    setScoreError(null)
    const { error } = await supabase.from('fixtures').update({ [field]: num }).eq('id', fixtureId)
    if (error) {
      console.error('Score update failed:', error)
      setScoreError(`Score not saved: ${error.message}`)
      if (prevFixture) {
        setFixtures(prev => prev.map(f => f.id === fixtureId ? { ...f, [field]: prevFixture[field] } : f))
      }
    }
  }

  async function saveResult() {
    if (!match?.id) return
    setSaving(true)
    setSaveError(null)
    try {
      const payload = { match_id: match.id, report_text: reportText, scorers, highlights }
      if (initialResult?.id) {
        const { error } = await supabase.from('results').update(payload).eq('id', initialResult.id)
        if (error) throw new Error(`Couldn't update result: ${error.message}`)
      } else {
        const { error } = await supabase.from('results').insert(payload)
        if (error) throw new Error(`Couldn't save result: ${error.message}`)
      }
      const { error: matchErr } = await supabase.from('matches').update({ status: 'completed' }).eq('id', match.id)
      if (matchErr) throw new Error(`Couldn't mark match completed: ${matchErr.message}`)
      onSaved()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Save result failed:', e)
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  function roundRobinRows(matchId: string): { match_id: string; team1_id: string; team2_id: string }[] {
    const rows: { match_id: string; team1_id: string; team2_id: string }[] = []
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        rows.push({ match_id: matchId, team1_id: teams[i].id, team2_id: teams[j].id })
      }
    }
    return rows
  }

  async function generateFixtures() {
    if (!match?.id || teams.length < 2) return
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    setFixturesError(null)

    try {
      const { data: existing, error: checkErr } = await supabase
        .from('fixtures')
        .select('id')
        .eq('match_id', match.id)
        .limit(1)
      if (checkErr) throw checkErr
      if (existing && existing.length > 0) {
        setFixturesError('Fixtures already generated for this match — use Regenerate to replace.')
        return
      }

      const { error: insertErr } = await supabase.from('fixtures').insert(roundRobinRows(match.id))
      if (insertErr) {
        if (insertErr.code === '23505') {
          setFixturesError('Fixtures already generated for this match — use Regenerate to replace.')
        } else {
          setFixturesError(`Couldn't generate fixtures: ${insertErr.message}`)
        }
        return
      }
      onSaved()
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  async function regenerateFixtures() {
    if (!match?.id || teams.length < 2) return
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    setFixturesError(null)
    setRegenConfirm(false)

    try {
      const { error: delErr } = await supabase.from('fixtures').delete().eq('match_id', match.id)
      if (delErr) {
        setFixturesError(`Couldn't clear existing fixtures: ${delErr.message}`)
        return
      }
      const { error: insertErr } = await supabase.from('fixtures').insert(roundRobinRows(match.id))
      if (insertErr) {
        setFixturesError(`Couldn't regenerate fixtures: ${insertErr.message}`)
        return
      }
      onSaved()
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  function copyToClipboard() {
    let text = isElevenVEleven ? formatElevenReport() : formatFourTeamReport()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatElevenReport(): string {
    const main = fixtures[0]
    const score = main ? `${main.score1 ?? '?'} - ${main.score2 ?? '?'}` : ''
    const lines = [
      `⚽ WF Match Report`,
      `${main?.team1?.name ?? ''} ${score} ${main?.team2?.name ?? ''}`,
      scorers ? `\nScorers: ${scorers}` : '',
      reportText ? `\n${reportText}` : '',
    ]
    return lines.filter(Boolean).join('\n')
  }

  function formatFourTeamReport(): string {
    const lines = ['⚽ WF Tournament Results\n']
    lines.push('📋 Group Table')
    table.forEach((row, i) => {
      lines.push(`${i + 1}. ${row.team.name} — ${row.pts}pts (${row.won}W ${row.drawn}D ${row.lost}L)`)
    })
    lines.push('\n🏟️ Results')
    fixtures.forEach(f => {
      if (f.score1 != null && f.score2 != null) {
        lines.push(`${f.team1?.name} ${f.score1} - ${f.score2} ${f.team2?.name}`)
      }
    })
    return lines.join('\n')
  }

  if (teams.length === 0) {
    return (
      <div className="px-4 py-5">
        <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--color-primary)' }}>Admin</p>
        <h1 className="font-display text-3xl text-[var(--color-text)] tracking-wide mb-5">MATCH ENTRY</h1>
        <div className="text-center py-8" style={{ color: '#9CA897' }}>
          <p>No teams published yet</p>
          <p className="text-sm mt-1">Publish teams first from the Teams tab</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-5">
      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--color-primary)' }}>Admin</p>
      <h1 className="font-display text-3xl text-[var(--color-text)] tracking-wide mb-5">MATCH ENTRY</h1>

      {isElevenVEleven ? (
        // 11v11
        <div className="space-y-4">
          {fixtures.length > 0 ? (
            <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold text-[var(--color-text)] mb-3">Score</h3>
              {fixtures.map(f => (
                <div key={f.id} className="flex items-center gap-3">
                  <span className="flex-1 text-right text-sm font-medium text-[var(--color-text)]">{f.team1?.name}</span>
                  <input
                    type="number"
                    min={0}
                    value={f.score1 ?? ''}
                    onChange={e => updateFixtureScore(f.id, 'score1', e.target.value)}
                    className="w-12 text-center py-2 rounded-lg text-[var(--color-text)] font-display text-xl outline-none"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  />
                  <span style={{ color: '#9CA897' }}>–</span>
                  <input
                    type="number"
                    min={0}
                    value={f.score2 ?? ''}
                    onChange={e => updateFixtureScore(f.id, 'score2', e.target.value)}
                    className="w-12 text-center py-2 rounded-lg text-[var(--color-text)] font-display text-xl outline-none"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  />
                  <span className="flex-1 text-sm font-medium text-[var(--color-text)]">{f.team2?.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <button
              onClick={generateFixtures}
              disabled={generating}
              className="w-full py-3 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              {generating ? 'Generating…' : 'Generate Fixture'}
            </button>
          )}

          <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>Scorers</label>
            <input
              type="text"
              value={scorers}
              onChange={e => setScorers(e.target.value)}
              placeholder="Barham 2, Smith, Jones..."
              className="w-full px-3 py-2 rounded-lg text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            />
          </div>

          <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>Match Report</label>
            <textarea
              value={reportText}
              onChange={e => setReportText(e.target.value)}
              rows={5}
              placeholder="Write the match report here..."
              className="w-full px-3 py-2 rounded-lg text-[var(--color-text)] text-sm outline-none resize-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            />
          </div>

          <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>Highlights</label>
            <input
              type="text"
              value={highlights}
              onChange={e => setHighlights(e.target.value)}
              placeholder="Link or notes..."
              className="w-full px-3 py-2 rounded-lg text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            />
          </div>
        </div>
      ) : (
        // 4-team tournament
        <div className="space-y-4">
          {fixturesError && (
            <div className="px-3 py-2 rounded-xl text-xs font-medium"
              style={{ background: 'var(--color-warning-bg)', color: '#92400e', border: '1px solid #C9A227' }}>
              {fixturesError}
            </div>
          )}

          {fixtures.length === 0 && (
            <button
              onClick={generateFixtures}
              disabled={generating}
              className="w-full py-3 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
            >
              {generating ? 'Generating…' : 'Generate Round-Robin Fixtures'}
            </button>
          )}

          {/* Live table */}
          {fixtures.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h3 className="font-semibold text-[var(--color-text)] text-sm">Live Table</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--color-text-muted)', background: '#F8F9F6', borderBottom: '1px solid var(--color-border)' }}>
                    <th className="py-2 text-center font-medium" style={{ width: 28, paddingLeft: 12 }}>#</th>
                    <th className="py-2 text-left font-medium" style={{ paddingLeft: 8 }}>Team</th>
                    <th className="px-2 py-2 text-center font-medium" style={{ width: 30 }}>P</th>
                    <th className="px-2 py-2 text-center font-medium" style={{ width: 30 }}>W</th>
                    <th className="px-2 py-2 text-center font-medium" style={{ width: 30 }}>D</th>
                    <th className="px-2 py-2 text-center font-medium" style={{ width: 30 }}>L</th>
                    <th className="px-2 py-2 text-center font-medium" style={{ width: 40 }}>GD</th>
                    <th className="px-2 py-2 text-center font-bold" style={{ width: 40, color: 'var(--color-text)' }}>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row, i) => (
                    <tr key={row.team.id} style={{ background: i % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg)' }}>
                      <td className="py-2.5 text-center font-medium" style={{ paddingLeft: 12, color: '#9CA897' }}>{i + 1}</td>
                      <td className="py-2.5 font-medium text-[var(--color-text)]" style={{ paddingLeft: 8 }}>{row.team.name}</td>
                      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.played}</td>
                      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.won}</td>
                      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.drawn}</td>
                      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.lost}</td>
                      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.gf - row.ga >= 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</td>
                      <td className="px-2 py-2.5 text-center font-bold" style={{ color: 'var(--color-text)' }}>{row.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Fixtures */}
          {fixtures.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h3 className="font-semibold text-[var(--color-text)] text-sm">Enter Scores</h3>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {fixtures.map(f => (
                  <div key={f.id} className="px-4 py-4 flex items-center gap-2">
                    <span className="flex-1 text-xs text-right font-medium text-[var(--color-text)]">{f.team1?.name}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={f.score1 ?? ''}
                        onChange={e => updateFixtureScore(f.id, 'score1', e.target.value)}
                        className="w-10 text-center py-1.5 rounded-lg text-[var(--color-text)] font-display text-lg outline-none"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                      />
                      <span style={{ color: '#B0B5AA', fontSize: 11, fontWeight: 500 }}>v</span>
                      <input
                        type="number"
                        min={0}
                        value={f.score2 ?? ''}
                        onChange={e => updateFixtureScore(f.id, 'score2', e.target.value)}
                        className="w-10 text-center py-1.5 rounded-lg text-[var(--color-text)] font-display text-lg outline-none"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <span className="flex-1 text-xs font-medium text-[var(--color-text)]">{f.team2?.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fixtures.length > 0 && (
            regenConfirm ? (
              <div className="px-3 py-3 rounded-xl text-xs space-y-2"
                style={{ background: 'var(--color-warning-bg)', color: '#92400e', border: '1px solid #C9A227' }}>
                <p className="font-medium">Replace existing fixtures? Any scores entered will be lost.</p>
                <div className="flex gap-2">
                  <button
                    onClick={regenerateFixtures}
                    disabled={generating}
                    className="flex-1 py-2 rounded-lg font-semibold text-xs disabled:opacity-50"
                    style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}
                  >
                    {generating ? 'Regenerating…' : 'Yes, replace'}
                  </button>
                  <button
                    onClick={() => setRegenConfirm(false)}
                    disabled={generating}
                    className="flex-1 py-2 rounded-lg text-xs disabled:opacity-50"
                    style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setRegenConfirm(true)}
                disabled={generating}
                className="w-full py-2 rounded-xl text-xs font-medium disabled:opacity-50"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              >
                Regenerate Fixtures
              </button>
            )
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 space-y-2 pb-4">
        {scoreError && (
          <div className="px-3 py-2 rounded-xl text-xs font-medium"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
            ⚠ {scoreError}
          </div>
        )}
        {saveError && (
          <div className="px-3 py-2 rounded-xl text-xs font-medium"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
            ⚠ Result not saved. {saveError}
          </div>
        )}
        <button
          onClick={saveResult}
          disabled={saving}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
        >
          {saving ? 'Saving...' : 'Save Result'}
        </button>

        <button
          onClick={copyToClipboard}
          className="w-full py-3 rounded-xl font-medium text-sm"
          style={{
            background: 'var(--color-surface)',
            color: copied ? 'var(--color-primary)' : 'var(--color-text-muted)',
            border: `1px solid ${copied ? '#0D6B52' : '#8C9688'}`,
          }}
        >
          {copied ? '✓ Copied!' : 'Copy to Clipboard'}
        </button>
      </div>
    </div>
  )
}
