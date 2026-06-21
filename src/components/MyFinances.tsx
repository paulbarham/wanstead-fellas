import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Profile, Fine, WtpGame, Credit } from '../types'
import { FINE_TYPES } from '../types'

interface Props {
  profile: Profile
}

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
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const thisMonthGames = wtpGames.filter(g => g.match_date >= thisMonthStart && g.match_date <= thisMonthEnd)
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

      {/* This month's WTP games */}
      {(profile.player_type === 'wtp' || profile.player_type === 'wtp_priority') && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: thisMonthGames.length > 0 ? '1px solid #FFFFFF' : 'none' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#9CA897' }}>
                WTP Games This Month
              </p>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl" style={{ color: 'var(--color-warning-text)' }}>{thisMonthGames.length}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  £{thisMonthGames.reduce((s, g) => s + Number(g.amount), 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
          {thisMonthGames.map((g, i) => (
            <div key={g.id} className="px-4 py-2.5 flex items-center justify-between"
              style={{ borderTop: i > 0 ? '1px solid #FFFFFF' : 'none' }}>
              <span className="text-sm" style={{ color: g.paid ? '#555' : '#ccc' }}>
                {format(new Date(g.match_date + 'T12:00:00'), 'EEE do MMM')}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: g.paid ? '#555' : '#C9A227' }}>
                  £{Number(g.amount).toFixed(2)}
                </span>
                {g.paid && <span className="text-xs" style={{ color: '#9CA897' }}>paid</span>}
              </div>
            </div>
          ))}
          {thisMonthGames.length === 0 && (
            <div className="px-4 py-2.5">
              <p className="text-sm" style={{ color: '#444' }}>No games recorded this month</p>
            </div>
          )}
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
