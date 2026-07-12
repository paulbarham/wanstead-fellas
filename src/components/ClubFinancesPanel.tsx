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
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const { first, last } = seasonBounds(season)
    const [{ data: subsData }, { data: expData }] = await Promise.all([
      supabase.from('club_subscriptions').select('*').eq('season', season).order('paid').order('created_at'),
      supabase.from('club_expenses').select('*').gte('date', first).lte('date', last).order('date', { ascending: false }),
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
    setLoading(false)
  }, [season])

  useEffect(() => { load() }, [load])

  const summary = useMemo(() => {
    const potentialIncome = subs.reduce((s, r) => s + Number(r.amount), 0)
    const collectedIncome = subs.filter(r => r.paid).reduce((s, r) => s + Number(r.amount), 0)
    const outstandingSubs = potentialIncome - collectedIncome
    const totalExpense    = expenses.reduce((s, r) => s + Number(r.amount), 0)
    const paidExpense     = expenses.filter(r => r.paid).reduce((s, r) => s + Number(r.amount), 0)
    const netBalance      = collectedIncome - paidExpense
    const projectedBalance = potentialIncome - totalExpense
    const subsPaidCount   = subs.filter(r => r.paid).length
    return { potentialIncome, collectedIncome, outstandingSubs, totalExpense, paidExpense, netBalance, projectedBalance, subsPaidCount }
  }, [subs, expenses])

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
          style={{ color: 'var(--color-text-muted)' }}>Cash position (paid − paid)</p>
        <p className="font-display text-4xl leading-none" style={{ color: netColor }}>
          {gbp(summary.netBalance)}
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          <span style={{ color: 'var(--tt-green)' }}>{gbp(summary.collectedIncome)}</span> subs collected
          {' · '}
          <span style={{ color: 'var(--color-error-text)' }}>{gbp(summary.paidExpense)}</span> expenses paid
        </p>
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-1"
            style={{ color: 'var(--color-text-muted)' }}>Projected end-of-season</p>
          <p className="text-sm font-semibold" style={{ color: projColor }}>
            {gbp(summary.projectedBalance)}
            <span className="ml-2 font-normal text-xs" style={{ color: 'var(--color-text-muted)' }}>
              (all subs collected − all expenses)
            </span>
          </p>
        </div>
      </div>

      {/* ── Subscriptions ─────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
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
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--tt-yellow)' }}>
            🏟️ Expenses by month
          </p>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Pitch hire auto-generates £{Number(70.17).toFixed(2)} per match ({expenses.length} row{expenses.length === 1 ? '' : 's'} this season)
          </p>
        </div>
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
