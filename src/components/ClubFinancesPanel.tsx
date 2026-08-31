// Club Finances (admin-only) — v1: seasonal subs income + auto-generated
// pitch hire expenses. Rolls into a running balance callout at the top.
// Extra categories (equipment, food, tournament) are supported via the
// club_expenses schema but no admin UI to add them yet — that lands
// once a real one comes up.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import PlayerAvatar from './PlayerAvatar'
import type { Profile } from '../types'

interface Subscription {
  id: string
  player_id: string
  season: string
  amount: number
  paid: boolean
  paid_at: string | null
  notes: string | null
  created_at: string
}

interface Expense {
  id: string
  date: string
  category: 'pitch_hire' | 'equipment' | 'food' | 'tournament' | 'other'
  amount: number
  notes: string | null
  match_id: string | null
  paid: boolean
  paid_at: string | null
}

interface IncomeItem {
  id: string
  date: string
  source: 'carry_over' | 'spreadsheet_fine' | 'donation' | 'deposit' | 'prize' | 'other'
  amount: number
  notes: string | null
}

interface WtpRow    { player_id: string; match_date: string; amount: number; paid: boolean }
interface FineRow   { player_id: string; match_date: string | null; type: string; amount: number; paid: boolean }

// April → March. seasonKeyOf(new Date('2026-07-11')) → '2026-27'.
export function currentSeasonKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const startYear = now.getMonth() >= 3 ? y : y - 1  // Apr = month index 3
  const endShort = String((startYear + 1) % 100).padStart(2, '0')
  return `${startYear}-${endShort}`
}

function seasonBounds(seasonKey: string): { first: string; last: string } {
  const startYear = Number(seasonKey.split('-')[0])
  return {
    first: `${startYear}-04-01`,
    last:  `${startYear + 1}-03-31`,
  }
}

const gbp = (n: number) => `£${n.toFixed(2)}`
const gbpi = (n: number) => `£${Math.round(n)}`

