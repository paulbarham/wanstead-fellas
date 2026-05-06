import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Profile, Availability, FineType } from '../types'
import { FINE_TYPES } from '../types'
import { getNextThursdayDate, getMatchPhase, formatCountdown } from '../lib/time'
import PlayerAvatar from '../components/PlayerAvatar'
import PlayerTypeBadge from '../components/PlayerTypeBadge'
import InstallBanner from '../components/InstallBanner'

const SIGNUP_CAP = 32

export default function TonightPage() {
  const { profile } = useAuth()
  const [nextThursday, setNextThursday] = useState(() => getNextThursdayDate())
  const [phase, setPhase] = useState(() => getMatchPhase(nextThursday))
  const [countdown, setCountdown] = useState(() => formatCountdown(nextThursday))
  const [availability, setAvailability] = useState<Availability[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [fineModal, setFineModal] = useState<{ player: Profile } | null>(null)
  const [fineType, setFineType] = useState<FineType>('late')
  const [issuingFine, setIssuingFine] = useState(false)

  const confirmedAvail = availability.filter(a => a.status !== 'waiting')
  const waitingAvail = availability.filter(a => a.status === 'waiting')

  const myEntry = availability.find(a => a.player_id === profile?.id)
  const isIn = myEntry?.status === 'confirmed'
  const isWaiting = myEntry?.status === 'waiting'
  const signedUpCount = confirmedAvail.length

  const fetchData = useCallback(async () => {
    const [{ data: avail }, { data: profs }] = await Promise.all([
      supabase.from('availability').select('*').eq('match_date', nextThursday),
      supabase.from('profiles').select('id, name, surname, photo_url, overall_rating, badges, player_type'),
    ])
    setAvailability((avail as Availability[]) || [])
    setPlayers((profs as Profile[]) || [])
    setLoading(false)
  }, [nextThursday])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const interval = setInterval(() => {
      const thu = getNextThursdayDate()
      setNextThursday(thu)
      setPhase(getMatchPhase(thu))
      setCountdown(formatCountdown(thu))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  async function toggleAvailability() {
    if (!profile) return
    if (!profile.is_admin && phase === 'signup_locked') return
    if (!profile.is_admin && phase === 'match_live') return
    setToggling(true)

    if (myEntry) {
      // Drop out
      await supabase.from('availability').delete().eq('id', myEntry.id)

      // If they were confirmed, auto-promote first waiting player (FIFO)
      if (myEntry.status === 'confirmed') {
        const firstWaiting = [...waitingAvail]
          .filter(a => a.player_id !== profile.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]
        if (firstWaiting) {
          await supabase.from('availability').update({ status: 'confirmed' }).eq('id', firstWaiting.id)
        }
      }
    } else {
      // Sign up
      const playerType = profile.player_type ?? 'wtp'

      if (profile.is_admin || signedUpCount < SIGNUP_CAP) {
        await supabase.from('availability').insert({ player_id: profile.id, match_date: nextThursday, status: 'confirmed' })
      } else if (playerType === 'wtp') {
        // Regular WTP: waitlist
        await supabase.from('availability').insert({ player_id: profile.id, match_date: nextThursday, status: 'waiting' })
      } else {
        // Subscribed / WTP Priority: bump last confirmed WTP player (LIFO)
        const confirmedWtp = confirmedAvail
          .filter(a => {
            const p = players.find(pl => pl.id === a.player_id)
            return (p?.player_type ?? 'wtp') === 'wtp'
          })
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        if (confirmedWtp.length > 0) {
          const toBump = confirmedWtp[0]
          await supabase.from('availability').update({ status: 'waiting' }).eq('id', toBump.id)
          await supabase.from('availability').insert({ player_id: profile.id, match_date: nextThursday, status: 'confirmed' })
        } else {
          // No WTP to bump — waitlist
          await supabase.from('availability').insert({ player_id: profile.id, match_date: nextThursday, status: 'waiting' })
        }
      }
    }

    await fetchData()
    setToggling(false)
  }

  async function adminTogglePlayer(playerId: string) {
    if (!profile?.is_admin) return
    const existing = availability.find(a => a.player_id === playerId)
    if (existing) {
      await supabase.from('availability').delete().eq('id', existing.id)
    } else {
      await supabase.from('availability').insert({ player_id: playerId, match_date: nextThursday, status: 'confirmed' })
    }
    await fetchData()
  }

  async function issueFine() {
    if (!fineModal) return
    setIssuingFine(true)
    const ft = FINE_TYPES.find(t => t.value === fineType)!
    await supabase.from('fines').insert({
      player_id: fineModal.player.id,
      type: fineType,
      amount: ft.amount,
      match_date: nextThursday,
    })
    setFineModal(null)
    setIssuingFine(false)
  }

  const signedUpPlayers = players.filter(p => confirmedAvail.some(a => a.player_id === p.id))
  const waitingPlayers = players.filter(p => waitingAvail.some(a => a.player_id === p.id))
  const notSignedUp = players.filter(p => !availability.some(a => a.player_id === p.id))

  const dateLabel = (() => {
    const [y, m, d] = nextThursday.split('-').map(Number)
    return format(new Date(y, m - 1, d), 'EEEE do MMMM')
  })()

  const canToggle = profile?.is_admin || (phase === 'signup_open' || phase === 'post_match')
  const formatLabel = signedUpCount >= 22 ? '11v11' : '4-Team Tournament'

  return (
    <div className="px-4 pt-4 pb-4">

      <InstallBanner />

      {/* Date + countdown inline */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest mb-0.5" style={{ color: '#0D6B52' }}>
            Next Match
          </p>
          <h1 className="font-display text-2xl text-white tracking-wide leading-tight">{dateLabel}</h1>
        </div>
        {(phase === 'signup_open' || phase === 'signup_locked') && (
          <div className="text-right flex-shrink-0 ml-3">
            <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#555' }}>Kick-off</p>
            <p className="font-display text-lg text-white tabular-nums leading-tight">{countdown}</p>
          </div>
        )}
      </div>

      {/* Phase banners */}
      {phase === 'post_match' && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium text-center"
          style={{ background: '#0a1a10', color: '#0D6B52', border: '1px solid #0D6B52' }}>
          Sign-ups for next week are now open! ⚽
        </div>
      )}
      {phase === 'signup_locked' && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium text-center"
          style={{ background: '#1a1000', color: '#C9A227', border: '1px solid #C9A227' }}>
          🔒 Sign-ups locked — see you Thursday!
        </div>
      )}
      {phase === 'match_live' && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium text-center"
          style={{ background: '#0a1a10', color: '#4ade80', border: '1px solid #4ade80' }}>
          🟢 Match is on right now!
        </div>
      )}

      {/* Count + format bar */}
      <div className="flex items-center mb-3 px-4 py-3 rounded-2xl"
        style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
        <div className="flex items-baseline gap-2 flex-1">
          <span className="font-display text-5xl leading-none" style={{ color: '#0D6B52' }}>{signedUpCount}</span>
          <span className="text-xs" style={{ color: '#555' }}>signed up</span>
          {signedUpCount >= SIGNUP_CAP && (
            <span className="text-xs font-semibold" style={{ color: '#ff6b6b' }}>FULL</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#1a1a1a', border: '1px solid #2e2e2e' }}>
          <span className="text-sm">⚽</span>
          <span className="text-xs font-semibold text-white">{formatLabel}</span>
        </div>
      </div>

      {/* In/Out toggle */}
      <div className="mb-4">
        {canToggle ? (
          <button
            onClick={toggleAvailability}
            disabled={toggling}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-all disabled:opacity-50 active:scale-[0.98]"
            style={{
              background: isWaiting ? '#1a1300' : isIn ? '#0a1a10' : '#0D6B52',
              color: isWaiting ? '#C9A227' : isIn ? '#4ade80' : 'white',
              border: isWaiting ? '2px solid #C9A227' : isIn ? '2px solid #4ade80' : '2px solid transparent',
            }}
          >
            {toggling ? '…' : isWaiting ? '⏳ On Waiting List — Tap to Remove' : isIn ? "✓ I'm In — Tap to Drop Out" : 'Mark Me In'}
          </button>
        ) : (
          <div className="w-full py-3 rounded-2xl text-center font-medium text-xs"
            style={{ background: '#141414', color: '#666', border: '1px solid #2e2e2e' }}>
            {phase === 'signup_locked' ? '🔒 Sign-ups are closed' : 'Sign-ups re-open after Thursday 10pm'}
          </div>
        )}
      </div>

      {/* Who's In */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#555' }}>Who's In</p>
          {signedUpPlayers.length > 0 && (
            <span className="text-xs" style={{ color: '#3a3a3a' }}>
              {signedUpPlayers.length} {signedUpPlayers.length === 1 ? 'player' : 'players'}
            </span>
          )}
        </div>
        {loading ? (
          <div className="text-sm py-2" style={{ color: '#555' }}>Loading…</div>
        ) : signedUpPlayers.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: '#444' }}>
            No one signed up yet — be first!
          </p>
        ) : (
          <div className="space-y-1.5">
            {signedUpPlayers.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{
                  background: p.id === profile?.id ? '#0a1a10' : '#141414',
                  border: `1px solid ${p.id === profile?.id ? '#0D6B52' : '#2e2e2e'}`,
                }}
              >
                <PlayerAvatar profile={p} size={32} />
                <span className="flex-1 text-sm font-medium text-white">
                  {p.name} {p.surname}
                  {p.id === profile?.id && (
                    <span className="ml-1.5 text-xs" style={{ color: '#0D6B52' }}>you</span>
                  )}
                </span>
                <PlayerTypeBadge type={p.player_type ?? 'wtp'} />
                {profile?.is_admin && (
                  <button
                    onClick={() => { setFineModal({ player: p }); setFineType('late') }}
                    className="text-xs px-2 py-0.5 rounded-lg ml-1"
                    style={{ color: '#C9A227', border: '1px solid #3a2a00' }}
                  >
                    £
                  </button>
                )}
                {profile?.is_admin && p.id !== profile.id && (
                  <button
                    onClick={() => adminTogglePlayer(p.id)}
                    className="text-xs px-2 py-0.5 rounded-lg"
                    style={{ color: '#ff6b6b', border: '1px solid #5a1a1a' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Waiting list */}
      {waitingPlayers.length > 0 && (
        <div className="mb-4">
          <p className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: '#555' }}>
            Waiting List ({waitingPlayers.length})
          </p>
          <div className="space-y-1.5">
            {waitingPlayers.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{
                  background: p.id === profile?.id ? '#1a1300' : '#141414',
                  border: `1px solid ${p.id === profile?.id ? '#C9A227' : '#2e2e2e'}`,
                }}
              >
                <span className="text-xs w-4 text-center" style={{ color: '#555' }}>{i + 1}</span>
                <PlayerAvatar profile={p} size={28} />
                <span className="flex-1 text-sm font-medium" style={{ color: '#888' }}>
                  {p.name} {p.surname}
                  {p.id === profile?.id && (
                    <span className="ml-1.5 text-xs" style={{ color: '#C9A227' }}>you</span>
                  )}
                </span>
                <span className="text-xs" style={{ color: '#C9A227' }}>⏳</span>
                {profile?.is_admin && p.id !== profile.id && (
                  <button
                    onClick={() => adminTogglePlayer(p.id)}
                    className="text-xs px-2 py-0.5 rounded-lg ml-1"
                    style={{ color: '#ff6b6b', border: '1px solid #5a1a1a' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick fine modal */}
      {fineModal && (
        <div className="fixed inset-0 flex items-end justify-center z-50 px-4 pb-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setFineModal(null)}>
          <div className="w-full rounded-2xl p-5"
            style={{ background: '#141414', border: '1px solid #2e2e2e', maxWidth: 430 }}
            onClick={e => e.stopPropagation()}>
            <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: '#C9A227' }}>Issue Fine</p>
            <p className="font-semibold text-white mb-4">
              {fineModal.player.name} {fineModal.player.surname}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {FINE_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setFineType(t.value)}
                  className="py-3 rounded-xl text-sm font-semibold"
                  style={{
                    background: fineType === t.value ? '#C9A227' : '#1e1e1e',
                    color: fineType === t.value ? '#000' : '#888',
                    border: `1px solid ${fineType === t.value ? '#C9A227' : '#2e2e2e'}`,
                  }}
                >
                  {t.label}<br />
                  <span style={{ fontSize: '0.75rem' }}>£{t.amount}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={issueFine}
                disabled={issuingFine}
                className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: '#C9A227', color: '#000' }}
              >
                {issuingFine ? 'Issuing…' : `Issue £${FINE_TYPES.find(t => t.value === fineType)?.amount}`}
              </button>
              <button
                onClick={() => setFineModal(null)}
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: '#1e1e1e', color: '#666', border: '1px solid #2e2e2e' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin: not signed up */}
      {profile?.is_admin && notSignedUp.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: '#555' }}>
            Not In ({notSignedUp.length})
          </p>
          <div className="space-y-1.5">
            {notSignedUp.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{ background: '#141414', border: '1px solid #2e2e2e' }}
              >
                <PlayerAvatar profile={p} size={32} />
                <span className="flex-1 text-sm" style={{ color: '#666' }}>
                  {p.name} {p.surname}
                </span>
                <PlayerTypeBadge type={p.player_type ?? 'wtp'} />
                <button
                  onClick={() => adminTogglePlayer(p.id)}
                  className="text-xs px-2 py-0.5 rounded-lg font-medium ml-1"
                  style={{ color: '#0D6B52', border: '1px solid #0D6B52' }}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
