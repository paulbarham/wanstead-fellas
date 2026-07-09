import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Profile, Fine, WtpGame, Credit } from '../types'
import { FINE_TYPES } from '../types'

interface Props {
  profile: Profile
}

// Mirrors v_blocked_players' block window: grace ends 16 days after the last
// Thursday of the debt's month. Returns null for pre-Jun 2026 debts (excluded
// from the block logic by the same view).
function getBlockDueDate(matchDateStr: string): Date | null {
  if (matchDateStr < '2026-06-01') return null
  const [y, m] = matchDateStr.split('-').map(Number)
  // Last day of month (m is 1-indexed here — new Date(y, m, 0) → last day of month m)
  const lastDay = new Date(y, m, 0)
  // Walk back to Thursday (Sun=0…Thu=4…Sat=6)
  const daysBack = (lastDay.getDay() + 7 - 4) % 7
  const dueAt = new Date(y, m - 1, lastDay.getDate() - daysBack)
  dueAt.setDate(dueAt.getDate() + 16)
  return dueAt
}

// Human-friendly month key & label
function monthKeyOf(matchDateStr: string): string { return matchDateStr.slice(0, 7) }
function monthLabelOf(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return format(new Date(y, m - 1, 1), 'MMMM yyyy').toUpperCase()
}

type DebtItem =
  | { kind: 'wtp'; id: string; match_date: string; amount: number }
  | { kind: 'fine'; id: string; match_date: string; amount: number; type: Fine['type']; notes: string | null }

