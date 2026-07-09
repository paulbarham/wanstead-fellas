import { useEffect, useState, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { supabase } from '../lib/supabase'
import PlayerAvatar from './PlayerAvatar'
import type { Profile, Fine, WtpGame, FineType, Credit } from '../types'
import { FINE_TYPES } from '../types'
import { getNextThursdayDate } from '../lib/time'
import { computeBlockStatus, monthLabelOf, type BlockStatus } from '../lib/finance'

interface PlayerSummary {
  player: Profile
  fines: Fine[]
  wtpGames: WtpGame[]
  credits: Credit[]
  wtpOwed: number
  lateOwed: number
  lostBallOwed: number
  cunOwed: number
  dropoutOwed: number
  monthOwed: number
  // Unpaid amounts from months STRICTLY BEFORE the viewed month, so the
  // admin can see Felix's £30 carryover next to his £15 current month.
  priorOwed: number
  // monthOwed + priorOwed — gross outstanding before netting credits.
  grossOwed: number
  // Total credit balance the player holds.
  creditBalance: number
  // grossOwed - creditBalance. Negative = in credit (green), positive = owes.
  netBalance: number
  totalPaid: number
}

function buildSummaries(
  players: Profile[],
  fines: Fine[],
  wtpGames: WtpGame[],
  credits: Credit[],
  priorOwedByPlayer: Record<string, number>,
): PlayerSummary[] {
  const summaries: PlayerSummary[] = []
  const seen = new Set<string>()

  for (const player of players) {
    const pf = fines.filter(f => f.player_id === player.id)
    const pg = wtpGames.filter(g => g.player_id === player.id)
    const pc = credits.filter(c => c.player_id === player.id)
    const prior = priorOwedByPlayer[player.id] ?? 0
    if (pf.length === 0 && pg.length === 0 && prior === 0 && pc.length === 0) continue
    seen.add(player.id)

    const unpaidFines = pf.filter(f => !f.paid)
    const unpaidGames = pg.filter(g => !g.paid)
    const paidFines = pf.filter(f => f.paid)
    const paidGames = pg.filter(g => g.paid)

    const monthOwed = unpaidFines.reduce((s, f) => s + Number(f.amount), 0)
      + unpaidGames.reduce((s, g) => s + Number(g.amount), 0)
    const grossOwed = monthOwed + prior
    const creditBalance = pc.reduce((s, c) => s + Number(c.amount), 0)

    summaries.push({
      player,
      fines: pf,
      wtpGames: pg,
      credits: pc,
      wtpOwed: unpaidGames.reduce((s, g) => s + Number(g.amount), 0),
      lateOwed: unpaidFines.filter(f => f.type === 'late').reduce((s, f) => s + Number(f.amount), 0),
      lostBallOwed: unpaidFines.filter(f => f.type === 'lost_ball').reduce((s, f) => s + Number(f.amount), 0),
      cunOwed: unpaidFines.filter(f => f.type === 'cuntiness').reduce((s, f) => s + Number(f.amount), 0),
      dropoutOwed: unpaidFines.filter(f => f.type === 'dropout').reduce((s, f) => s + Number(f.amount), 0),
      monthOwed,
      priorOwed: prior,
      grossOwed,
      creditBalance,
      netBalance: grossOwed - creditBalance,
      totalPaid: paidFines.reduce((s, f) => s + Number(f.amount), 0) + paidGames.reduce((s, g) => s + Number(g.amount), 0),
    })
  }

  // Also include players who have *only* prior carryover OR credits but no
  // current-month records — they still need to appear in the chase / clear list.
  for (const player of players) {
    if (seen.has(player.id)) continue
    const prior = priorOwedByPlayer[player.id] ?? 0
    const pc = credits.filter(c => c.player_id === player.id)
    if (prior === 0 && pc.length === 0) continue
    const creditBalance = pc.reduce((s, c) => s + Number(c.amount), 0)
    summaries.push({
      player,
      fines: [], wtpGames: [], credits: pc,
      wtpOwed: 0, lateOwed: 0, lostBallOwed: 0, cunOwed: 0, dropoutOwed: 0,
      monthOwed: 0, priorOwed: prior, grossOwed: prior,
      creditBalance, netBalance: prior - creditBalance, totalPaid: 0,
    })
  }

  // Sort by net balance desc so the biggest debts surface first; credit
  // holders end up at the bottom.
  return summaries.sort((a, b) => b.netBalance - a.netBalance)
}

// Small £-only formatter for the dense table. Whole-pound display by default
// (£45) when there are no pence; full pennies otherwise (£4.50).
function gbp(n: number): string {
  return n % 1 === 0 ? `£${n.toFixed(0)}` : `£${n.toFixed(2)}`
}

interface HeroTileProps { label: string; value: string; tone: 'red' | 'amber' | 'cyan' | 'green' }
function HeroTile({ label, value, tone }: HeroTileProps) {
  const colour =
    tone === 'red'   ? 'var(--color-error-text)' :
    tone === 'amber' ? '#C9A227' :
    tone === 'cyan'  ? 'var(--tt-cyan)' :
                       'var(--color-primary)'
  return (
    <div
      className="flex-1 rounded-2xl px-3 py-2.5"
      style={{ background: 'var(--color-surface)', border: `1px solid ${colour}55`, minWidth: 0 }}
    >
      <div style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div
        className="tabular-nums"
        style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 18, color: colour, marginTop: 2, lineHeight: 1 }}
      >
        {value}
      </div>
    </div>
  )
}

