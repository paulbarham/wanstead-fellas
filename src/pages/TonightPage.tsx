import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Profile, Availability } from '../types'
import { getNextThursdayDate, getMatchPhase, formatCountdown } from '../lib/time'
import PlayerAvatar from '../components/PlayerAvatar'
import InstallBanner from '../components/InstallBanner'

export default function TonightPage() {
  const { profile } = useAuth()
  const [nextThursday, setNextThursday] = useState(() => getNextThursdayDate())
  const [phase, setPhase] = useState(() => getMatchPhase(nextThursday))
  const [countdown, setCountdown] = useState(() => formatCountdown(nextThursday))
  const [availability, setAvailability] = useState<Availability[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const isIn = availability.some(a => a.player_id === profile?.id)
  const signedUpCount = availability.length

  const fetchData = useCallback(async () => {
    const [{ data: avail }, { data: profs }] = await Promise.all([
      supabase.from('availability').select('*').eq('match_date', nextThursday),
      supabase.from('profiles').select('id, name, surname, photo_url, overall_rating, badges'),
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
    if (isIn) {
      await supabase.from('availability').delete().eq('player_id', profile.id).eq('match_date', nextThursday)
    } else {
      await supabase.from('availability').insert({ player_id: profile.id, match_date: nextThursday })
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
      await supabase.from('availability').insert({ player_id: playerId, match_date: nextThursday })
    }
    await fetchData()
  }

  const signedUpPlayers = players.filter(p => availability.some(a => a.player_id === p.id))
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
      <div className="flex gap-2 mb-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <span className="font-display text-xl leading-none" style={{ color: '#0D6B52' }}>{signedUpCount}</span>
          <span className="text-xs" style={{ color: '#666' }}>in</span>
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <span style={{ color: '#0D6B52' }}>⚽</span>
          <span className="text-xs font-medium text-white">{formatLabel}</span>
        </div>
      </div>

      {/* In/Out toggle */}
      <div className="mb-4">
        {canToggle ? (
          <button
            onClick={toggleAvailability}
            disabled={toggling}
            className="w-full py-3 rounded-2xl font-semibold text-sm transition-all disabled:opacity-50"
            style={{
              background: isIn ? '#0a1a10' : '#0D6B52',
              color: isIn ? '#4ade80' : 'white',
              border: isIn ? '2px solid #4ade80' : '2px solid transparent',
            }}
          >
            {toggling ? '…' : isIn ? "✓ I'm In — Tap to Drop Out" : 'Mark Me In'}
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
        <p className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: '#555' }}>
          Who's In
        </p>
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
                <button
                  onClick={() => adminTogglePlayer(p.id)}
                  className="text-xs px-2 py-0.5 rounded-lg font-medium"
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
