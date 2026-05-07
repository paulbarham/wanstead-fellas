import { useState } from 'react'
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
  const [copied, setCopied] = useState(false)

  const table = buildTable(teams, fixtures)

  async function updateFixtureScore(fixtureId: string, field: 'score1' | 'score2', value: string) {
    const num = value === '' ? null : parseInt(value)
    await supabase.from('fixtures').update({ [field]: num }).eq('id', fixtureId)
    setFixtures(prev => prev.map(f => f.id === fixtureId ? { ...f, [field]: num } : f))
  }

  async function saveResult() {
    if (!match?.id) return
    setSaving(true)
    const payload = { match_id: match.id, report_text: reportText, scorers, highlights }
    if (initialResult?.id) {
      await supabase.from('results').update(payload).eq('id', initialResult.id)
    } else {
      await supabase.from('results').insert(payload)
    }
    await supabase.from('matches').update({ status: 'completed' }).eq('id', match.id)
    setSaving(false)
    onSaved()
  }

  async function generateFixtures() {
    if (!match?.id || teams.length < 2) return
    // Generate round-robin fixtures
    const teamList = [...teams]
    const pairs: { t1: Team; t2: Team }[] = []
    for (let i = 0; i < teamList.length; i++) {
      for (let j = i + 1; j < teamList.length; j++) {
        pairs.push({ t1: teamList[i], t2: teamList[j] })
      }
    }
    for (const pair of pairs) {
      const exists = fixtures.find(f =>
        (f.team1_id === pair.t1.id && f.team2_id === pair.t2.id) ||
        (f.team1_id === pair.t2.id && f.team2_id === pair.t1.id)
      )
      if (!exists) {
        await supabase.from('fixtures').insert({
          match_id: match.id,
          team1_id: pair.t1.id,
          team2_id: pair.t2.id,
        })
      }
    }
    onSaved()
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
        <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: '#0D6B52' }}>Admin</p>
        <h1 className="font-display text-3xl text-[#18201A] tracking-wide mb-5">MATCH ENTRY</h1>
        <div className="text-center py-8" style={{ color: '#9CA897' }}>
          <p>No teams published yet</p>
          <p className="text-sm mt-1">Publish teams first from the Teams tab</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-5">
      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: '#0D6B52' }}>Admin</p>
      <h1 className="font-display text-3xl text-[#18201A] tracking-wide mb-5">MATCH ENTRY</h1>

      {isElevenVEleven ? (
        // 11v11
        <div className="space-y-4">
          {fixtures.length > 0 ? (
            <div className="p-4 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
              <h3 className="font-semibold text-[#18201A] mb-3">Score</h3>
              {fixtures.map(f => (
                <div key={f.id} className="flex items-center gap-3">
                  <span className="flex-1 text-right text-sm font-medium text-[#18201A]">{f.team1?.name}</span>
                  <input
                    type="number"
                    min={0}
                    value={f.score1 ?? ''}
                    onChange={e => updateFixtureScore(f.id, 'score1', e.target.value)}
                    className="w-12 text-center py-2 rounded-lg text-[#18201A] font-display text-xl outline-none"
                    style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
                  />
                  <span style={{ color: '#9CA897' }}>–</span>
                  <input
                    type="number"
                    min={0}
                    value={f.score2 ?? ''}
                    onChange={e => updateFixtureScore(f.id, 'score2', e.target.value)}
                    className="w-12 text-center py-2 rounded-lg text-[#18201A] font-display text-xl outline-none"
                    style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
                  />
                  <span className="flex-1 text-sm font-medium text-[#18201A]">{f.team2?.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <button
              onClick={generateFixtures}
              className="w-full py-3 rounded-xl text-sm font-medium"
              style={{ background: '#FFFFFF', color: '#647060', border: '1px solid #E2E4DC' }}
            >
              Generate Fixture
            </button>
          )}

          <div className="p-4 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#647060' }}>Scorers</label>
            <input
              type="text"
              value={scorers}
              onChange={e => setScorers(e.target.value)}
              placeholder="Barham 2, Smith, Jones..."
              className="w-full px-3 py-2 rounded-lg text-[#18201A] text-sm outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
            />
          </div>

          <div className="p-4 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#647060' }}>Match Report</label>
            <textarea
              value={reportText}
              onChange={e => setReportText(e.target.value)}
              rows={5}
              placeholder="Write the match report here..."
              className="w-full px-3 py-2 rounded-lg text-[#18201A] text-sm outline-none resize-none"
              style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
            />
          </div>

          <div className="p-4 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#647060' }}>Highlights</label>
            <input
              type="text"
              value={highlights}
              onChange={e => setHighlights(e.target.value)}
              placeholder="Link or notes..."
              className="w-full px-3 py-2 rounded-lg text-[#18201A] text-sm outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
            />
          </div>
        </div>
      ) : (
        // 4-team tournament
        <div className="space-y-4">
          {fixtures.length === 0 && (
            <button
              onClick={generateFixtures}
              className="w-full py-3 rounded-xl text-sm font-medium"
              style={{ background: '#0D6B52', color: '#18201A' }}
            >
              Generate Round-Robin Fixtures
            </button>
          )}

          {/* Live table */}
          {fixtures.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: '#E2E4DC' }}>
                <h3 className="font-semibold text-[#18201A] text-sm">Live Table</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: '#647060' }}>
                    <th className="px-4 py-2 text-left">Team</th>
                    <th className="px-2 py-2">P</th>
                    <th className="px-2 py-2">GD</th>
                    <th className="px-2 py-2 font-bold text-[#18201A]">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row, i) => (
                    <tr key={row.team.id} style={{ borderTop: '1px solid #E2E4DC' }}>
                      <td className="px-4 py-2 font-medium text-[#18201A]">
                        <span className="mr-2 text-xs" style={{ color: '#647060' }}>{i + 1}</span>
                        {row.team.name}
                      </td>
                      <td className="px-2 py-2 text-center" style={{ color: '#647060' }}>{row.played}</td>
                      <td className="px-2 py-2 text-center" style={{ color: '#647060' }}>{row.gf - row.ga}</td>
                      <td className="px-2 py-2 text-center font-bold text-[#18201A]">{row.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Fixtures */}
          {fixtures.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: '#E2E4DC' }}>
                <h3 className="font-semibold text-[#18201A] text-sm">Enter Scores</h3>
              </div>
              <div className="divide-y" style={{ borderColor: '#E2E4DC' }}>
                {fixtures.map(f => (
                  <div key={f.id} className="px-4 py-3 flex items-center gap-2">
                    <span className="flex-1 text-xs text-right font-medium text-[#18201A]">{f.team1?.name}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={f.score1 ?? ''}
                        onChange={e => updateFixtureScore(f.id, 'score1', e.target.value)}
                        className="w-10 text-center py-1.5 rounded-lg text-[#18201A] font-display text-lg outline-none"
                        style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
                      />
                      <span className="text-xs" style={{ color: '#9CA897' }}>v</span>
                      <input
                        type="number"
                        min={0}
                        value={f.score2 ?? ''}
                        onChange={e => updateFixtureScore(f.id, 'score2', e.target.value)}
                        className="w-10 text-center py-1.5 rounded-lg text-[#18201A] font-display text-lg outline-none"
                        style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
                      />
                    </div>
                    <span className="flex-1 text-xs font-medium text-[#18201A]">{f.team2?.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 space-y-2">
        <button
          onClick={saveResult}
          disabled={saving}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
          style={{ background: '#0D6B52', color: '#18201A' }}
        >
          {saving ? 'Saving...' : 'Save Result'}
        </button>

        <button
          onClick={copyToClipboard}
          className="w-full py-3 rounded-xl font-medium text-sm"
          style={{ background: '#FFFFFF', color: copied ? '#0D6B52' : '#ccc', border: '1px solid #E2E4DC' }}
        >
          {copied ? '✓ Copied!' : 'Copy to Clipboard'}
        </button>
      </div>
    </div>
  )
}
