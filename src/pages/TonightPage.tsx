import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Profile, Availability, FineType } from '../types'
import { FINE_TYPES } from '../types'
import { getNextThursdayDate, getMatchPhase, getCountdownLabel } from '../lib/time'
import PlayerAvatar from '../components/PlayerAvatar'
import PlayerTypeBadge from '../components/PlayerTypeBadge'
import InstallBanner from '../components/InstallBanner'

interface LastResultSummary {
  matchDate: string
  format: string
  reportText: string | null
  scorers: string | null
  highlights: string | null
}

const SIGNUP_CAP = 32

export default function TonightPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [nextThursday, setNextThursday] = useState(() => getNextThursdayDate())
  const [phase, setPhase] = useState(() => getMatchPhase(nextThursday))
  const [countdownLabel, setCountdownLabel] = useState(() => getCountdownLabel(nextThursday))
  const [availability, setAvailability] = useState<Availability[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [childIds, setChildIds] = useState<string[]>([])
  const [fineModal, setFineModal] = useState<{ player: Profile } | null>(null)
  const [fineType, setFineType] = useState<FineType>('late')
  const [issuingFine, setIssuingFine] = useState(false)
  const [lastResult, setLastResult] = useState<LastResultSummary | null | undefined>(undefined)
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)

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
    if (!profile?.id) return
    supabase
      .from('linked_profiles')
      .select('child_id')
      .eq('parent_id', profile.id)
      .then(({ data }) => setChildIds((data || []).map((d: { child_id: string }) => d.child_id)))
  }, [profile?.id])

  useEffect(() => {
    async function fetchLastResult() {
      const { data: matchRaw } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'completed')
        .order('match_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!matchRaw) { setLastResult(null); return }
      const m = matchRaw as { id: string; match_date: string; format: string }
      const { data: resultRaw } = await supabase
        .from('results')
        .select('*')
        .eq('match_id', m.id)
        .maybeSingle()
      const r = resultRaw as { report_text: string | null; scorers: string | null; highlights: string | null } | null
      setLastResult({
        matchDate: m.match_date,
        format: m.format,
        reportText: r?.report_text ?? null,
        scorers: r?.scorers ?? null,
        highlights: r?.highlights ?? null,
      })
    }
    fetchLastResult()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const thu = getNextThursdayDate()
      setNextThursday(thu)
      setPhase(getMatchPhase(thu))
      setCountdownLabel(getCountdownLabel(thu))
    }, 60000) // update every minute (label changes don't need per-second updates)
    return () => clearInterval(interval)
  }, [])

  async function toggleAvailability() {
    if (!profile) return
    if (!profile.is_admin && phase === 'signup_locked') return
    if (!profile.is_admin && phase === 'match_live') return
    setToggling(true)

    if (myEntry) {
      await supabase.from('availability').delete().eq('id', myEntry.id)

      if (myEntry.status === 'confirmed') {
        const firstWaiting = [...waitingAvail]
          .filter(a => a.player_id !== profile.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]
        if (firstWaiting) {
          await supabase.from('availability').update({ status: 'confirmed' }).eq('id', firstWaiting.id)
        }
      }
    } else {
      const playerType = profile.player_type ?? 'wtp'

      if (profile.is_admin || signedUpCount < SIGNUP_CAP) {
        await supabase.from('availability').insert({ player_id: profile.id, match_date: nextThursday, status: 'confirmed' })
      } else if (playerType === 'wtp') {
        await supabase.from('availability').insert({ player_id: profile.id, match_date: nextThursday, status: 'waiting' })
      } else {
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
          await supabase.from('availability').insert({ player_id: profile.id, match_date: nextThursday, status: 'waiting' })
        }
      }
    }

    await fetchData()
    setToggling(false)
  }

  async function toggleChildAvailability(childId: string) {
    if (!profile) return
    setToggling(true)
    const childEntry = availability.find(a => a.player_id === childId)
    if (childEntry) {
      await supabase.from('availability').delete().eq('id', childEntry.id)
    } else {
      const status = signedUpCount < SIGNUP_CAP ? 'confirmed' : 'waiting'
      await supabase.from('availability').insert({ player_id: childId, match_date: nextThursday, status })
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
    setRemoveConfirm(null)
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

  const linkedChildren = players.filter(p => childIds.includes(p.id))

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
    <div className="px-4 pt-4 pb-2">

      <InstallBanner />

      {/* Date + countdown */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase mb-0.5" style={{ color: '#647060', letterSpacing: '0.8px' }}>
          Next Match
        </p>
        <div className="flex items-start justify-between">
          <h1 className="font-display text-[#18201A] tracking-wide leading-tight" style={{ fontSize: '28px' }}>{dateLabel}</h1>
          {phase === 'match_live' ? (
            <span className="flex-shrink-0 ml-3 font-semibold text-sm" style={{ color: '#DC2626' }}>⚽ LIVE NOW</span>
          ) : phase === 'post_match' ? (
            <span className="flex-shrink-0 ml-3 text-xs" style={{ color: '#0D6B52' }}>Sign-ups open ✓</span>
          ) : countdownLabel.tonight ? (
            <span className="flex-shrink-0 ml-3 font-semibold text-sm" style={{ color: '#0D6B52' }}>
              {countdownLabel.text}
            </span>
          ) : (
            <span className="flex-shrink-0 ml-3 text-xs" style={{ color: '#9CA897' }}>
              {countdownLabel.text}
            </span>
          )}
        </div>
      </div>

      {/* Phase banners */}
      {phase === 'signup_locked' && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium text-center"
          style={{ background: '#FEF9C3', color: '#92400e', border: '1px solid #C9A227' }}>
          🔒 Sign-ups locked — see you Thursday!
        </div>
      )}

      {/* Count + format bar */}
      <div className="flex items-center mb-3 px-4 py-3 rounded-2xl"
        style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
        <div className="flex items-baseline gap-2 flex-1">
          <span className="font-display text-5xl leading-none" style={{ color: '#0D6B52' }}>{signedUpCount}</span>
          <span className="text-xs" style={{ color: '#9CA897' }}>signed up</span>
          {signedUpCount >= SIGNUP_CAP && (
            <span className="text-xs font-semibold" style={{ color: '#DC2626' }}>FULL</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#F7F8F5', border: '1px solid #E2E4DC' }}>
          <span className="text-sm">⚽</span>
          <span className="text-xs font-semibold text-[#18201A]">{formatLabel}</span>
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
              background: isWaiting ? '#FEF9C3' : isIn ? '#DCFCE7' : '#0D6B52',
              color: isWaiting ? '#92400e' : isIn ? '#0D6B52' : 'white',
              border: isWaiting ? '2px solid #C9A227' : isIn ? '2px solid #0D6B52' : '2px solid transparent',
            }}
          >
            {toggling ? '…' : isWaiting ? '⏳ On Waiting List — Tap to Remove' : isIn ? "✓ I'm In — Tap to Drop Out" : 'Mark Me In'}
          </button>
        ) : (
          <div className="w-full py-3 rounded-2xl text-center font-medium text-xs"
            style={{ background: '#FFFFFF', color: '#647060', border: '1px solid #E2E4DC' }}>
            {phase === 'signup_locked' ? '🔒 Sign-ups are closed' : 'Sign-ups re-open after Thursday 10pm'}
          </div>
        )}
      </div>

      {/* My squad - linked children */}
      {linkedChildren.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase mb-2" style={{ color: '#647060', letterSpacing: '0.8px' }}>
            My Squad
          </p>
          <div className="space-y-2">
            {linkedChildren.map(child => {
              const childEntry = availability.find(a => a.player_id === child.id)
              const childIsIn = childEntry?.status === 'confirmed'
              const childIsWaiting = childEntry?.status === 'waiting'
              return (
                <div
                  key={child.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
                >
                  <PlayerAvatar profile={child} size={32} />
                  <span className="flex-1 text-sm font-medium text-[#18201A]">
                    {child.name} {child.surname}
                  </span>
                  {canToggle ? (
                    <button
                      onClick={() => toggleChildAvailability(child.id)}
                      disabled={toggling}
                      className="text-xs px-3 py-1.5 rounded-xl font-semibold disabled:opacity-50"
                      style={{
                        background: childIsWaiting ? '#FEF9C3' : childIsIn ? '#DCFCE7' : '#FFFFFF',
                        color: childIsWaiting ? '#92400e' : childIsIn ? '#0D6B52' : '#9CA897',
                        border: `1px solid ${childIsWaiting ? '#C9A227' : childIsIn ? '#0D6B52' : '#E2E4DC'}`,
                      }}
                    >
                      {childIsWaiting ? '⏳ Waiting' : childIsIn ? '✓ In' : 'Mark In'}
                    </button>
                  ) : (
                    <span className="text-xs" style={{ color: childIsIn ? '#0D6B52' : childIsWaiting ? '#92400e' : '#9CA897' }}>
                      {childIsIn ? '✓ In' : childIsWaiting ? '⏳' : 'Not In'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Who's In */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase" style={{ color: '#647060', letterSpacing: '0.8px' }}>Who's In</p>
          {signedUpPlayers.length > 0 && (
            <span className="text-xs" style={{ color: '#9CA897' }}>
              {signedUpPlayers.length} {signedUpPlayers.length === 1 ? 'player' : 'players'}
            </span>
          )}
        </div>
        {loading ? (
          <div className="text-sm py-2" style={{ color: '#9CA897' }}>Loading…</div>
        ) : signedUpPlayers.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: '#647060' }}>
            No one signed up yet — be first!
          </p>
        ) : (
          <div className="space-y-1.5">
            {signedUpPlayers.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{
                  background: p.id === profile?.id ? '#DCFCE7' : '#FFFFFF',
                  border: `1px solid ${p.id === profile?.id ? '#0D6B52' : '#E2E4DC'}`,
                }}
              >
                <PlayerAvatar profile={p} size={32} />
                <span className="flex-1 text-sm font-medium text-[#18201A]">
                  {p.name} {p.surname}
                  {p.id === profile?.id && (
                    <span className="ml-1.5 text-xs" style={{ color: '#0D6B52' }}>you</span>
                  )}
                </span>
                <PlayerTypeBadge type={p.player_type ?? 'wtp'} />
                {/* Fine button — subtle, admin only */}
                {profile?.is_admin && (
                  <button
                    onClick={() => { setFineModal({ player: p }); setFineType('late') }}
                    className="text-xs w-5 h-5 flex items-center justify-center rounded opacity-30 hover:opacity-60 active:opacity-100 transition-opacity ml-1"
                    style={{ color: '#647060' }}
                    title="Issue fine"
                  >
                    £
                  </button>
                )}
                {/* Remove — requires inline confirmation */}
                {profile?.is_admin && p.id !== profile.id && (
                  removeConfirm === p.id ? (
                    <div className="flex items-center gap-1 ml-1">
                      <span className="text-xs" style={{ color: '#DC2626' }}>Remove?</span>
                      <button
                        onClick={() => adminTogglePlayer(p.id)}
                        className="text-xs px-1.5 py-0.5 rounded-lg font-semibold"
                        style={{ color: '#DC2626', border: '1px solid #FECACA' }}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setRemoveConfirm(null)}
                        className="text-xs px-1.5 py-0.5 rounded-lg"
                        style={{ color: '#9CA897', border: '1px solid #E2E4DC' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRemoveConfirm(p.id)}
                      className="text-xs w-5 h-5 flex items-center justify-center rounded opacity-40 hover:opacity-70 active:opacity-100 transition-opacity"
                      style={{ color: '#9CA897' }}
                    >
                      ✕
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Waiting list */}
      {waitingPlayers.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase mb-2" style={{ color: '#647060', letterSpacing: '0.8px' }}>
            Waiting List ({waitingPlayers.length})
          </p>
          <div className="space-y-1.5">
            {waitingPlayers.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{
                  background: p.id === profile?.id ? '#FEF9C3' : '#FFFFFF',
                  border: `1px solid ${p.id === profile?.id ? '#C9A227' : '#E2E4DC'}`,
                }}
              >
                <span className="text-xs w-4 text-center" style={{ color: '#9CA897' }}>{i + 1}</span>
                <PlayerAvatar profile={p} size={28} />
                <span className="flex-1 text-sm font-medium" style={{ color: '#647060' }}>
                  {p.name} {p.surname}
                  {p.id === profile?.id && (
                    <span className="ml-1.5 text-xs" style={{ color: '#C9A227' }}>you</span>
                  )}
                </span>
                <span className="text-xs" style={{ color: '#C9A227' }}>⏳</span>
                {profile?.is_admin && p.id !== profile.id && (
                  removeConfirm === p.id ? (
                    <div className="flex items-center gap-1 ml-1">
                      <span className="text-xs" style={{ color: '#DC2626' }}>Remove?</span>
                      <button
                        onClick={() => adminTogglePlayer(p.id)}
                        className="text-xs px-1.5 py-0.5 rounded-lg font-semibold"
                        style={{ color: '#DC2626', border: '1px solid #FECACA' }}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setRemoveConfirm(null)}
                        className="text-xs px-1.5 py-0.5 rounded-lg"
                        style={{ color: '#9CA897', border: '1px solid #E2E4DC' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRemoveConfirm(p.id)}
                      className="text-xs w-5 h-5 flex items-center justify-center rounded opacity-40 hover:opacity-70 active:opacity-100 transition-opacity"
                      style={{ color: '#9CA897' }}
                    >
                      ✕
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick fine modal */}
      {fineModal && (
        <div className="fixed inset-0 flex items-end justify-center z-50 px-4 pb-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setFineModal(null)}>
          <div className="w-full rounded-2xl p-5"
            style={{ background: '#FFFFFF', border: '1px solid #E2E4DC', maxWidth: 430 }}
            onClick={e => e.stopPropagation()}>
            <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: '#C9A227' }}>Issue Fine</p>
            <p className="font-semibold text-[#18201A] mb-4">
              {fineModal.player.name} {fineModal.player.surname}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {FINE_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setFineType(t.value)}
                  className="py-3 rounded-xl text-sm font-semibold"
                  style={{
                    background: fineType === t.value ? '#C9A227' : '#FFFFFF',
                    color: fineType === t.value ? '#000' : '#647060',
                    border: `1px solid ${fineType === t.value ? '#C9A227' : '#E2E4DC'}`,
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
                style={{ background: '#FFFFFF', color: '#647060', border: '1px solid #E2E4DC' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin: not signed up */}
      {profile?.is_admin && notSignedUp.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase mb-2" style={{ color: '#647060', letterSpacing: '0.8px' }}>
            Not In ({notSignedUp.length})
          </p>
          <div className="space-y-1.5">
            {notSignedUp.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
              >
                <PlayerAvatar profile={p} size={32} />
                <span className="flex-1 text-sm" style={{ color: '#647060' }}>
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

      {/* Last Result card */}
      {lastResult !== undefined && (
        <button
          onClick={() => navigate('/match')}
          className="w-full text-left p-5 rounded-2xl"
          style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase" style={{ color: '#647060', letterSpacing: '0.8px' }}>
              🏆 Last Result
            </p>
            {lastResult && (
              <span className="text-xs" style={{ color: '#9CA897' }}>
                {format(new Date(lastResult.matchDate + 'T12:00:00'), 'EEE do MMM')} ›
              </span>
            )}
          </div>

          {lastResult === null ? (
            <p className="text-sm" style={{ color: '#647060' }}>
              No results posted yet — check back after Thursday ⚽
            </p>
          ) : (
            <>
              <p className="text-xs mb-1.5" style={{ color: '#647060' }}>
                {lastResult.format === 'tournament' || lastResult.format === '4-team'
                  ? '4-Team Tournament'
                  : '11v11'}
              </p>
              {lastResult.scorers && (
                <p className="text-xs mb-1" style={{ color: '#18201A' }}>
                  ⚽ {lastResult.scorers.length > 60
                    ? lastResult.scorers.slice(0, 60) + '…'
                    : lastResult.scorers}
                </p>
              )}
              {lastResult.reportText && (
                <p className="text-xs leading-relaxed" style={{ color: '#647060' }}>
                  {lastResult.reportText.length > 100
                    ? lastResult.reportText.slice(0, 100) + '…'
                    : lastResult.reportText}
                </p>
              )}
              {!lastResult.scorers && !lastResult.reportText && (
                <p className="text-xs" style={{ color: '#647060' }}>Match played — tap to view result</p>
              )}
            </>
          )}
        </button>
      )}
    </div>
  )
}
