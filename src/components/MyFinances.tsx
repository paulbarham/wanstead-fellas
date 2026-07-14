import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Profile, Fine, WtpGame, Credit } from '../types'
import { FINE_TYPES } from '../types'
import { getBlockDueDate, monthLabelOf } from '../lib/finance'

interface Props {
  profile: Profile
}

function monthKeyOf(matchDateStr: string): string { return matchDateStr.slice(0, 7) }

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

      {/* Payment history — audit trail grouped by month so the player can
          verify each charge before dropping a Revolut transfer. Shows every
          row (paid + unpaid) alongside the running month total. Collapsed
          by default so the "what do I owe now" view up top stays the star. */}
      {(paidFines.length > 0 || paidGames.length > 0 || unpaidFines.length > 0 || unpaidGames.length > 0) && (() => {
        // Group ALL rows (paid + unpaid, dated) by their match month.
        type HistoryRow =
          | { kind: 'wtp'; id: string; match_date: string; amount: number; paid: boolean }
          | { kind: 'fine'; id: string; match_date: string; amount: number; paid: boolean; type: Fine['type']; notes: string | null }
        const historyRows: HistoryRow[] = [
          ...wtpGames.map(g => ({ kind: 'wtp' as const, id: g.id, match_date: g.match_date, amount: Number(g.amount), paid: g.paid })),
          ...fines.filter(f => !!f.match_date).map(f => ({
            kind: 'fine' as const, id: f.id, match_date: f.match_date!, amount: Number(f.amount), paid: f.paid, type: f.type, notes: f.notes,
          })),
        ]
        const historyByMonth = new Map<string, HistoryRow[]>()
        for (const r of historyRows) {
          const k = r.match_date.slice(0, 7)
          if (!historyByMonth.has(k)) historyByMonth.set(k, [])
          historyByMonth.get(k)!.push(r)
        }
        const monthKeys = Array.from(historyByMonth.keys()).sort().reverse() // newest first
        const totalRows = historyRows.length

        return (
          <div>
            <button
              onClick={() => setShowPaid(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: '#9CA897' }}
            >
              <span>Payment history ({totalRows} · {monthKeys.length} month{monthKeys.length > 1 ? 's' : ''})</span>
              <span style={{ fontSize: '0.6rem' }}>{showPaid ? '▲' : '▼'}</span>
            </button>

            {showPaid && (
              <div className="mt-2 space-y-2">
                {monthKeys.map(k => {
                  const items = historyByMonth.get(k)!.sort((a, b) => b.match_date.localeCompare(a.match_date))
                  const monthTotal = items.reduce((s, r) => s + r.amount, 0)
                  const paidTotal = items.filter(r => r.paid).reduce((s, r) => s + r.amount, 0)
                  const unpaidTotal = monthTotal - paidTotal
                  return (
                    <div key={k} className="rounded-2xl overflow-hidden"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <div className="px-4 py-2.5" style={{ borderBottom: '1px solid #FFFFFF' }}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#9CA897' }}>
                            {monthLabelOf(k)}
                          </p>
                          <span className="text-xs tabular-nums" style={{ color: '#9CA897' }}>
                            {unpaidTotal > 0 && (
                              <span style={{ color: '#C9A227' }}>£{unpaidTotal.toFixed(2)} owed · </span>
                            )}
                            <span style={{ color: 'var(--color-primary)' }}>£{paidTotal.toFixed(2)} paid</span>
                          </span>
                        </div>
                      </div>
                      {items.map((r, i) => (
                        <div key={r.id} className="px-4 py-2 flex items-center justify-between"
                          style={{ borderTop: i > 0 ? '1px solid var(--color-border)' : 'none', opacity: r.paid ? 0.55 : 1 }}>
                          <div className="min-w-0 flex-1">
                            <span className="text-xs" style={{ color: r.paid ? '#9CA897' : '#ccc' }}>
                              {r.kind === 'wtp' ? 'WTP · ' : `${fineLabel(r.type)} · `}
                              {format(new Date(r.match_date + 'T12:00:00'), 'EEE do MMM')}
                            </span>
                            {r.kind === 'fine' && r.notes && (
                              <p className="text-[10px] mt-0.5 truncate" style={{ color: '#9CA897' }}>{r.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-xs tabular-nums" style={{ color: r.paid ? '#9CA897' : '#C9A227' }}>
                              £{r.amount.toFixed(2)}
                            </span>
                            {r.paid && (
                              <span className="text-[10px]" style={{ color: 'var(--color-primary)' }}>✓</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