export default function ClubFinancesPanel() {
  // Season pinned to current for v1 — season-picker UI lands when we
  // actually have two seasons of data to switch between.
  const [season] = useState<string>(currentSeasonKey())
  const [subs, setSubs] = useState<Subscription[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({})
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [income, setIncome] = useState<IncomeItem[]>([])
  const [wtpRows, setWtpRows] = useState<WtpRow[]>([])
  const [fineRows, setFineRows] = useState<FineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all')
  const [addingExpense, setAddingExpense] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { first, last } = seasonBounds(season)
    const [{ data: subsData }, { data: expData }, { data: incData }, { data: wtpData }, { data: fineData }] = await Promise.all([
      supabase.from('club_subscriptions').select('*').eq('season', season).order('paid').order('created_at'),
      supabase.from('club_expenses').select('*').gte('date', first).lte('date', last).order('date', { ascending: false }),
      supabase.from('club_income').select('*').gte('date', first).lte('date', last).order('date', { ascending: false }),
      supabase.from('wtp_games').select('player_id, match_date, amount, paid').gte('match_date', first).lte('match_date', last),
      supabase.from('fines').select('player_id, match_date, type, amount, paid').gte('match_date', first).lte('match_date', last),
    ])
    const subsList = (subsData as Subscription[]) ?? []
    const playerIds = Array.from(new Set(subsList.map(s => s.player_id)))
    const { data: profs } = playerIds.length > 0
      ? await supabase.from('profiles').select('*').in('id', playerIds)
      : { data: [] as Profile[] }
    const map: Record<string, Profile> = {}
    for (const p of (profs as Profile[]) ?? []) map[p.id] = p
    setSubs(subsList)
    setProfilesById(map)
    setExpenses((expData as Expense[]) ?? [])
    setIncome((incData as IncomeItem[]) ?? [])
    setWtpRows((wtpData as WtpRow[]) ?? [])
    setFineRows((fineData as FineRow[]) ?? [])
    setLoading(false)
  }, [season])

  useEffect(() => { load() }, [load])

  const summary = useMemo(() => {
    // ── Subs ──
    const potentialSubs = subs.reduce((s, r) => s + Number(r.amount), 0)
    const collectedSubs = subs.filter(r => r.paid).reduce((s, r) => s + Number(r.amount), 0)
    const outstandingSubs = potentialSubs - collectedSubs
    // ── WTP + fines ──
    const wtpPaid       = wtpRows.filter(r => r.paid).reduce((s, r) => s + Number(r.amount), 0)
    const wtpOutstanding= wtpRows.filter(r => !r.paid).reduce((s, r) => s + Number(r.amount), 0)
    const finesPaid     = fineRows.filter(r => r.paid).reduce((s, r) => s + Number(r.amount), 0)
    const finesOutstanding = fineRows.filter(r => !r.paid).reduce((s, r) => s + Number(r.amount), 0)
    // ── Other income (club_income) ──
    const otherIncome   = income.reduce((s, r) => s + Number(r.amount), 0)
    // ── Expenses ──
    const totalExpense    = expenses.reduce((s, r) => s + Number(r.amount), 0)
    const paidExpense     = expenses.filter(r => r.paid).reduce((s, r) => s + Number(r.amount), 0)
    // ── Roll-ups ──
    const collectedIncome = collectedSubs + wtpPaid + finesPaid + otherIncome
    const potentialIncome = potentialSubs + wtpPaid + wtpOutstanding + finesPaid + finesOutstanding + otherIncome
    const netBalance       = collectedIncome - paidExpense
    const projectedBalance = potentialIncome - totalExpense
    const subsPaidCount    = subs.filter(r => r.paid).length
    return {
      potentialSubs, collectedSubs, outstandingSubs, subsPaidCount,
      wtpPaid, wtpOutstanding, finesPaid, finesOutstanding, otherIncome,
      totalExpense, paidExpense,
      collectedIncome, potentialIncome, netBalance, projectedBalance,
    }
  }, [subs, expenses, income, wtpRows, fineRows])

  // Chase-up card: only renders when there's something to chase.
  // Deliberately loud styling — the sub monthly reminder push (mig 083)
  // also fires on the 1st, so admin already gets a nudge; this is the
  // year-round persistent form for whenever they open Club Finances.
  const chase = useMemo(() => {
    const unpaid = subs.filter(s => !s.paid)
    if (unpaid.length === 0) return null
    const totalOwed = unpaid.reduce((s, r) => s + Number(r.amount), 0)
    const oldestIso = unpaid
      .map(r => r.created_at)
      .sort()[0] ?? null
    return { count: unpaid.length, totalOwed, oldestIso }
  }, [subs])

  const expensesByMonth = useMemo(() => {
    const map = new Map<string, { total: number; paid: number; rows: Expense[] }>()
    for (const e of expenses) {
      const monthKey = e.date.slice(0, 7)
      const cur = map.get(monthKey) ?? { total: 0, paid: 0, rows: [] }
      cur.total += Number(e.amount)
      if (e.paid) cur.paid += Number(e.amount)
      cur.rows.push(e)
      map.set(monthKey, cur)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [expenses])

  const filteredSubs = useMemo(() => {
    const withProfile = subs
      .map(s => ({ ...s, profile: profilesById[s.player_id] }))
      .filter(s => filter === 'all' || (filter === 'paid' ? s.paid : !s.paid))
    // Unpaid first, then alpha by surname.
    return withProfile.sort((a, b) =>
      (Number(a.paid) - Number(b.paid)) ||
      (a.profile?.surname ?? '').localeCompare(b.profile?.surname ?? '')
    )
  }, [subs, profilesById, filter])

  async function toggleSubPaid(sub: Subscription) {
    const nowIso = new Date().toISOString().slice(0, 10)
    await supabase.from('club_subscriptions').update({
      paid: !sub.paid,
      paid_at: !sub.paid ? nowIso : null,
    }).eq('id', sub.id)
    await load()
  }

  async function toggleExpensePaid(exp: Expense) {
    const nowIso = new Date().toISOString().slice(0, 10)
    await supabase.from('club_expenses').update({
      paid: !exp.paid,
      paid_at: !exp.paid ? nowIso : null,
    }).eq('id', exp.id)
    await load()
  }

  if (loading) return <div className="text-sm py-4" style={{ color: 'var(--color-text-muted)' }}>Loading club finances…</div>

  const netColor = summary.netBalance >= 0 ? 'var(--tt-green)' : 'var(--color-error-text)'
  const projColor = summary.projectedBalance >= 0 ? 'var(--tt-green)' : 'var(--color-error-text)'

  return (
    <div className="space-y-3">

      {/* Season selector */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>Season</p>
          <p className="font-display text-lg text-[var(--color-text)] leading-none mt-0.5">
            {season} · Apr → Mar
          </p>
        </div>
      </div>

      {/* Balance callout */}
      <div className="rounded-2xl p-4"
        style={{ background: 'var(--color-surface)', border: `1px solid ${netColor}` }}>
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-1"
          style={{ color: 'var(--color-text-muted)' }}>Cash in pot (income − expenses paid)</p>
        <p className="font-display text-4xl leading-none" style={{ color: netColor }}>
          {gbp(summary.netBalance)}
        </p>
        <div className="text-[11px] mt-3 space-y-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          <div className="flex justify-between"><span>Subs collected</span><span style={{ color: 'var(--tt-green)' }}>+{gbp(summary.collectedSubs)}</span></div>
          <div className="flex justify-between"><span>WTP collected</span><span style={{ color: 'var(--tt-green)' }}>+{gbp(summary.wtpPaid)}</span></div>
          <div className="flex justify-between"><span>Fines collected</span><span style={{ color: 'var(--tt-green)' }}>+{gbp(summary.finesPaid)}</span></div>
          {summary.otherIncome > 0 && (
            <div className="flex justify-between"><span>Other income</span><span style={{ color: 'var(--tt-green)' }}>+{gbp(summary.otherIncome)}</span></div>
          )}
          <div className="flex justify-between"><span>Expenses paid</span><span style={{ color: 'var(--color-error-text)' }}>−{gbp(summary.paidExpense)}</span></div>
        </div>
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-1"
            style={{ color: 'var(--color-text-muted)' }}>Projected end-of-season</p>
          <p className="text-sm font-semibold" style={{ color: projColor }}>
            {gbp(summary.projectedBalance)}
            <span className="ml-2 font-normal text-xs" style={{ color: 'var(--color-text-muted)' }}>
              (all income − all expenses)
            </span>
          </p>
        </div>
      </div>

      {/* ── Chase-up callout — only when there are unpaid subs ────── */}
      {chase && (
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          style={{
            background: 'var(--color-warning-bg)',
            border: '1px solid var(--color-warning-text)',
          }}>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: 'var(--color-warning-text)' }}>
              💷 Chase list · {season}
            </p>
            <p className="text-sm font-semibold mt-0.5"
              style={{ color: 'var(--color-text)' }}>
              {chase.count} unpaid · {gbp(chase.totalOwed)} owed
            </p>
            {chase.oldestIso && (
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Oldest chase since {format(new Date(chase.oldestIso), 'do MMM yyyy')}
              </p>
            )}
          </div>
          <button
            onClick={() => setFilter('unpaid')}
            className="flex-shrink-0 text-[11px] px-3 py-1.5 rounded-lg font-semibold"
            style={{
              background: 'var(--color-warning-text)',
              color: 'var(--color-surface)',
            }}>
            Show unpaid
          </button>
        </div>
      )}

      {/* ── Subscriptions ─────────────────────────────────────────── */}
      <div className="rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', backgroundClip: 'padding-box' }}>
        <div className="px-4 py-3 flex items-center justify-between gap-2"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--tt-yellow)' }}>
              💷 Subscriptions
            </p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {summary.subsPaidCount}/{subs.length} paid · {gbp(summary.outstandingSubs)} outstanding
            </p>
          </div>
          <div className="flex gap-1">
            {(['all', 'unpaid', 'paid'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wider transition-colors"
                style={{
                  background: filter === f ? 'var(--color-primary)' : 'transparent',
                  color: filter === f ? 'var(--color-surface)' : 'var(--color-text-muted)',
                  border: `1px solid ${filter === f ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          {filteredSubs.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Nothing to show.
            </div>
          ) : filteredSubs.map((s, i) => (
            <div key={s.id}
              className="flex items-center gap-2.5 px-3 py-2"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--color-border)' }}>
              {s.profile && <PlayerAvatar profile={s.profile} size={28} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate"
                  style={{ color: s.paid ? 'var(--color-text-muted)' : 'var(--color-text)' }}>
                  {s.profile ? `${s.profile.name} ${s.profile.surname}` : 'Unknown player'}
                </p>
                {s.paid && s.paid_at && (
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    Paid {format(new Date(s.paid_at + 'T12:00:00'), 'do MMM')}
                  </p>
                )}
              </div>
              <span className="text-sm font-bold tabular-nums"
                style={{ color: s.paid ? 'var(--tt-green)' : 'var(--color-warning-text)' }}>
                {gbp(Number(s.amount))}
              </span>
              <button onClick={() => toggleSubPaid(s)}
                className="text-[10px] px-2.5 py-1 rounded font-semibold flex-shrink-0"
                style={{
                  background: s.paid ? 'var(--color-success-bg)' : 'var(--color-primary)',
                  color: s.paid ? '#0D6B52' : 'var(--color-surface)',
                  border: `1px solid ${s.paid ? '#0D6B52' : 'var(--color-primary)'}`,
                }}>
                {s.paid ? '✓ Paid' : 'Mark Paid'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Expenses by month ─────────────────────────────────────── */}
      <div className="rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', backgroundClip: 'padding-box' }}>
        <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--tt-yellow)' }}>
              🏟️ Expenses by month
            </p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {expenses.length} row{expenses.length === 1 ? '' : 's'} this season · monthly pitch invoice + ad-hoc
            </p>
          </div>
          <button onClick={() => setAddingExpense(v => !v)}
            className="text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider"
            style={{ background: addingExpense ? 'var(--color-surface-2)' : 'var(--color-primary)',
                     color: addingExpense ? 'var(--color-text-muted)' : 'var(--color-surface)',
                     border: `1px solid ${addingExpense ? 'var(--color-border)' : 'var(--color-primary)'}` }}>
            {addingExpense ? 'Cancel' : '+ Add'}
          </button>
        </div>
        {addingExpense && (
          <AddExpenseForm
            onCancel={() => setAddingExpense(false)}
            onSaved={async () => { setAddingExpense(false); await load() }}
          />
        )}
        {expensesByMonth.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No expenses recorded this season.
          </div>
        ) : expensesByMonth.map(([monthKey, bucket]) => (
          <MonthGroup key={monthKey} monthKey={monthKey} bucket={bucket} onTogglePaid={toggleExpensePaid} />
        ))}
      </div>

      {/* Quick summary strip */}
      <div className="rounded-xl px-4 py-3 grid grid-cols-2 gap-3"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div>
          <p className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Potential income</p>
          <p className="text-base font-semibold" style={{ color: 'var(--tt-green)' }}>{gbpi(summary.potentialIncome)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Total expenses this season</p>
          <p className="text-base font-semibold" style={{ color: 'var(--color-error-text)' }}>{gbp(summary.totalExpense)}</p>
        </div>
      </div>
    </div>
  )
}

function AddExpenseForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState<Expense['category']>('pitch_hire')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [paid, setPaid] = useState(true)  // most expenses are entered after payment
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) { setError('Amount must be > 0'); return }
    setSaving(true); setError(null)
    const { error: e } = await supabase.from('club_expenses').insert({
      date, category, amount: n, notes: notes.trim() || null,
      paid, paid_at: paid ? date : null,
    })
    setSaving(false)
    if (e) { setError(e.message); return }
    onSaved()
  }

  return (
    <div className="px-4 py-3 space-y-2.5" style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="rounded-lg px-2 py-1.5 text-xs"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Category</span>
          <select value={category} onChange={e => setCategory(e.target.value as Expense['category'])}
            className="rounded-lg px-2 py-1.5 text-xs"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
            <option value="pitch_hire">Pitch hire</option>
            <option value="equipment">Equipment</option>
            <option value="food">Food / drinks</option>
            <option value="tournament">Tournament</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1" style={{ width: 90 }}>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Amount £</span>
          <input type="number" step="0.01" min="0" inputMode="decimal" value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="0.00"
            className="rounded-lg px-2 py-1.5 text-xs text-right tabular-nums"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Notes (optional)</span>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Aug pitch hire · 4 Thursdays × £67.80"
          className="rounded-lg px-2 py-1.5 text-xs"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
      </label>
      <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text)' }}>
        <input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />
        <span>Mark paid today (uncheck to log an upcoming expense)</span>
      </label>
      {error && <p className="text-xs" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving || !amount}
          className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: 'var(--color-surface)' }}>
          {saving ? 'Saving…' : 'Add expense'}
        </button>
        <button onClick={onCancel}
          className="px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function MonthGroup({ monthKey, bucket, onTogglePaid }: {
  monthKey: string
  bucket: { total: number; paid: number; rows: Expense[] }
  onTogglePaid: (e: Expense) => void
}) {
  const [open, setOpen] = useState(false)
  const [y, m] = monthKey.split('-').map(Number)
  const label = format(new Date(y, m - 1, 1), 'MMMM yyyy').toUpperCase()
  const owed = bucket.total - bucket.paid
  return (
    <div style={{ borderTop: '1px solid var(--color-border)' }}>
      <button onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
            {label}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {bucket.rows.length} row{bucket.rows.length === 1 ? '' : 's'} · £{bucket.paid.toFixed(2)} paid · £{owed.toFixed(2)} outstanding
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: 'var(--tt-yellow)' }}>
            £{bucket.total.toFixed(2)}
          </span>
          <span style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--color-border)' }}>
          {bucket.rows.map((r, i) => (
            <div key={r.id}
              className="flex items-center gap-2 px-4 py-2"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--color-border)' }}>
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                {r.category === 'pitch_hire' ? 'PITCH' : r.category.toUpperCase()}
              </span>
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text)' }}>
                {format(new Date(r.date + 'T12:00:00'), 'EEE do MMM')}
                {r.notes && !r.notes.startsWith('Auto-generated') && (
                  <span className="ml-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>· {r.notes}</span>
                )}
              </span>
              <span className="text-xs font-semibold tabular-nums"
                style={{ color: r.paid ? 'var(--color-text-muted)' : 'var(--color-error-text)' }}>
                £{Number(r.amount).toFixed(2)}
              </span>
              <button onClick={() => onTogglePaid(r)}
                className="text-[10px] px-2 py-0.5 rounded font-semibold flex-shrink-0"
                style={{
                  background: r.paid ? 'var(--color-success-bg)' : 'var(--color-primary)',
                  color: r.paid ? '#0D6B52' : 'var(--color-surface)',
                  border: `1px solid ${r.paid ? '#0D6B52' : 'var(--color-primary)'}`,
                }}>
                {r.paid ? '✓' : 'Pay'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
