import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Profile, Fine, WtpGame } from '../types'
import { FINE_TYPES } from '../types'

interface Props {
  profile: Profile
}

export default function MyFinances({ profile }: Props) {
  const [fines, setFines] = useState<Fine[]>([])
  const [wtpGames, setWtpGames] = useState<WtpGame[]>([])
  const [loading, setLoading] = useState(true)
  const [showPaid, setShowPaid] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: f }, { data: g }] = await Promise.all([
        supabase.from('fines').select('*').eq('player_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('wtp_games').select('*').eq('player_id', profile.id).order('match_date', { ascending: false }),
      ])
      setFines((f as Fine[]) || [])
      setWtpGames((g as WtpGame[]) || [])
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

  const totalOwed = unpaidFines.reduce((s, f) => s + Number(f.amount), 0)
    + unpaidGames.reduce((s, g) => s + Number(g.amount), 0)

  const fineLabel = (type: Fine['type']) =>
    FINE_TYPES.find(t => t.value === type)?.label ?? type

  if (loading) {
    return (
      <div className="p-4 rounded-2xl" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
        <p className="text-xs uppercase tracking-widest mb-3 font-semibold" style={{ color: '#555' }}>My Finances</p>
        <p className="text-sm" style={{ color: '#555' }}>Loading…</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: '#0D6B52' }}>My Finances</p>

      {/* Outstanding balance */}
      <div className="p-4 rounded-2xl text-center"
        style={{
          background: totalOwed > 0 ? '#1a0a0a' : '#0a1a10',
          border: `1px solid ${totalOwed > 0 ? '#5a1a1a' : '#0D6B52'}`,
        }}>
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: totalOwed > 0 ? '#ff6b6b' : '#0D6B52' }}>
          Outstanding Balance
        </p>
        <p className="font-display text-5xl leading-none" style={{ color: totalOwed > 0 ? '#ff6b6b' : '#4ade80' }}>
          £{totalOwed.toFixed(2)}
        </p>
        {totalOwed === 0 && (
          <p className="text-xs mt-2" style={{ color: '#0D6B52' }}>All clear ✓</p>
        )}
        <p className="text-xs mt-3" style={{ color: '#555' }}>
          Payment due after the last Thursday of each month
        </p>
      </div>

      {/* This month's WTP games */}
      {profile.player_type === 'wtp' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <div className="px-4 py-3" style={{ borderBottom: thisMonthGames.length > 0 ? '1px solid #1e1e1e' : 'none' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#555' }}>
                WTP Games This Month
              </p>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl" style={{ color: '#C9A227' }}>{thisMonthGames.length}</span>
                <span className="text-xs" style={{ color: '#666' }}>
                  £{thisMonthGames.reduce((s, g) => s + Number(g.amount), 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
          {thisMonthGames.map((g, i) => (
            <div key={g.id} className="px-4 py-2.5 flex items-center justify-between"
              style={{ borderTop: i > 0 ? '1px solid #1e1e1e' : 'none' }}>
              <span className="text-sm" style={{ color: g.paid ? '#555' : '#ccc' }}>
                {format(new Date(g.match_date + 'T12:00:00'), 'EEE do MMM')}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: g.paid ? '#555' : '#C9A227' }}>
                  £{Number(g.amount).toFixed(2)}
                </span>
                {g.paid && <span className="text-xs" style={{ color: '#555' }}>paid</span>}
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

      {/* Outstanding fines */}
      {unpaidFines.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e1e1e' }}>
            <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#555' }}>
              Outstanding Fines
            </p>
          </div>
          {unpaidFines.map((f, i) => (
            <div key={f.id} className="px-4 py-2.5"
              style={{ borderTop: i > 0 ? '1px solid #1e1e1e' : 'none' }}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-white">{fineLabel(f.type)}</span>
                  {f.notes && <p className="text-xs mt-0.5" style={{ color: '#666' }}>{f.notes}</p>}
                  {f.match_date && (
                    <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                      {format(new Date(f.match_date + 'T12:00:00'), 'EEE do MMM yyyy')}
                    </p>
                  )}
                </div>
                <span className="text-sm font-semibold" style={{ color: '#ff6b6b' }}>
                  £{Number(f.amount).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {unpaidFines.length === 0 && unpaidGames.length === 0 && totalOwed === 0 && (
        <div className="px-4 py-3 rounded-2xl text-sm text-center" style={{ color: '#555', background: '#141414', border: '1px solid #2e2e2e' }}>
          No outstanding items
        </div>
      )}

      {/* Paid items toggle */}
      {(paidFines.length > 0 || paidGames.length > 0) && (
        <div>
          <button
            onClick={() => setShowPaid(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm"
            style={{ background: '#141414', border: '1px solid #2e2e2e', color: '#555' }}
          >
            <span>Paid items ({paidFines.length + paidGames.length})</span>
            <span style={{ fontSize: '0.6rem' }}>{showPaid ? '▲' : '▼'}</span>
          </button>

          {showPaid && (
            <div className="mt-2 rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid #2e2e2e', opacity: 0.6 }}>
              {paidGames.map((g, i) => (
                <div key={g.id} className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderTop: i > 0 ? '1px solid #1e1e1e' : 'none' }}>
                  <div>
                    <span className="text-sm" style={{ color: '#888' }}>WTP Game</span>
                    <p className="text-xs" style={{ color: '#555' }}>
                      {format(new Date(g.match_date + 'T12:00:00'), 'EEE do MMM yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: '#555' }}>£{Number(g.amount).toFixed(2)}</span>
                    <span className="text-xs" style={{ color: '#0D6B52' }}>✓ paid</span>
                  </div>
                </div>
              ))}
              {paidFines.map((f, i) => (
                <div key={f.id} className="px-4 py-2.5"
                  style={{ borderTop: (i > 0 || paidGames.length > 0) ? '1px solid #1e1e1e' : 'none' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm" style={{ color: '#888' }}>{fineLabel(f.type)}</span>
                      {f.match_date && (
                        <p className="text-xs" style={{ color: '#555' }}>
                          {format(new Date(f.match_date + 'T12:00:00'), 'EEE do MMM yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: '#555' }}>£{Number(f.amount).toFixed(2)}</span>
                      <span className="text-xs" style={{ color: '#0D6B52' }}>✓ paid</span>
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
