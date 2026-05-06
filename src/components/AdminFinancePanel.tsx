import { useEffect, useState, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Profile, Fine, WtpGame, FineType } from '../types'
import { FINE_TYPES } from '../types'
import { getNextThursdayDate } from '../lib/time'

interface PlayerSummary {
  player: Profile
  fines: Fine[]
  wtpGames: WtpGame[]
  wtpOwed: number
  lateOwed: number
  lostBallOwed: number
  cunOwed: number
  dropoutOwed: number
  totalOwed: number
  totalPaid: number
}

function buildSummaries(players: Profile[], fines: Fine[], wtpGames: WtpGame[]): PlayerSummary[] {
  const summaries: PlayerSummary[] = []

  for (const player of players) {
    const pf = fines.filter(f => f.player_id === player.id)
    const pg = wtpGames.filter(g => g.player_id === player.id)
    if (pf.length === 0 && pg.length === 0) continue

    const unpaidFines = pf.filter(f => !f.paid)
    const unpaidGames = pg.filter(g => !g.paid)
    const paidFines = pf.filter(f => f.paid)
    const paidGames = pg.filter(g => g.paid)

    summaries.push({
      player,
      fines: pf,
      wtpGames: pg,
      wtpOwed: unpaidGames.reduce((s, g) => s + Number(g.amount), 0),
      lateOwed: unpaidFines.filter(f => f.type === 'late').reduce((s, f) => s + Number(f.amount), 0),
      lostBallOwed: unpaidFines.filter(f => f.type === 'lost_ball').reduce((s, f) => s + Number(f.amount), 0),
      cunOwed: unpaidFines.filter(f => f.type === 'cuntiness').reduce((s, f) => s + Number(f.amount), 0),
      dropoutOwed: unpaidFines.filter(f => f.type === 'dropout').reduce((s, f) => s + Number(f.amount), 0),
      totalOwed: unpaidFines.reduce((s, f) => s + Number(f.amount), 0) + unpaidGames.reduce((s, g) => s + Number(g.amount), 0),
      totalPaid: paidFines.reduce((s, f) => s + Number(f.amount), 0) + paidGames.reduce((s, g) => s + Number(g.amount), 0),
    })
  }

  return summaries.sort((a, b) => b.totalOwed - a.totalOwed)
}