function exportCsv(summaries: PlayerSummary[], monthLabel: string) {
  const headers = ['Name', 'WTP Games (£)', 'Late (£)', 'Lost Ball (£)', 'Cuntiness (£)', 'Drop Out (£)', 'Month Owed (£)', 'Prior Owed (£)', 'Gross Owed (£)', 'Credits (£)', 'Net Balance (£)', 'Total Paid (£)', 'Status']
  const status = (s: PlayerSummary) =>
    s.netBalance > 0 ? 'Outstanding' : s.netBalance < 0 ? 'In Credit' : 'Paid'
  const lines = [
    headers.join(','),
    ...summaries.map(s => [
      `"${s.player.name} ${s.player.surname}"`,
      s.wtpOwed.toFixed(2),
      s.lateOwed.toFixed(2),
      s.lostBallOwed.toFixed(2),
      s.cunOwed.toFixed(2),
      s.dropoutOwed.toFixed(2),
      s.monthOwed.toFixed(2),
      s.priorOwed.toFixed(2),
      s.grossOwed.toFixed(2),
      s.creditBalance.toFixed(2),
      s.netBalance.toFixed(2),
      s.totalPaid.toFixed(2),
      status(s),
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
  // Credits are queried across ALL TIME (not month-scoped) — once a player
  // has a credit it persists until consumed/refunded.
  const [credits, setCredits] = useState<Credit[]>([])
  // priorOwedByPlayer[playerId] = unpaid £ from months STRICTLY BEFORE the
  // currently viewed month. Surfaces carryover next to each row.
  const [priorOwedByPlayer, setPriorOwedByPlayer] = useState<Record<string, number>>({})
  // Players currently blocked from signing up because their unpaid charges
  // are past the 2-week grace period. Sourced from v_blocked_players.
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
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

  // Credit entry form — admin adds £ when a player overpays or is gifted credit
  const [showCreditForm, setShowCreditForm] = useState(false)
  const [creditPlayerId, setCreditPlayerId] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditNotes, setCreditNotes] = useState('')
  const [addingCredit, setAddingCredit] = useState(false)

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const monthLabel = format(viewDate, 'yyyy-MM')
  const monthDisplay = format(viewDate, 'MMMM yyyy')

  const loadData = useCallback(async () => {
    setLoading(true)
    const startStr = format(monthStart, 'yyyy-MM-dd')
    const endStr = format(monthEnd, 'yyyy-MM-dd')

    const [{ data: ps }, { data: fs }, { data: gs }, { data: cs }, { data: priorF }, { data: priorG }, { data: blocked }] = await Promise.all([
      supabase.from('profiles').select('*').order('surname'),
      supabase.from('fines').select('*').gte('match_date', startStr).lte('match_date', endStr),
      supabase.from('wtp_games').select('*').gte('match_date', startStr).lte('match_date', endStr),
      // Credits are pulled all-time — they persist until used / refunded.
      supabase.from('credits').select('*'),
      // Carryover: unpaid amounts from any earlier month. Filtered server-side
      // so we don't pull every row in the table.
      supabase.from('fines').select('player_id, amount').eq('paid', false).lt('match_date', startStr),
      supabase.from('wtp_games').select('player_id, amount').eq('paid', false).lt('match_date', startStr),
      supabase.from('v_blocked_players').select('player_id'),
    ])
    setPlayers((ps as Profile[]) || [])
    setFines((fs as Fine[]) || [])
    setWtpGames((gs as WtpGame[]) || [])
    setCredits((cs as Credit[]) || [])

    const prior: Record<string, number> = {}
    for (const r of ((priorF as { player_id: string; amount: number | string }[]) || [])) {
      prior[r.player_id] = (prior[r.player_id] ?? 0) + Number(r.amount)
    }
    for (const r of ((priorG as { player_id: string; amount: number | string }[]) || [])) {
      prior[r.player_id] = (prior[r.player_id] ?? 0) + Number(r.amount)
    }
    setPriorOwedByPlayer(prior)
    setBlockedIds(new Set(((blocked as { player_id: string }[]) || []).map(b => b.player_id)))
    setLoading(false)
  }, [viewDate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData() }, [loadData])

  const summaries = buildSummaries(players, fines, wtpGames, credits, priorOwedByPlayer)

  const grandPriorOwed = summaries.reduce((s, r) => s + r.priorOwed, 0)
  const grandGrossOwed = summaries.reduce((s, r) => s + r.grossOwed, 0)
  const grandCredits = summaries.reduce((s, r) => s + r.creditBalance, 0)
  const grandNetOwed = grandGrossOwed - grandCredits
  const grandWtp = summaries.reduce((s, r) => s + r.wtpOwed, 0)
  const grandLate = summaries.reduce((s, r) => s + r.lateOwed, 0)
  const grandLostBall = summaries.reduce((s, r) => s + r.lostBallOwed, 0)
  const grandCun = summaries.reduce((s, r) => s + r.cunOwed, 0)
  const grandDropout = summaries.reduce((s, r) => s + r.dropoutOwed, 0)

  async function markAllPaid(summary: PlayerSummary) {
    setMarkingPaid(summary.player.id)
    const fineIds = summary.fines.filter(f => !f.paid).map(f => f.id)
    const gameIds = summary.wtpGames.filter(g => !g.paid).map(g => g.id)
    // If they have prior-month carryover, clear everything unpaid for this
    // player across all time — admin's intent here is "they've paid up".
    const clearPriorToo = summary.priorOwed > 0
    await Promise.all([
      fineIds.length > 0 ? supabase.from('fines').update({ paid: true }).in('id', fineIds) : Promise.resolve(),
      gameIds.length > 0 ? supabase.from('wtp_games').update({ paid: true }).in('id', gameIds) : Promise.resolve(),
      clearPriorToo ? supabase.from('fines').update({ paid: true }).eq('player_id', summary.player.id).eq('paid', false) : Promise.resolve(),
      clearPriorToo ? supabase.from('wtp_games').update({ paid: true }).eq('player_id', summary.player.id).eq('paid', false) : Promise.resolve(),
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

  async function addCredit() {
    const n = parseFloat(creditAmount)
    if (!creditPlayerId || !isFinite(n) || n <= 0) return
    setAddingCredit(true)
    await supabase.from('credits').insert({
      player_id: creditPlayerId,
      amount: n,
      notes: creditNotes || null,
    })
    setCreditAmount(''); setCreditNotes('')
    setShowCreditForm(false)
    setAddingCredit(false)
    await loadData()
  }

  async function deleteCredit(id: string) {
    await supabase.from('credits').delete().eq('id', id)
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

  // Hero stats for the chase-list dashboard at the top — surface the numbers
  // admin most cares about before they scroll.
  const playersWithDebt = summaries.filter(s => s.netBalance > 0).length
  const blockedCount = summaries.filter(s => blockedIds.has(s.player.id)).length
  const creditHolders = summaries.filter(s => s.creditBalance > 0).length

  return (
    <div className="space-y-4">
      {/* Month navigator */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => setViewDate(d => subMonths(d, 1))}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          ‹
        </button>
        <span className="font-semibold text-[var(--color-text)] text-sm">{monthDisplay}</span>
        <button
          onClick={() => setViewDate(d => addMonths(d, 1))}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          ›
        </button>
      </div>

      {/* Hero stats — the chase numbers up top so admin sees them first.
          Net of credits so the number matches what's actually due. */}
      <div className="flex gap-2">
        <HeroTile label="Outstanding" value={gbp(Math.max(0, grandNetOwed))} tone="red" />
        <HeroTile label="Owed by" value={String(playersWithDebt)} tone="cyan" />
        <HeroTile label="Blocked" value={String(blockedCount)} tone={blockedCount > 0 ? 'red' : 'green'} />
        {(grandCredits > 0 || creditHolders > 0) && (
          <HeroTile label="Credits" value={gbp(grandCredits)} tone="green" />
        )}
      </div>

      {/* Action buttons — compact tertiary so they don't dominate the page. */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => { setShowFineForm(s => !s); setShowWtpForm(false); setShowCreditForm(false) }}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
          style={{
            background: showFineForm ? 'var(--color-primary)' : 'transparent',
            color: showFineForm ? 'white' : 'var(--color-primary)',
            border: '1px solid var(--color-primary)',
          }}
        >
          + Fine
        </button>
        <button
          onClick={() => { setShowWtpForm(s => !s); setShowFineForm(false); setShowCreditForm(false) }}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
          style={{
            background: showWtpForm ? '#C9A227' : 'transparent',
            color: showWtpForm ? '#000' : '#C9A227',
            border: '1px solid #C9A227',
          }}
        >
          + WTP
        </button>
        <button
          onClick={() => { setShowCreditForm(s => !s); setShowFineForm(false); setShowWtpForm(false) }}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
          style={{
            background: showCreditForm ? 'var(--tt-green)' : 'transparent',
            color: showCreditForm ? '#0F1710' : 'var(--tt-green)',
            border: '1px solid var(--tt-green)',
          }}
        >
          + Credit
        </button>
      </div>

      {/* Fine entry form */}
      {showFineForm && (
        <div className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-primary)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>Issue Fine</p>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Player</label>
            <select value={finePlayerId} onChange={e => setFinePlayerId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <option value="">Select player…</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name} {p.surname}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Fine Type</label>
            <select value={fineType} onChange={e => setFineType(e.target.value as FineType)}
              className="w-full px-3 py-2.5 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              {FINE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label} — £{t.amount}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Match Date</label>
            <input type="date" value={fineDate} onChange={e => setFineDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', colorScheme: 'light' }} />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Notes (optional)</label>
            <input type="text" value={fineNotes} onChange={e => setFineNotes(e.target.value)}
              placeholder="e.g. 10 mins late"
              className="w-full px-3 py-2.5 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
          </div>

          <button onClick={issueFine} disabled={!finePlayerId || issuingFine}
            className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}>
            {issuingFine ? 'Issuing…' : `Issue Fine — £${FINE_TYPES.find(t => t.value === fineType)?.amount ?? 0}`}
          </button>
        </div>
      )}

      {/* WTP game form */}
      {showWtpForm && (
        <div className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid #C9A227' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-warning-text)' }}>Add WTP Game</p>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Player</label>
            <select value={wtpPlayerId} onChange={e => setWtpPlayerId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <option value="">Select player…</option>
              {players.filter(p => p.player_type === 'wtp' || p.player_type === 'wtp_priority').map(p =>
                <option key={p.id} value={p.id}>{p.name} {p.surname}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Match Date</label>
            <input type="date" value={wtpDate} onChange={e => setWtpDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', colorScheme: 'light' }} />
          </div>

          <button onClick={addWtpGame} disabled={!wtpPlayerId || addingWtp}
            className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--color-warning-text)', color: '#000' }}>
            {addingWtp ? 'Adding…' : 'Add WTP Game — £5.00'}
          </button>
        </div>
      )}

      {/* Credit form — admin records an overpayment or goodwill credit. */}
      {showCreditForm && (
        <div className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--tt-green)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tt-green)' }}>Add Credit</p>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Player</label>
            <select value={creditPlayerId} onChange={e => setCreditPlayerId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <option value="">Select player…</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name} {p.surname}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Amount (£)</label>
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={creditAmount}
              onChange={e => setCreditAmount(e.target.value)} placeholder="3.00"
              className="w-full px-3 py-2.5 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Notes (optional)</label>
            <input type="text" value={creditNotes} onChange={e => setCreditNotes(e.target.value)}
              placeholder="e.g. overpayment Jun 2026"
              className="w-full px-3 py-2.5 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
          </div>

          <button onClick={addCredit} disabled={!creditPlayerId || !creditAmount || addingCredit}
            className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--tt-green)', color: '#0F1710' }}>
            {addingCredit ? 'Adding…' : `Add Credit${creditAmount ? ` — £${parseFloat(creditAmount).toFixed(2)}` : ''}`}
          </button>
        </div>
      )}

      {/* Player finance table */}
      {loading ? (
        <p className="text-sm py-4 text-center" style={{ color: '#9CA897' }}>Loading…</p>
      ) : summaries.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: '#444' }}>
          No finance records for {monthDisplay}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers — match row's padding + fixed amount cell width
              so the "Owed" header lines up with the data column. */}
          <div className="flex items-center pb-1.5"
            style={{ borderBottom: '1px solid var(--color-border)', paddingLeft: 10, paddingRight: 12 }}>
            <span className="flex-1 text-xs font-medium pl-[40px]" style={{ color: '#9CA897' }}>Player</span>
            <span className="text-xs font-semibold text-right" style={{ color: 'var(--color-error-text)', width: 82 }}>Owed</span>
          </div>

          {summaries.map(s => {
            const isExpanded = expandedId === s.player.id
            const inCredit = s.netBalance < 0
            const allSquare = s.netBalance === 0
            const owes = s.netBalance > 0
            const isBlocked = blockedIds.has(s.player.id)
            // Block status across ALL of this player's unpaid debts (current
            // viewed month + prior carryover) — mirrors what MyFinances shows
            // to the player themselves so admin sees the same "£X by Fri X"
            // signal at a glance.
            const allUnpaidDated = [
              ...s.wtpGames.filter(g => !g.paid).map(g => ({ match_date: g.match_date, amount: Number(g.amount) })),
              ...s.fines.filter(f => !f.paid && !!f.match_date).map(f => ({ match_date: f.match_date!, amount: Number(f.amount) })),
            ]
            const blockStatus: BlockStatus = computeBlockStatus(allUnpaidDated, s.creditBalance)
            // Border accent state: red = blocked, amber = carryover, green =
            // in credit, default otherwise. Combines visual cues at a glance.
            const borderColor = allSquare ? 'var(--color-border)'
              : inCredit ? '#0a3a1a'
              : s.priorOwed > 0 ? '#7a3a0a' : '#3a1a1a'
            const leftAccent = isBlocked ? '4px solid var(--color-error-text)'
              : inCredit ? '4px solid var(--tt-green)'
              : s.priorOwed > 0 ? '4px solid #C9A227'
              : `1px solid ${borderColor}`

            // Mini one-line breakdown that replaces the 5-column wall:
            // tells admin at a glance whether a row is mostly WTP or fines.
            const parts: string[] = []
            if (s.wtpOwed       > 0) parts.push(`${gbp(s.wtpOwed)} WTP`)
            const finesTotal = s.lateOwed + s.lostBallOwed + s.cunOwed + s.dropoutOwed
            if (finesTotal      > 0) parts.push(`${gbp(finesTotal)} fines`)
            const breakdownLine = parts.length > 1 ? parts.join(' · ') : null

            // Right-hand colour: green for credit, red for owed, dim for square.
            const rightColour = owes ? '#DC2626' : inCredit ? 'var(--tt-green)' : '#0D6B52'

            return (
              <div key={s.player.id} className="rounded-2xl overflow-hidden"
                style={{
                  background: 'var(--color-surface)',
                  border: `1px solid ${borderColor}`,
                  borderLeft: leftAccent,
                }}>

                {/* Summary row — avatar + name + fixed-width amount cell so
                    the subtitle text never overflows past the card edge. */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : s.player.id)}
                  className="w-full flex items-center py-2.5 gap-2.5"
                  style={{ paddingLeft: 10, paddingRight: 12 }}
                >
                  <PlayerAvatar profile={s.player} size={30} />
                  <span className="flex-1 min-w-0 text-left flex flex-col gap-0.5">
                    <span className="text-sm font-medium flex items-center gap-1.5"
                      style={{ color: allSquare ? '#666' : 'white' }}>
                      <span className="truncate">{s.player.name} {s.player.surname}</span>
                      {blockStatus.kind === 'past-due' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider flex-shrink-0"
                          style={{ background: 'rgba(255,85,85,0.15)', color: 'var(--color-error-text)', border: '1px solid var(--color-error-border)' }}>
                          ⛔ £{blockStatus.amount.toFixed(0)}
                        </span>
                      )}
                      {blockStatus.kind === 'due-soon' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider flex-shrink-0"
                          style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--color-warning-text)', border: '1px solid var(--color-warning-text)' }}
                          title={`Pay £${blockStatus.amount.toFixed(2)} by ${format(blockStatus.dueAt, 'EEE do MMM')} to avoid block`}>
                          ⚠ £{blockStatus.amount.toFixed(0)} by {format(blockStatus.dueAt, 'd MMM')}
                        </span>
                      )}
                      {!blockStatus || blockStatus.kind === 'safe' ? null : null}
                      {isBlocked && blockStatus.kind !== 'past-due' && (
                        // Fallback: the v_blocked_players view flagged them but
                        // our client-side computation didn't (shouldn't happen,
                        // but if it does, at least surface it).
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider flex-shrink-0"
                          style={{ background: 'rgba(255,85,85,0.15)', color: 'var(--color-error-text)', border: '1px solid var(--color-error-border)' }}>
                          ⛔
                        </span>
                      )}
                    </span>
                    {breakdownLine && (
                      <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                        {breakdownLine}
                      </span>
                    )}
                  </span>
                  {/* Fixed-width amount cell — wide enough for "£999" + the
                      shortened subtitle, narrow enough not to crowd the name. */}
                  <span className="text-right font-bold tabular-nums flex-shrink-0"
                    style={{ color: rightColour, width: 82 }}>
                    {allSquare ? (
                      <span className="text-base">✓</span>
                    ) : inCredit ? (
                      <span className="flex flex-col items-end leading-tight">
                        <span className="text-base">{gbp(Math.abs(s.netBalance))}</span>
                        <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'var(--tt-green)' }}>
                          credit
                        </span>
                      </span>
                    ) : (
                      <span className="flex flex-col items-end leading-tight">
                        <span className="text-base">{gbp(s.netBalance)}</span>
                        {s.priorOwed > 0 && (
                          <span className="text-[9px] font-medium" style={{ color: '#C9A227' }}>
                            +{gbp(s.priorOwed)} prior
                          </span>
                        )}
                        {s.creditBalance > 0 && (
                          <span className="text-[9px] font-medium" style={{ color: 'var(--tt-green)' }}>
                            −{gbp(s.creditBalance)} credit
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--color-border)' }}>

                    {/* Block-status callout — mirrors the player's own
                        MyFinances view so admin sees exactly what the player
                        needs to pay to unblock (or what's already blocking). */}
                    {(blockStatus.kind === 'past-due' || blockStatus.kind === 'due-soon') && (
                      <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <div className="p-3 rounded-xl"
                          style={{
                            background: blockStatus.kind === 'past-due' ? '#1a0a0a' : 'rgba(201,162,39,0.10)',
                            border: `1px solid ${blockStatus.kind === 'past-due' ? 'var(--color-error-border)' : 'var(--color-warning-text)'}`,
                          }}>
                          <p className="text-[10px] uppercase tracking-widest font-bold mb-1"
                            style={{ color: blockStatus.kind === 'past-due' ? 'var(--color-error-text)' : 'var(--color-warning-text)' }}>
                            {blockStatus.kind === 'past-due' ? '⛔ Sign-ups locked' : '⚠ Pay this to keep sign-ups open'}
                          </p>
                          <p className="font-semibold text-lg" style={{ color: blockStatus.kind === 'past-due' ? 'var(--color-error-text)' : 'var(--color-warning-text)' }}>
                            £{blockStatus.amount.toFixed(2)}
                          </p>
                          <p className="text-[11px] mt-1" style={{ color: '#9CA897' }}>
                            {blockStatus.kind === 'past-due'
                              ? `${monthLabelOf(blockStatus.monthKey).split(' ')[0]} balance past due (${format(blockStatus.dueAt, 'do MMM')}). Later months not affected.`
                              : `Settle the ${monthLabelOf(blockStatus.monthKey).split(' ')[0]} balance before ${format(blockStatus.dueAt, 'EEE do MMM')}. Later months still in grace.`}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Mark as paid button — clears everything unpaid for the
                        player including any prior-month carryover. */}
                    {s.grossOwed > 0 && (
                      <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <button
                          onClick={() => markAllPaid(s)}
                          disabled={markingPaid === s.player.id}
                          className="w-full py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                          style={{ background: 'var(--color-success-bg)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' }}
                        >
                          {markingPaid === s.player.id ? 'Marking…' : `✓ Mark All Paid (£${s.grossOwed.toFixed(2)}${s.priorOwed > 0 ? ` · incl. £${s.priorOwed.toFixed(2)} prior` : ''})`}
                        </button>
                      </div>
                    )}

                    {/* Credits — list each credit row with delete control */}
                    {s.credits.length > 0 && (
                      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--tt-green)' }}>
                          Credits · {gbp(s.creditBalance)} total
                        </p>
                        <div className="space-y-1.5">
                          {s.credits.map(c => (
                            <div key={c.id} className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0"
                                style={{ background: 'rgba(74,220,122,0.15)', color: 'var(--tt-green)', border: '1px solid var(--tt-green)' }}>
                                Credit
                              </span>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs" style={{ color: '#ccc' }}>
                                  {format(new Date(c.created_at), 'do MMM yy')}
                                </span>
                                {c.notes && (
                                  <p className="text-xs truncate" style={{ color: '#9CA897' }}>{c.notes}</p>
                                )}
                              </div>
                              <span className="text-xs" style={{ color: 'var(--tt-green)' }}>
                                +£{Number(c.amount).toFixed(2)}
                              </span>
                              <button onClick={() => deleteCredit(c.id)}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ color: 'var(--color-error-border)', border: '1px solid #3a1010' }}>
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* WTP games */}
                    {s.wtpGames.length > 0 && (
                      <div className="px-3 py-2" style={{ borderBottom: s.fines.length > 0 ? '1px solid #FFFFFF' : 'none' }}>
                        <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--color-warning-text)' }}>WTP Games</p>
                        <div className="space-y-1.5">
                          {s.wtpGames.map(g => (
                            <div key={g.id} className="flex items-center gap-2">
                              <button onClick={() => toggleGamePaid(g)}
                                className="text-xs px-2.5 py-1 rounded font-semibold flex-shrink-0"
                                style={{
                                  background: g.paid ? 'var(--color-success-bg)' : 'var(--color-primary)',
                                  color: g.paid ? '#0D6B52' : 'var(--color-surface)',
                                  border: `1px solid ${g.paid ? '#0D6B52' : 'var(--color-primary)'}`,
                                }}>
                                {g.paid ? '✓ Paid' : 'Mark Paid'}
                              </button>
                              <span className="flex-1 text-xs" style={{ color: g.paid ? '#555' : '#ccc' }}>
                                {format(new Date(g.match_date + 'T12:00:00'), 'EEE do MMM')}
                              </span>
                              <span className="text-xs" style={{ color: g.paid ? '#555' : '#C9A227' }}>
                                £{Number(g.amount).toFixed(2)}
                              </span>
                              <button onClick={() => deleteWtpGame(g.id)}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ color: 'var(--color-error-border)', border: '1px solid #3a1010' }}>
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
                        <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Fines</p>
                        <div className="space-y-1.5">
                          {s.fines.map(f => (
                            <div key={f.id} className="flex items-center gap-2">
                              <button onClick={() => toggleFinePaid(f)}
                                className="text-xs px-2.5 py-1 rounded font-semibold flex-shrink-0"
                                style={{
                                  background: f.paid ? 'var(--color-success-bg)' : 'var(--color-primary)',
                                  color: f.paid ? '#0D6B52' : 'var(--color-surface)',
                                  border: `1px solid ${f.paid ? '#0D6B52' : 'var(--color-primary)'}`,
                                }}>
                                {f.paid ? '✓ Paid' : 'Mark Paid'}
                              </button>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs" style={{ color: f.paid ? '#555' : '#ccc' }}>
                                  {fineLabel(f.type)}
                                  {f.match_date && ` · ${format(new Date(f.match_date + 'T12:00:00'), 'do MMM')}`}
                                </span>
                                {f.notes && (
                                  <p className="text-xs truncate" style={{ color: '#9CA897' }}>{f.notes}</p>
                                )}
                              </div>
                              <span className="text-xs" style={{ color: f.paid ? '#555' : '#DC2626' }}>
                                £{Number(f.amount).toFixed(2)}
                              </span>
                              <button onClick={() => deleteFine(f.id)}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ color: 'var(--color-error-border)', border: '1px solid #3a1010' }}>
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

          {/* Totals row — matches data-row padding + amount cell width. */}
          <div className="flex items-center py-3 rounded-2xl gap-2.5"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', marginTop: 8, paddingLeft: 10, paddingRight: 12 }}>
            <span className="flex-1 min-w-0 text-left flex flex-col gap-0.5 pl-[40px]">
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#9CA897' }}>Totals</span>
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                {[
                  grandWtp > 0 && `${gbp(grandWtp)} WTP`,
                  grandLate > 0 && `${gbp(grandLate)} late`,
                  grandLostBall > 0 && `${gbp(grandLostBall)} ball`,
                  grandCun > 0 && `${gbp(grandCun)} c*nt`,
                  grandDropout > 0 && `${gbp(grandDropout)} out`,
                ].filter(Boolean).join(' · ') || '—'}
              </span>
            </span>
            <span className="text-right font-bold tabular-nums flex-shrink-0 leading-tight flex flex-col items-end"
              style={{ color: grandNetOwed > 0 ? 'var(--color-error-text)' : grandNetOwed < 0 ? 'var(--tt-green)' : '#0D6B52', width: 82 }}>
              <span className="text-base">
                {grandNetOwed === 0 ? '✓' : grandNetOwed < 0 ? gbp(Math.abs(grandNetOwed)) : gbp(grandNetOwed)}
              </span>
              {grandNetOwed < 0 && (
                <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'var(--tt-green)' }}>credit</span>
              )}
              {grandPriorOwed > 0 && (
                <span className="text-[9px] font-medium" style={{ color: '#C9A227' }}>
                  +{gbp(grandPriorOwed)} prior
                </span>
              )}
              {grandCredits > 0 && grandNetOwed > 0 && (
                <span className="text-[9px] font-medium" style={{ color: 'var(--tt-green)' }}>
                  −{gbp(grandCredits)} credit
                </span>
              )}
            </span>
          </div>

          {/* Export CSV */}
          <button
            onClick={() => exportCsv(summaries, monthLabel)}
            className="w-full py-2.5 rounded-xl text-xs font-semibold"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            Export CSV — {monthDisplay}
          </button>
        </div>
      )}
    </div>
  )
}