export default function MyFinances({ profile }: Props) {
  const [fines, setFines] = useState<Fine[]>([])
  const [wtpGames, setWtpGames] = useState<WtpGame[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [loading, setLoading] = useState(true)
  const [showPaid, setShowPaid] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: f }, { data: g }, { data: c }] = await Promise.all([
        supabase.from('fines').select('*').eq('player_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('wtp_games').select('*').eq('player_id', profile.id).order('match_date', { ascending: false }),
        supabase.from('credits').select('*').eq('player_id', profile.id).order('created_at', { ascending: false }),
      ])
      setFines((f as Fine[]) || [])
      setWtpGames((g as WtpGame[]) || [])
      setCredits((c as Credit[]) || [])
      setLoading(false)
    }
    load()
  }, [profile.id])

  const now = new Date()
  const unpaidFines = fines.filter(f => !f.paid)
  const unpaidGames = wtpGames.filter(g => !g.paid)
  const paidFines = fines.filter(f => f.paid)
  const paidGames = wtpGames.filter(g => g.paid)

  const grossOwed = unpaidFines.reduce((s, f) => s + Number(f.amount), 0)
    + unpaidGames.reduce((s, g) => s + Number(g.amount), 0)
  const creditBalance = credits.reduce((s, c) => s + Number(c.amount), 0)
  // Net = what you actually owe right now. Negative means you're in credit.
  const netBalance = grossOwed - creditBalance
  const inCredit = netBalance < 0
  const allSquare = netBalance === 0
  const owes = netBalance > 0

  // Merge unpaid WTPs + unpaid fines-with-match-date, group by their match's
  // month. Fines without match_date fall into a separate "no-date" bucket at
  // the bottom (rare — usually admin fines added ad-hoc).
  const datedDebts: DebtItem[] = [
    ...unpaidGames.map(g => ({ kind: 'wtp' as const, id: g.id, match_date: g.match_date, amount: Number(g.amount) })),
    ...unpaidFines.filter(f => !!f.match_date).map(f => ({
      kind: 'fine' as const, id: f.id, match_date: f.match_date!, amount: Number(f.amount), type: f.type, notes: f.notes,
    })),
  ]
  const undatedFines = unpaidFines.filter(f => !f.match_date)

  const byMonth = new Map<string, DebtItem[]>()
  for (const d of datedDebts) {
    const k = monthKeyOf(d.match_date)
    if (!byMonth.has(k)) byMonth.set(k, [])
    byMonth.get(k)!.push(d)
  }
  const sortedMonths = Array.from(byMonth.keys()).sort()

  // Build per-month rollup with block-due date + status.
  const monthRollups = sortedMonths.map(k => {
    const items = byMonth.get(k)!.sort((a, b) => a.match_date.localeCompare(b.match_date))
    const total = items.reduce((s, d) => s + d.amount, 0)
    // All debts in a month share the same block-due date (last Thu + 16 days).
    const dueAt = getBlockDueDate(items[0].match_date)
    const daysUntilDue = dueAt ? Math.ceil((dueAt.getTime() - now.getTime()) / 86400000) : null
    const status: 'immune' | 'past-due' | 'due-soon' | 'safe' =
      dueAt === null ? 'immune'
      : daysUntilDue! < 0 ? 'past-due'
      : daysUntilDue! <= 7 ? 'due-soon'
      : 'safe'
    return { monthKey: k, items, total, dueAt, daysUntilDue, status }
  })

  // "Pay this to stay unblocked" = sum of past-due + due-soon months, capped
  // by credit. Immune months excluded (they never trigger a block).
  const mustPayGross = monthRollups
    .filter(r => r.status === 'past-due' || r.status === 'due-soon')
    .reduce((s, r) => s + r.total, 0)
  const mustPayNet = Math.max(0, mustPayGross - creditBalance)
  const earliestDueMonth = monthRollups.find(r => r.status === 'past-due' || r.status === 'due-soon')

  const fineLabel = (type: Fine['type']) =>
    FINE_TYPES.find(t => t.value === type)?.label ?? type

  if (loading) {
    return (
      <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-xs uppercase tracking-widest mb-3 font-semibold" style={{ color: '#9CA897' }}>My Finances</p>
        <p className="text-sm" style={{ color: '#9CA897' }}>Loading…</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>My Finances</p>

      {/* Balance hero — three states:
            owes     → red, "Outstanding Balance"
            allSquare → green, "All Clear ✓"
            inCredit → bright green, "In Credit" with credit £ */}
      {(() => {
        const tone = owes ? '#DC2626' : 'var(--color-primary)'
        const bg = owes ? '#1a0a0a' : inCredit ? 'rgba(74,220,122,0.10)' : 'var(--color-success-bg)'
        const border = owes ? 'var(--color-error-border)' : 'var(--color-primary)'
        const label = owes ? 'Outstanding Balance' : inCredit ? 'In Credit' : 'Balance'
        const display = owes ? `£${netBalance.toFixed(2)}`
          : inCredit ? `£${Math.abs(netBalance).toFixed(2)}`
          : '£0.00'
        return (
          <div className="p-4 rounded-2xl text-center"
            style={{ background: bg, border: `1px solid ${border}` }}>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: tone }}>{label}</p>
            <p className="font-display text-5xl leading-none" style={{ color: tone }}>{display}</p>
            {allSquare && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-primary)' }}>All clear ✓</p>
            )}
            {inCredit && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-primary)' }}>
                ✓ You're paid up · we owe you {`£${Math.abs(netBalance).toFixed(2)}`}
              </p>
            )}
            {owes && creditBalance > 0 && (
              <p className="text-xs mt-2" style={{ color: '#C9A227' }}>
                {`£${grossOwed.toFixed(2)} owed · £${creditBalance.toFixed(2)} credit applied`}
              </p>
            )}
            <p className="text-xs mt-3" style={{ color: '#9CA897' }}>
              Payment due after the last Thursday of each month
            </p>
          </div>
        )
      })()}

      {/* Pay-this-to-stay-unblocked callout — surfaces the exact £ + date
          for the earliest at-risk month, so the player knows what to pay
          now and can safely ignore later months. */}
      {mustPayNet > 0 && earliestDueMonth && (
        <div className="p-4 rounded-2xl"
          style={{
            background: earliestDueMonth.status === 'past-due' ? '#1a0a0a' : 'rgba(201,162,39,0.10)',
            border: `1px solid ${earliestDueMonth.status === 'past-due' ? 'var(--color-error-border)' : 'var(--color-warning-text)'}`,
          }}>
          <p className="text-xs uppercase tracking-widest font-semibold mb-1"
            style={{ color: earliestDueMonth.status === 'past-due' ? 'var(--color-error-text)' : 'var(--color-warning-text)' }}>
            {earliestDueMonth.status === 'past-due' ? '⛔ Sign-ups locked' : '⚠ Pay this now to stay unblocked'}
          </p>
          <p className="font-display text-3xl leading-none"
            style={{ color: earliestDueMonth.status === 'past-due' ? 'var(--color-error-text)' : 'var(--color-warning-text)' }}>
            £{mustPayNet.toFixed(2)}
          </p>
          <p className="text-xs mt-2" style={{ color: '#9CA897' }}>
            {earliestDueMonth.status === 'past-due'
              ? `${monthLabelOf(earliestDueMonth.monthKey)} balance is past its due date${earliestDueMonth.dueAt ? ` (${format(earliestDueMonth.dueAt, 'do MMM')})` : ''}. Settle up with admin to unlock sign-ups.`
              : `Settle the ${monthLabelOf(earliestDueMonth.monthKey).split(' ')[0]} balance before ${earliestDueMonth.dueAt ? format(earliestDueMonth.dueAt, 'EEE do MMM') : 'the due date'} — later months aren't due yet.`}
          </p>
        </div>
      )}

      {/* Outstanding by month — one card per month, with the block-due date on
          each header so it's obvious which one is next to trip. */}
      {monthRollups.map(r => {
        const tint = r.status === 'past-due' ? 'var(--color-error-text)'
          : r.status === 'due-soon' ? 'var(--color-warning-text)'
          : '#9CA897'
        const border = r.status === 'past-due' ? 'var(--color-error-border)'
          : r.status === 'due-soon' ? 'var(--color-warning-text)'
          : 'var(--color-border)'
        return (
          <div key={r.monthKey} className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-surface)', border: `1px solid ${border}` }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #FFFFFF' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: tint }}>
                    {monthLabelOf(r.monthKey)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#9CA897' }}>
                    {r.status === 'immune'
                      ? 'Legacy — not counted toward blocks'
                      : r.status === 'past-due'
                        ? `Past due${r.dueAt ? ` since ${format(r.dueAt, 'do MMM')}` : ''}`
                        : r.dueAt ? `Due by ${format(r.dueAt, 'EEE do MMM')}` : ''}
                  </p>
                </div>
                <span className="text-lg font-semibold" style={{ color: tint }}>
                  £{r.total.toFixed(2)}
                </span>
              </div>
            </div>
            {r.items.map((d, i) => (
              <div key={d.id} className="px-4 py-2.5 flex items-center justify-between"
                style={{ borderTop: i > 0 ? '1px solid #FFFFFF' : 'none' }}>
                <div className="min-w-0">
                  <span className="text-sm" style={{ color: '#ccc' }}>
                    {d.kind === 'wtp' ? 'WTP · ' : `${fineLabel(d.type)} · `}
                    {format(new Date(d.match_date + 'T12:00:00'), 'EEE do MMM')}
                  </span>
                  {d.kind === 'fine' && d.notes && (
                    <p className="text-xs mt-0.5" style={{ color: '#9CA897' }}>{d.notes}</p>
                  )}
                </div>
                <span className="text-sm font-semibold" style={{ color: '#C9A227' }}>
                  £{d.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )
      })}

      {/* Un-dated fines (rare) — flat list, no month grouping possible */}
      {undatedFines.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #FFFFFF' }}>
            <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#9CA897' }}>Other fines</p>
          </div>
          {undatedFines.map((f, i) => (
            <div key={f.id} className="px-4 py-2.5 flex items-center justify-between"
              style={{ borderTop: i > 0 ? '1px solid #FFFFFF' : 'none' }}>
              <div>
                <span className="text-sm" style={{ color: '#ccc' }}>{fineLabel(f.type)}</span>
                {f.notes && <p className="text-xs mt-0.5" style={{ color: '#9CA897' }}>{f.notes}</p>}
              </div>
              <span className="text-sm font-semibold" style={{ color: '#C9A227' }}>£{Number(f.amount).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Credits — visible whenever the player has any credit on file. */}
      {credits.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--tt-green)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--tt-green)' }}>
                Credit Balance
              </p>
              <span className="text-base font-bold" style={{ color: 'var(--tt-green)' }}>
                +£{creditBalance.toFixed(2)}
              </span>
            </div>
          </div>
          {credits.map((c, i) => (
            <div key={c.id} className="px-4 py-2.5"
              style={{ borderTop: i > 0 ? '1px solid var(--color-border)' : 'none' }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium" style={{ color: '#ccc' }}>
                    {c.notes || 'Credit'}
                  </span>
                  <p className="text-xs mt-0.5" style={{ color: '#9CA897' }}>
                    {format(new Date(c.created_at), 'EEE do MMM yyyy')}
                  </p>
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--tt-green)' }}>
                  +£{Number(c.amount).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Outstanding fines */}
      {unpaidFines.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #FFFFFF' }}>
            <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#9CA897' }}>
              Outstanding Fines
            </p>
          </div>
          {unpaidFines.map((f, i) => (
            <div key={f.id} className="px-4 py-2.5"
              style={{ borderTop: i > 0 ? '1px solid #FFFFFF' : 'none' }}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-[var(--color-text)]">{fineLabel(f.type)}</span>
                  {f.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{f.notes}</p>}
                  {f.match_date && (
                    <p className="text-xs mt-0.5" style={{ color: '#9CA897' }}>
                      {format(new Date(f.match_date + 'T12:00:00'), 'EEE do MMM yyyy')}
                    </p>
                  )}
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--color-error-text)' }}>
                  £{Number(f.amount).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {unpaidFines.length === 0 && unpaidGames.length === 0 && grossOwed === 0 && (
        <div className="px-4 py-3 rounded-2xl text-sm text-center" style={{ color: '#9CA897', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          No outstanding items
        </div>
      )}

      {/* Paid items toggle */}
      {(paidFines.length > 0 || paidGames.length > 0) && (
        <div>
          <button
            onClick={() => setShowPaid(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: '#9CA897' }}
          >
            <span>Paid items ({paidFines.length + paidGames.length})</span>
            <span style={{ fontSize: '0.6rem' }}>{showPaid ? '▲' : '▼'}</span>
          </button>

          {showPaid && (
            <div className="mt-2 rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', opacity: 0.6 }}>
              {paidGames.map((g, i) => (
                <div key={g.id} className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderTop: i > 0 ? '1px solid #FFFFFF' : 'none' }}>
                  <div>
                    <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>WTP Game</span>
                    <p className="text-xs" style={{ color: '#9CA897' }}>
                      {format(new Date(g.match_date + 'T12:00:00'), 'EEE do MMM yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: '#9CA897' }}>£{Number(g.amount).toFixed(2)}</span>
                    <span className="text-xs" style={{ color: 'var(--color-primary)' }}>✓ paid</span>
                  </div>
                </div>
              ))}
              {paidFines.map((f, i) => (
                <div key={f.id} className="px-4 py-2.5"
                  style={{ borderTop: (i > 0 || paidGames.length > 0) ? '1px solid #FFFFFF' : 'none' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{fineLabel(f.type)}</span>
                      {f.match_date && (
                        <p className="text-xs" style={{ color: '#9CA897' }}>
                          {format(new Date(f.match_date + 'T12:00:00'), 'EEE do MMM yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: '#9CA897' }}>£{Number(f.amount).toFixed(2)}</span>
                      <span className="text-xs" style={{ color: 'var(--color-primary)' }}>✓ paid</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