function exportCsv(summaries: PlayerSummary[], monthLabel: string) {
  const headers = ['Name', 'WTP Games (£)', 'Late (£)', 'Lost Ball (£)', 'Cuntiness (£)', 'Drop Out (£)', 'Total Owed (£)', 'Total Paid (£)', 'Status']
  const lines = [
    headers.join(','),
    ...summaries.map(s => [
      `"${s.player.name} ${s.player.surname}"`,
      s.wtpOwed.toFixed(2),
      s.lateOwed.toFixed(2),
      s.lostBallOwed.toFixed(2),
      s.cunOwed.toFixed(2),
      s.dropoutOwed.toFixed(2),
      s.totalOwed.toFixed(2),
      s.totalPaid.toFixed(2),
      s.totalOwed === 0 ? 'Paid' : 'Outstanding',
    ].join(',')),
  ].join('\n')

  const blob = new Blob([lines], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wf-finance-${monthLabel}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminFinancePanel() {
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()))
  const [players, setPlayers] = useState<Profile[]>([])
  const [fines, setFines] = useState<Fine[]>([])
  const [wtpGames, setWtpGames] = useState<WtpGame[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [markingPaid, setMarkingPaid] = useState<string | null>(null)

  // Fine entry form
  const [showFineForm, setShowFineForm] = useState(false)
  const [finePlayerId, setFinePlayerId] = useState('')
  const [fineType, setFineType] = useState<FineType>('late')
  const [fineDate, setFineDate] = useState(getNextThursdayDate())
  const [fineNotes, setFineNotes] = useState('')
  const [issuingFine, setIssuingFine] = useState(false)

  // WTP game manual entry
  const [showWtpForm, setShowWtpForm] = useState(false)
  const [wtpPlayerId, setWtpPlayerId] = useState('')
  const [wtpDate, setWtpDate] = useState(getNextThursdayDate())
  const [addingWtp, setAddingWtp] = useState(false)

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const monthLabel = format(viewDate, 'yyyy-MM')
  const monthDisplay = format(viewDate, 'MMMM yyyy')

  const loadData = useCallback(async () => {
    setLoading(true)
    const startStr = format(monthStart, 'yyyy-MM-dd')
    const endStr = format(monthEnd, 'yyyy-MM-dd')

    const [{ data: ps }, { data: fs }, { data: gs }] = await Promise.all([
      supabase.from('profiles').select('*').order('surname'),
      supabase.from('fines').select('*').gte('match_date', startStr).lte('match_date', endStr),
      supabase.from('wtp_games').select('*').gte('match_date', startStr).lte('match_date', endStr),
    ])
    setPlayers((ps as Profile[]) || [])
    setFines((fs as Fine[]) || [])
    setWtpGames((gs as WtpGame[]) || [])
    setLoading(false)
  }, [viewDate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData() }, [loadData])

  const summaries = buildSummaries(players, fines, wtpGames)

  const grandTotalOwed = summaries.reduce((s, r) => s + r.totalOwed, 0)
  const grandWtp = summaries.reduce((s, r) => s + r.wtpOwed, 0)
  const grandLate = summaries.reduce((s, r) => s + r.lateOwed, 0)
  const grandLostBall = summaries.reduce((s, r) => s + r.lostBallOwed, 0)
  const grandCun = summaries.reduce((s, r) => s + r.cunOwed, 0)
  const grandDropout = summaries.reduce((s, r) => s + r.dropoutOwed, 0)

  async function markAllPaid(summary: PlayerSummary) {
    setMarkingPaid(summary.player.id)
    const fineIds = summary.fines.filter(f => !f.paid).map(f => f.id)
    const gameIds = summary.wtpGames.filter(g => !g.paid).map(g => g.id)
    await Promise.all([
      fineIds.length > 0 ? supabase.from('fines').update({ paid: true }).in('id', fineIds) : Promise.resolve(),
      gameIds.length > 0 ? supabase.from('wtp_games').update({ paid: true }).in('id', gameIds) : Promise.resolve(),
    ])
    await loadData()
    setMarkingPaid(null)
  }

  async function issueFine() {
    if (!finePlayerId) return
    setIssuingFine(true)
    const ft = FINE_TYPES.find(t => t.value === fineType)!
    await supabase.from('fines').insert({
      player_id: finePlayerId,
      type: fineType,
      amount: ft.amount,
      match_date: fineDate,
      notes: fineNotes || null,
    })
    setFineNotes('')
    setShowFineForm(false)
    setIssuingFine(false)
    await loadData()
  }

  async function addWtpGame() {
    if (!wtpPlayerId) return
    setAddingWtp(true)
    await supabase.from('wtp_games').upsert(
      { player_id: wtpPlayerId, match_date: wtpDate, amount: 5.00 },
      { onConflict: 'player_id,match_date' }
    )
    setShowWtpForm(false)
    setAddingWtp(false)
    await loadData()
  }

  async function deleteWtpGame(id: string) {
    await supabase.from('wtp_games').delete().eq('id', id)
    await loadData()
  }

  async function deleteFine(id: string) {
    await supabase.from('fines').delete().eq('id', id)
    await loadData()
  }

  async function toggleFinePaid(fine: Fine) {
    await supabase.from('fines').update({ paid: !fine.paid }).eq('id', fine.id)
    await loadData()
  }

  async function toggleGamePaid(game: WtpGame) {
    await supabase.from('wtp_games').update({ paid: !game.paid }).eq('id', game.id)
    await loadData()
  }

  const fineLabel = (type: FineType) => FINE_TYPES.find(t => t.value === type)?.label ?? type

  return (
    <div className="space-y-4">
      {/* Month navigator */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => setViewDate(d => subMonths(d, 1))}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm"
          style={{ background: '#141414', border: '1px solid #2e2e2e', color: '#888' }}
        >
          ‹
        </button>
        <span className="font-semibold text-white text-sm">{monthDisplay}</span>
        <button
          onClick={() => setViewDate(d => addMonths(d, 1))}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm"
          style={{ background: '#141414', border: '1px solid #2e2e2e', color: '#888' }}
        >
          ›
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowFineForm(s => !s); setShowWtpForm(false) }}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
          style={{
            background: showFineForm ? '#0D6B52' : '#141414',
            color: showFineForm ? 'white' : '#0D6B52',
            border: '1px solid #0D6B52',
          }}
        >
          + Issue Fine
        </button>
        <button
          onClick={() => { setShowWtpForm(s => !s); setShowFineForm(false) }}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
          style={{
            background: showWtpForm ? '#C9A227' : '#141414',
            color: showWtpForm ? '#000' : '#C9A227',
            border: '1px solid #C9A227',
          }}
        >
          + WTP Game
        </button>
      </div>

      {/* Fine entry form */}
      {showFineForm && (
        <div className="p-4 rounded-2xl space-y-3" style={{ background: '#141414', border: '1px solid #0D6B52' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#0D6B52' }}>Issue Fine</p>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#666' }}>Player</label>
            <select value={finePlayerId} onChange={e => setFinePlayerId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}>
              <option value="">Select player…</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name} {p.surname}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#666' }}>Fine Type</label>
            <select value={fineType} onChange={e => setFineType(e.target.value as FineType)}
              className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}>
              {FINE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label} — £{t.amount}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#666' }}>Match Date</label>
            <input type="date" value={fineDate} onChange={e => setFineDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', colorScheme: 'dark' }} />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#666' }}>Notes (optional)</label>
            <input type="text" value={fineNotes} onChange={e => setFineNotes(e.target.value)}
              placeholder="e.g. 10 mins late"
              className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }} />
          </div>

          <button onClick={issueFine} disabled={!finePlayerId || issuingFine}
            className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: '#0D6B52', color: 'white' }}>
            {issuingFine ? 'Issuing…' : `Issue Fine — £${FINE_TYPES.find(t => t.value === fineType)?.amount ?? 0}`}
          </button>
        </div>
      )}

      {/* WTP game form */}
      {showWtpForm && (
        <div className="p-4 rounded-2xl space-y-3" style={{ background: '#141414', border: '1px solid #C9A227' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#C9A227' }}>Add WTP Game</p>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#666' }}>Player</label>
            <select value={wtpPlayerId} onChange={e => setWtpPlayerId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}>
              <option value="">Select player…</option>
              {players.filter(p => p.player_type === 'wtp').map(p =>
                <option key={p.id} value={p.id}>{p.name} {p.surname}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#666' }}>Match Date</label>
            <input type="date" value={wtpDate} onChange={e => setWtpDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', colorScheme: 'dark' }} />
          </div>

          <button onClick={addWtpGame} disabled={!wtpPlayerId || addingWtp}
            className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: '#C9A227', color: '#000' }}>
            {addingWtp ? 'Adding…' : 'Add WTP Game — £5.00'}
          </button>
        </div>
      )}

      {/* Player finance table */}
      {loading ? (
        <p className="text-sm py-4 text-center" style={{ color: '#555' }}>Loading…</p>
      ) : summaries.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: '#444' }}>
          No finance records for {monthDisplay}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="flex items-center px-3 pb-1 gap-1"
            style={{ borderBottom: '1px solid #1e1e1e' }}>
            <span className="flex-1 text-xs font-medium" style={{ color: '#555' }}>Player</span>
            <span className="text-xs w-10 text-center" style={{ color: '#C9A227' }}>WTP</span>
            <span className="text-xs w-10 text-center" style={{ color: '#888' }}>Late</span>
            <span className="text-xs w-10 text-center" style={{ color: '#888' }}>Ball</span>
            <span className="text-xs w-10 text-center" style={{ color: '#888' }}>C*nt</span>
            <span className="text-xs w-10 text-center" style={{ color: '#888' }}>Out</span>
            <span className="text-xs w-14 text-right font-semibold" style={{ color: '#ff6b6b' }}>Owed</span>
          </div>

          {summaries.map(s => {
            const isExpanded = expandedId === s.player.id
            const allPaid = s.totalOwed === 0

            return (
              <div key={s.player.id} className="rounded-2xl overflow-hidden"
                style={{ background: '#141414', border: `1px solid ${allPaid ? '#2e2e2e' : '#3a1a1a'}` }}>

                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : s.player.id)}
                  className="w-full flex items-center px-3 py-3 gap-1"
                >
                  <span className="flex-1 text-sm font-medium text-left"
                    style={{ color: allPaid ? '#666' : 'white' }}>
                    {s.player.name} {s.player.surname}
                  </span>
                  <span className="text-xs w-10 text-center tabular-nums"
                    style={{ color: s.wtpOwed > 0 ? '#C9A227' : '#444' }}>
                    {s.wtpOwed > 0 ? `£${s.wtpOwed}` : '—'}
                  </span>
                  <span className="text-xs w-10 text-center tabular-nums"
                    style={{ color: s.lateOwed > 0 ? '#ff6b6b' : '#444' }}>
                    {s.lateOwed > 0 ? `£${s.lateOwed}` : '—'}
                  </span>
                  <span className="text-xs w-10 text-center tabular-nums"
                    style={{ color: s.lostBallOwed > 0 ? '#ff6b6b' : '#444' }}>
                    {s.lostBallOwed > 0 ? `£${s.lostBallOwed}` : '—'}
                  </span>
                  <span className="text-xs w-10 text-center tabular-nums"
                    style={{ color: s.cunOwed > 0 ? '#ff6b6b' : '#444' }}>
                    {s.cunOwed > 0 ? `£${s.cunOwed}` : '—'}
                  </span>
                  <span className="text-xs w-10 text-center tabular-nums"
                    style={{ color: s.dropoutOwed > 0 ? '#ff6b6b' : '#444' }}>
                    {s.dropoutOwed > 0 ? `£${s.dropoutOwed}` : '—'}
                  </span>
                  <span className="text-xs w-14 text-right font-bold tabular-nums"
                    style={{ color: allPaid ? '#0D6B52' : '#ff6b6b' }}>
                    {allPaid ? '✓' : `£${s.totalOwed.toFixed(2)}`}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #2e2e2e' }}>

                    {/* Mark as paid button */}
                    {s.totalOwed > 0 && (
                      <div className="px-3 py-2.5" style={{ borderBottom: '1px solid #1e1e1e' }}>
                        <button
                          onClick={() => markAllPaid(s)}
                          disabled={markingPaid === s.player.id}
                          className="w-full py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                          style={{ background: '#0a1a10', color: '#4ade80', border: '1px solid #4ade80' }}
                        >
                          {markingPaid === s.player.id ? 'Marking…' : `✓ Mark All Paid (£${s.totalOwed.toFixed(2)})`}
                        </button>
                      </div>
                    )}

                    {/* WTP games */}
                    {s.wtpGames.length > 0 && (
                      <div className="px-3 py-2" style={{ borderBottom: s.fines.length > 0 ? '1px solid #1e1e1e' : 'none' }}>
                        <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: '#C9A227' }}>WTP Games</p>
                        <div className="space-y-1.5">
                          {s.wtpGames.map(g => (
                            <div key={g.id} className="flex items-center gap-2">
                              <button onClick={() => toggleGamePaid(g)}
                                className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0"
                                style={{
                                  background: g.paid ? '#0a1a10' : '#1e1e1e',
                                  color: g.paid ? '#4ade80' : '#888',
                                  border: `1px solid ${g.paid ? '#4ade80' : '#2e2e2e'}`,
                                }}>
                                {g.paid ? '✓' : 'Unpaid'}
                              </button>
                              <span className="flex-1 text-xs" style={{ color: g.paid ? '#555' : '#ccc' }}>
                                {format(new Date(g.match_date + 'T12:00:00'), 'EEE do MMM')}
                              </span>
                              <span className="text-xs" style={{ color: g.paid ? '#555' : '#C9A227' }}>
                                £{Number(g.amount).toFixed(2)}
                              </span>
                              <button onClick={() => deleteWtpGame(g.id)}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ color: '#5a1a1a', border: '1px solid #3a1010' }}>
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fines */}
                    {s.fines.length > 0 && (
                      <div className="px-3 py-2">
                        <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: '#888' }}>Fines</p>
                        <div className="space-y-1.5">
                          {s.fines.map(f => (
                            <div key={f.id} className="flex items-center gap-2">
                              <button onClick={() => toggleFinePaid(f)}
                                className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0"
                                style={{
                                  background: f.paid ? '#0a1a10' : '#1e1e1e',
                                  color: f.paid ? '#4ade80' : '#888',
                                  border: `1px solid ${f.paid ? '#4ade80' : '#2e2e2e'}`,
                                }}>
                                {f.paid ? '✓' : 'Unpaid'}
                              </button>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs" style={{ color: f.paid ? '#555' : '#ccc' }}>
                                  {fineLabel(f.type)}
                                  {f.match_date && ` · ${format(new Date(f.match_date + 'T12:00:00'), 'do MMM')}`}
                                </span>
                                {f.notes && (
                                  <p className="text-xs truncate" style={{ color: '#555' }}>{f.notes}</p>
                                )}
                              </div>
                              <span className="text-xs" style={{ color: f.paid ? '#555' : '#ff6b6b' }}>
                                £{Number(f.amount).toFixed(2)}
                              </span>
                              <button onClick={() => deleteFine(f.id)}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ color: '#5a1a1a', border: '1px solid #3a1010' }}>
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Totals row */}
          <div className="flex items-center px-3 py-3 rounded-2xl gap-1"
            style={{ background: '#0a0a0a', border: '1px solid #2e2e2e', marginTop: 8 }}>
            <span className="flex-1 text-xs font-bold uppercase tracking-wide" style={{ color: '#555' }}>Totals</span>
            <span className="text-xs w-10 text-center font-bold tabular-nums" style={{ color: '#C9A227' }}>
              £{grandWtp.toFixed(0)}
            </span>
            <span className="text-xs w-10 text-center font-bold tabular-nums" style={{ color: '#ff6b6b' }}>
              £{grandLate.toFixed(0)}
            </span>
            <span className="text-xs w-10 text-center font-bold tabular-nums" style={{ color: '#ff6b6b' }}>
              £{grandLostBall.toFixed(0)}
            </span>
            <span className="text-xs w-10 text-center font-bold tabular-nums" style={{ color: '#ff6b6b' }}>
              £{grandCun.toFixed(0)}
            </span>
            <span className="text-xs w-10 text-center font-bold tabular-nums" style={{ color: '#ff6b6b' }}>
              £{grandDropout.toFixed(0)}
            </span>
            <span className="text-xs w-14 text-right font-bold tabular-nums" style={{ color: '#ff6b6b' }}>
              £{grandTotalOwed.toFixed(2)}
            </span>
          </div>

          {/* Export CSV */}
          <button
            onClick={() => exportCsv(summaries, monthLabel)}
            className="w-full py-2.5 rounded-xl text-xs font-semibold"
            style={{ background: '#141414', color: '#888', border: '1px solid #2e2e2e' }}
          >
            Export CSV — {monthDisplay}
          </button>
        </div>
      )}
    </div>
  )
}
