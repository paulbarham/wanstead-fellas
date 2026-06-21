import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Profile, Availability, FineType } from '../types'
import { FINE_TYPES } from '../types'
import { getNextThursdayDate, getMatchPhase, getCountdownLabel } from '../lib/time'
import PlayerAvatar from '../components/PlayerAvatar'
import InstallBanner from '../components/InstallBanner'
import WeatherCard from '../components/WeatherCard'
import CeefaxHeader from '../components/CeefaxHeader'
import PositionPicker from '../components/PositionPicker'
import type { PreferredPosition } from '../types'
import { pickConfig, formatLabelFor, splitPlayingAndReserves } from '../lib/format'

interface LastResultSummary {
  matchDate: string
  format: string
  reportText: string | null
  scorers: string | null
  highlights: string | null
}

const SIGNUP_CAP = 32

// Replaces the cryptic "SUB / WTP* / WTP" text suffix with a single coloured
// dot. Far less visual noise per row and easier to scan vertically.
function TierDot({ type }: { type: string }) {
  const cfg = type === 'subscribed'
    ? { bg: 'var(--color-primary)', fg: '#0F1710', letter: 'S', label: 'Subscribed' }
    : type === 'wtp_priority'
      ? { bg: 'var(--tt-yellow)', fg: '#0F1710', letter: '★', label: 'WTP Priority' }
      : { bg: '#4a4f48', fg: 'var(--color-text)', letter: '·', label: 'Casual (WTP)' }
  return (
    <span
      title={cfg.label}
      style={{
        width: 18, height: 18, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 800, color: cfg.fg,
        background: cfg.bg, flexShrink: 0,
      }}
    >
      {cfg.letter}
    </span>
  )
}

// Match the TierDot above into a small inline legend so first-time users
// know what the colours mean without poking at every row.
function TierLegend() {
  return (
    <div
      className="mt-3 px-3 py-2 rounded-lg flex items-center gap-3 flex-wrap"
      style={{ background: 'rgba(74,217,255,0.04)', border: '1px dashed var(--color-border)', fontSize: 10, color: 'var(--color-text-muted)' }}
    >
      <span className="flex items-center gap-1.5"><TierDot type="subscribed" /> Subscribed</span>
      <span className="flex items-center gap-1.5"><TierDot type="wtp_priority" /> Priority casual</span>
      <span className="flex items-center gap-1.5"><TierDot type="wtp" /> Casual</span>
    </div>
  )
}

export default function TonightPage() {
  const { profile, refreshProfile } = useAuth()
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
  const [dropConfirm, setDropConfirm] = useState(false)
  // Search filter applied to all three lists (IN, reserves, NOT IN). Empty
  // string = no filter. Case-insensitive substring match on name+surname.
  const [search, setSearch] = useState('')
  // NOT IN is admin-only and defaults closed — used to be a 50+ row scroll.
  const [notInOpen, setNotInOpen] = useState(false)
  const [notInFilter, setNotInFilter] = useState<'all' | 'subscribed' | 'wtp'>('all')
  // Map of playerId → confirmed signups in the trailing 8 weeks. Used to
  // sort the NOT IN list by likelihood-to-play, not alphabetically.
  const [recentApps, setRecentApps] = useState<Record<string, number>>({})
  // One-tap nudge shown when the signed-in player hasn't picked a preferred
  // position yet. Saving inline avoids a trip to the Profile page.
  const [savingPosition, setSavingPosition] = useState(false)
  const [positionDismissed, setPositionDismissed] = useState(false)
  // Players currently blocked from signing up because they owe money past
  // the 2-week grace period. Populated from v_blocked_players. Used to (a)
  // show a clear "you owe £X" banner to the signed-in user, (b) skip blocked
  // players when auto-promoting a reserve.
  const [blockedOwed, setBlockedOwed] = useState<Record<string, number>>({})
  // Set when the toggle attempt is rejected by the DB trigger so we can show
  // the message inline instead of an opaque error.
  const [signupError, setSignupError] = useState<string | null>(null)

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
    const sorted = ((profs as Profile[]) || []).sort((a, b) =>
      `${a.surname}${a.name}`.localeCompare(`${b.surname}${b.name}`)
    )
    setPlayers(sorted)
    setLoading(false)
  }, [nextThursday])

  useEffect(() => { fetchData() }, [fetchData])

  // Keep the who's-in list live — most useful right on the deadline when
  // spots are filling. Any insert/update/delete on this week's availability
  // re-fetches so everyone sees the same sheet without manually refreshing.
  useEffect(() => {
    const channel = supabase
      .channel(`availability:${nextThursday}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability', filter: `match_date=eq.${nextThursday}` },
        () => { fetchData() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [nextThursday, fetchData])

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

  // Blocked players (past-grace unpaid amounts). One fetch per page load
  // — re-runs when availability changes via the realtime subscription so
  // the list stays current if admin marks someone paid mid-session.
  useEffect(() => {
    supabase.from('v_blocked_players').select('player_id, past_grace_owed')
      .then(({ data }) => {
        const map: Record<string, number> = {}
        for (const r of (data as { player_id: string; past_grace_owed: number | string }[]) || []) {
          map[r.player_id] = Number(r.past_grace_owed)
        }
        setBlockedOwed(map)
      })
  }, [availability])

  // Recent attendance for NOT IN sorting — last 8 weeks of confirmed signups,
  // grouped by player. Only fetched for admin since only the admin view
  // currently surfaces the NOT IN list.
  useEffect(() => {
    if (!profile?.is_admin) return
    const since = new Date()
    since.setDate(since.getDate() - 56)
    const sinceStr = since.toISOString().slice(0, 10)
    supabase
      .from('availability')
      .select('player_id, match_date')
      .eq('status', 'confirmed')
      .gte('match_date', sinceStr)
      .then(({ data }) => {
        const map: Record<string, number> = {}
        for (const r of (data as { player_id: string; match_date: string }[]) || []) {
          map[r.player_id] = (map[r.player_id] ?? 0) + 1
        }
        setRecentApps(map)
      })
  }, [profile?.is_admin])

  useEffect(() => {
    const interval = setInterval(() => {
      const thu = getNextThursdayDate()
      setNextThursday(thu)
      setPhase(getMatchPhase(thu))
      setCountdownLabel(getCountdownLabel(thu))
    }, 60000) // update every minute (label changes don't need per-second updates)
    return () => clearInterval(interval)
  }, [])

  // Picks the next waiting entry to promote into a freed confirmed slot.
  // Priority order: wtp_priority first (they pay more — match the bump rule
  // in toggleAvailability), then FIFO by created_at. Returns null if no one
  // is waiting. `excludePlayerId` lets the self-drop path skip the dropper's
  // own row in case both branches race for the same fetchData snapshot.
  function pickPromotion(excludePlayerId?: string) {
    const candidates = waitingAvail
      .filter(a => a.player_id !== excludePlayerId)
      // Skip blocked players — the DB trigger would reject the promotion
      // anyway, but filtering here means the slot goes to the next eligible
      // reserve cleanly instead of failing and leaving it vacant.
      .filter(a => !blockedOwed[a.player_id])
      .map(a => ({
        a,
        priority: (players.find(p => p.id === a.player_id)?.player_type ?? 'wtp') === 'wtp_priority' ? 0 : 1,
        when: new Date(a.created_at).getTime(),
      }))
      .sort((x, y) => x.priority - y.priority || x.when - y.when)
    return candidates[0]?.a ?? null
  }

  async function toggleAvailability() {
    if (!profile) return
    if (!profile.is_admin && phase === 'signup_locked') return
    if (!profile.is_admin && phase === 'match_live') return
    // Hard block: catch unpaid-past-grace upfront so we don't even attempt
    // the insert. The DB trigger is still the safety net behind this.
    if (!profile.is_admin && !myEntry && blockedOwed[profile.id]) {
      setSignupError(`You owe £${blockedOwed[profile.id].toFixed(2)} past the 2-week grace period — pay up to unlock sign-ups.`)
      return
    }
    setToggling(true)
    setSignupError(null)

    if (myEntry) {
      await supabase.from('availability').delete().eq('id', myEntry.id)

      if (myEntry.status === 'confirmed') {
        const firstWaiting = pickPromotion(profile.id)
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
        // Strict pecking order: subscribed > wtp_priority > wtp. A signer-up
        // can bump anyone strictly below their tier. wtp_priority can bump
        // wtp; subscribed can bump wtp first, then wtp_priority. Within a
        // tier the latest-confirmed (highest created_at) is the one displaced
        // — fairer to first-comers.
        const bumpableTiers = playerType === 'subscribed'
          ? ['wtp', 'wtp_priority']
          : ['wtp']
        const candidate = confirmedAvail
          .map(a => ({ a, tier: players.find(pl => pl.id === a.player_id)?.player_type ?? 'wtp' }))
          .filter(({ tier }) => bumpableTiers.includes(tier))
          // Sort by tier rank (wtp first), then latest created_at within tier.
          .sort((x, y) => {
            const rank = (t: string) => t === 'wtp' ? 0 : 1
            const r = rank(x.tier) - rank(y.tier)
            if (r !== 0) return r
            return new Date(y.a.created_at).getTime() - new Date(x.a.created_at).getTime()
          })[0]?.a

        if (candidate) {
          await supabase.from('availability').update({ status: 'waiting' }).eq('id', candidate.id)
          await supabase.from('availability').insert({ player_id: profile.id, match_date: nextThursday, status: 'confirmed' })
        } else {
          await supabase.from('availability').insert({ player_id: profile.id, match_date: nextThursday, status: 'waiting' })
        }
      }
    }

    await fetchData()
    setToggling(false)
  }

  // Inline save of preferred position from the nudge banner — saves a trip
  // to the Profile page for the 10 players who still have no position set.
  async function savePosition(next: { primary: PreferredPosition | null; secondary: PreferredPosition | null }) {
    if (!profile || savingPosition) return
    setSavingPosition(true)
    await supabase
      .from('profiles')
      .update({
        preferred_position_primary: next.primary,
        preferred_position_secondary: next.secondary,
      })
      .eq('id', profile.id)
    await refreshProfile()
    setSavingPosition(false)
  }

  // Dropping a confirmed spot auto-promotes a waiting player and can't be
  // undone (you can't reclaim the spot by tapping again), so we confirm first.
  // Marking in or leaving the waiting list is harmless — toggle immediately.
  function handleToggleClick() {
    if (isIn) setDropConfirm(true)
    else toggleAvailability()
  }

  async function toggleChildAvailability(childId: string) {
    if (!profile) return
    setToggling(true)
    const childEntry = availability.find(a => a.player_id === childId)
    if (childEntry) {
      await supabase.from('availability').delete().eq('id', childEntry.id)
      // Free slot → promote the next waiting player, same rule as self-drop.
      if (childEntry.status === 'confirmed') {
        const firstWaiting = pickPromotion(childId)
        if (firstWaiting) {
          await supabase.from('availability').update({ status: 'confirmed' }).eq('id', firstWaiting.id)
        }
      }
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
      // Free slot → promote the next waiting player. Without this, an admin
      // removing someone leaves the teams uneven (Felix Baker, 2026-06-17).
      if (existing.status === 'confirmed') {
        const firstWaiting = pickPromotion(playerId)
        if (firstWaiting) {
          await supabase.from('availability').update({ status: 'confirmed' }).eq('id', firstWaiting.id)
        }
      }
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

  const byName = (a: Profile, b: Profile) =>
    `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, undefined, { sensitivity: 'base' })
  // Search applies at render time only — splitting math below must use the
  // full lists so playing/reserves don't get miscounted.
  const matchesSearch = (p: Profile) => {
    if (!search.trim()) return true
    return `${p.name} ${p.surname}`.toLowerCase().includes(search.trim().toLowerCase())
  }
  const signedUpPlayers = players
    .filter(p => confirmedAvail.some(a => a.player_id === p.id))
    .sort(byName)
  const waitingPlayers = players
    .filter(p => waitingAvail.some(a => a.player_id === p.id))
    .sort(byName)
  // NOT IN: sort by recent attendance desc (likeliest to play first) — name
  // fallback. Then filter chip narrows by tier. Admin only.
  const notSignedUpAll = players
    .filter(p => !availability.some(a => a.player_id === p.id))
    .sort((a, b) => {
      const ra = recentApps[a.id] ?? 0
      const rb = recentApps[b.id] ?? 0
      if (rb !== ra) return rb - ra
      return byName(a, b)
    })
  const notSignedUpSubCount = notSignedUpAll.filter(p => (p.player_type ?? 'wtp') === 'subscribed').length
  const notSignedUpWtpCount = notSignedUpAll.length - notSignedUpSubCount
  const notSignedUp = notSignedUpAll
    .filter(p => {
      if (notInFilter === 'all') return true
      const t = p.player_type ?? 'wtp'
      if (notInFilter === 'subscribed') return t === 'subscribed'
      return t === 'wtp' || t === 'wtp_priority'
    })
    .filter(matchesSearch)

  const matchConfig = pickConfig(signedUpCount)
  const signupClosed = phase !== 'signup_open' && phase !== 'post_match'
  const candidatesForSplit = signedUpPlayers.map(p => {
    const av = confirmedAvail.find(a => a.player_id === p.id)
    return { player: p, createdAt: av?.created_at ?? '' }
  })
  const splitResult = signupClosed
    ? splitPlayingAndReserves(candidatesForSplit, matchConfig?.total ?? signedUpCount)
    : { playing: candidatesForSplit, reserves: [] }
  const playingPlayers = splitResult.playing.map(c => c.player)
  const deferredPlayers = splitResult.reserves.map(c => c.player)
  const reservePlayers = [...deferredPlayers, ...waitingPlayers]

  // A confirmed sign-up can still be pushed into the reserves by the split once
  // the game is over-subscribed. Surface that to the player directly — without
  // it they'd see "I'm In" and wrongly assume they're playing.
  const iAmDeferred = !!profile && deferredPlayers.some(p => p.id === profile.id)

  const dateLabel = (() => {
    const [y, m, d] = nextThursday.split('-').map(Number)
    return format(new Date(y, m - 1, d), 'do MMMM')
  })()

  const canToggle = profile?.is_admin || (phase === 'signup_open' || phase === 'post_match')
  const formatLabel = formatLabelFor(matchConfig)
  const teamCountLabel = matchConfig ? `${matchConfig.numTeams} teams` : null

  return (
    <div className="px-4 pt-4 pb-4">

      <InstallBanner />

      <CeefaxHeader
        pageId="P101 · TEAMSHEET"
        title="NEXT GAME"
        meta={`${format(new Date(nextThursday + 'T12:00:00'), 'EEE d MMM yy').toUpperCase()} · 9PM K.O.`}
        trailing={
          phase === 'match_live' ? (
            <span className="text-xs font-semibold" style={{ color: 'var(--tt-red)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>⚽ LIVE NOW</span>
          ) : phase === 'post_match' ? (
            <span className="text-xs" style={{ color: 'var(--tt-green)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>SIGN-UPS OPEN</span>
          ) : countdownLabel.tonight ? (
            <span className="text-xs font-semibold" style={{ color: 'var(--tt-yellow)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>{countdownLabel.text}</span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>{countdownLabel.text}</span>
          )
        }
      />
      {/* dateLabel retained for accessibility / SR users */}
      <span className="sr-only">{dateLabel}</span>

      {/* Phase banners */}
      {phase === 'signup_locked' && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium text-center"
          style={{ background: 'var(--color-warning-bg)', color: '#92400e', border: '1px solid #C9A227' }}>
          🔒 Sign-ups locked — see you Thursday!
        </div>
      )}

      {/* Consolidated masthead — weather + count + format in one row,
          replacing the previous three-card stack. */}
      <div className="flex items-stretch gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <WeatherCard compact />
        </div>
        <div className="flex items-center gap-3 px-3 py-2 rounded-2xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="text-center" style={{ fontFamily: 'var(--font-mono)' }}>
            <div className="flex items-baseline gap-1 justify-center">
              <span style={{ color: 'var(--tt-yellow)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
                {signedUpCount}
              </span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>/{SIGNUP_CAP}</span>
            </div>
            <div style={{ color: 'var(--tt-green)', fontSize: 9, letterSpacing: '0.1em', marginTop: 2 }}>
              {signedUpCount >= SIGNUP_CAP ? 'FULL' : 'SIGNED UP'}
            </div>
          </div>
          {matchConfig && (
            <div className="text-center px-2 py-1 rounded-lg"
              style={{ background: 'rgba(74,217,255,0.08)', border: '1px solid rgba(74,217,255,0.25)', fontFamily: 'var(--font-mono)' }}>
              <div style={{ color: 'var(--tt-cyan)', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{formatLabel}</div>
              {teamCountLabel && (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 8, letterSpacing: '0.08em', marginTop: 2 }}>
                  {teamCountLabel.toUpperCase()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {deferredPlayers.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs text-center"
          style={{ background: 'var(--color-warning-bg)', color: '#92400e', border: '1px solid #C9A227' }}>
          {playingPlayers.length} playing · {deferredPlayers.length} moved to reserves
        </div>
      )}

      {/* Unpaid block banner — passive, shown to the blocked player so they
          know why before they even tap. Admin override still works. */}
      {profile && !profile.is_admin && !myEntry && blockedOwed[profile.id] && (
        <div className="mb-3 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgba(255,85,85,0.08)', color: 'var(--color-error-text)', border: '1px solid var(--color-error-border)' }}>
          <p className="font-semibold">⛔ Sign-ups locked — you owe £{blockedOwed[profile.id].toFixed(2)}</p>
          <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Unpaid amounts past the 2-week grace period. Settle up with admin to unlock.
          </p>
        </div>
      )}

      {/* Position nudge — only when the player hasn't picked one yet. Dismissable
          per session so it doesn't badger; persists across sessions until set. */}
      {profile && !profile.preferred_position_primary && !positionDismissed && (
        <div
          className="mb-4 p-3 rounded-2xl"
          style={{ background: 'rgba(74,217,255,0.07)', border: '1px solid rgba(74,217,255,0.35)' }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--tt-cyan)' }}>
                ⚽ Where do you play?
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Pick your spot — helps the balancer build fairer teams. Saves instantly.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPositionDismissed(true)}
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Dismiss for this session"
            >
              ✕
            </button>
          </div>
          <PositionPicker
            primary={profile.preferred_position_primary ?? null}
            secondary={profile.preferred_position_secondary ?? null}
            onChange={savePosition}
            compact
          />
        </div>
      )}

      {/* In/Out toggle */}
      <div className="mb-4">
        {canToggle ? (
          <button
            onClick={handleToggleClick}
            disabled={toggling || (!profile?.is_admin && !myEntry && !!profile && !!blockedOwed[profile.id])}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-all disabled:opacity-50 active:scale-[0.98]"
            style={{
              background: isWaiting || iAmDeferred ? 'var(--color-warning-bg)' : isIn ? 'var(--color-success-bg)' : 'var(--color-primary)',
              color: isWaiting || iAmDeferred ? '#92400e' : isIn ? '#0D6B52' : 'white',
              border: isWaiting || iAmDeferred ? '2px solid #C9A227' : isIn ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
          >
            {toggling ? '…' : isWaiting ? '⏳ On Waiting List — Tap to Remove' : iAmDeferred ? '⏳ Reserve — Tap to Drop Out' : isIn ? "✓ I'm In — Tap to Drop Out" : (!profile?.is_admin && profile && blockedOwed[profile.id]) ? `⛔ Unpaid £${blockedOwed[profile.id].toFixed(2)} — Pay to Unlock` : 'Mark Me In'}
          </button>
        ) : (
          <div className="w-full py-3 rounded-2xl text-center font-medium text-xs"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
            {phase === 'signup_locked' ? '🔒 Sign-ups are closed' : 'Sign-ups re-open after Thursday 10pm'}
          </div>
        )}
        {signupError && (
          <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-error-text)', lineHeight: 1.5 }}>
            ⚠ {signupError}
          </p>
        )}
        {iAmDeferred && (
          <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            The game's full, so you've been moved to the reserves. You'll be first in if someone drops out — keep an eye on the list.
          </p>
        )}
      </div>

      {/* My squad - linked children. Compact pill rows so kid toggles don't
          visually compete with the main I'm In CTA above. */}
      {linkedChildren.length > 0 && (
        <div className="mb-4">
          <p
            className="text-[10px] mb-1.5"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--tt-cyan)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            ▶ My Squad
          </p>
          <div className="flex flex-wrap gap-1.5">
            {linkedChildren.map(child => {
              const childEntry = availability.find(a => a.player_id === child.id)
              const childIsIn = childEntry?.status === 'confirmed'
              const childIsWaiting = childEntry?.status === 'waiting'
              return canToggle ? (
                <button
                  key={child.id}
                  onClick={() => toggleChildAvailability(child.id)}
                  disabled={toggling}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-medium disabled:opacity-50"
                  style={{
                    background: childIsWaiting ? 'var(--color-warning-bg)' : childIsIn ? 'var(--color-success-bg)' : 'var(--color-surface)',
                    color: childIsWaiting ? '#92400e' : childIsIn ? '#0D6B52' : 'var(--color-text-muted)',
                    border: `1px solid ${childIsWaiting ? '#C9A227' : childIsIn ? '#0D6B52' : 'var(--color-border)'}`,
                  }}
                >
                  <PlayerAvatar profile={child} size={20} />
                  <span>{child.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 }}>
                    {childIsWaiting ? '⏳ WAIT' : childIsIn ? '✓ IN' : '+ MARK IN'}
                  </span>
                </button>
              ) : (
                <div
                  key={child.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: childIsIn ? '#0D6B52' : childIsWaiting ? '#92400e' : '#9CA897',
                  }}
                >
                  <PlayerAvatar profile={child} size={20} />
                  <span>{child.name}</span>
                  <span style={{ fontSize: 10 }}>{childIsIn ? '✓' : childIsWaiting ? '⏳' : '–'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Search box — filters Who's In, Reserves, and (admin) Not In. */}
      {players.length > 10 && (
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search players…"
          className="w-full px-3 py-2 mb-3 rounded-xl text-sm"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        />
      )}

      {/* Who's In */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p
            className="text-xs"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--tt-cyan)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            ▶ Who's In{playingPlayers.length > 0 ? ` · ${playingPlayers.length}` : ''}
          </p>
        </div>
        {loading ? (
          <div className="text-sm py-2" style={{ color: '#9CA897' }}>Loading…</div>
        ) : playingPlayers.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
            No one signed up yet — be first!
          </p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
            {playingPlayers.filter(matchesSearch).map((p, idx) => {
              const isMe = p.id === profile?.id
              const playerType = p.player_type ?? 'wtp'
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-2"
                  style={{
                    background: isMe ? 'var(--color-success-bg)' : 'transparent',
                    borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11, width: 22 }}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <TierDot type={playerType} />
                  <span className="flex-1 truncate" style={{ color: 'var(--color-text)' }}>
                    {p.name} {p.surname}
                    {isMe && (
                      <span style={{ color: 'var(--tt-yellow)', letterSpacing: '0.06em', fontSize: 10, marginLeft: 8 }}>· YOU</span>
                    )}
                  </span>
                  {profile?.is_admin && (
                    <button
                      onClick={() => { setFineModal({ player: p }); setFineType('late') }}
                      className="text-xs w-5 h-5 flex items-center justify-center rounded opacity-40 hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--color-text-muted)' }}
                      title="Issue fine"
                    >
                      £
                    </button>
                  )}
                  {profile?.is_admin && !isMe && (
                    removeConfirm === p.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => adminTogglePlayer(p.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                          style={{ color: 'var(--tt-red)', border: '1px solid var(--tt-red)' }}
                        >
                          REMOVE
                        </button>
                        <button
                          onClick={() => setRemoveConfirm(null)}
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRemoveConfirm(p.id)}
                        className="text-xs w-5 h-5 flex items-center justify-center rounded opacity-40 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        ✕
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Reserves */}
      {reservePlayers.length > 0 && (
        <div className="mb-4">
          <p
            className="text-xs mb-2"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--tt-magenta)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            ▶ Reserves · {reservePlayers.length}
          </p>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
            {reservePlayers.filter(matchesSearch).map((p, idx) => {
              const isMe = p.id === profile?.id
              const playerType = p.player_type ?? 'wtp'
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-2"
                  style={{
                    background: isMe ? 'var(--color-warning-bg)' : 'transparent',
                    borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11, width: 22 }}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <TierDot type={playerType} />
                  <span className="flex-1 truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {p.name} {p.surname}
                    {isMe && (
                      <span style={{ color: 'var(--tt-magenta)', letterSpacing: '0.06em', fontSize: 10, marginLeft: 8 }}>· YOU</span>
                    )}
                  </span>
                  <span style={{ color: 'var(--tt-magenta)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>RES</span>
                  {profile?.is_admin && !isMe && (
                    removeConfirm === p.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => adminTogglePlayer(p.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                          style={{ color: 'var(--tt-red)', border: '1px solid var(--tt-red)' }}
                        >
                          REMOVE
                        </button>
                        <button
                          onClick={() => setRemoveConfirm(null)}
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRemoveConfirm(p.id)}
                        className="text-xs w-5 h-5 flex items-center justify-center rounded opacity-40 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        ✕
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Drop-out confirmation */}
      {dropConfirm && (
        <div className="fixed inset-0 flex items-end justify-center z-50 px-4 pb-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setDropConfirm(false)}>
          <div className="w-full rounded-2xl p-5"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', maxWidth: 430 }}
            onClick={e => e.stopPropagation()}>
            <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-warning-text)' }}>Drop Out?</p>
            <p className="font-semibold text-[var(--color-text)] mb-2">Give up your spot for {dateLabel}?</p>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              {waitingAvail.length > 0
                ? 'Your place will go straight to the next player on the waiting list — you may not get it back if you change your mind.'
                : "You can mark yourself back in afterwards, but you'll re-join at the bottom of the list."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setDropConfirm(false); toggleAvailability() }}
                disabled={toggling}
                className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--color-warning-text)', color: '#000' }}
              >
                {toggling ? 'Dropping…' : 'Yes, drop out'}
              </button>
              <button
                onClick={() => setDropConfirm(false)}
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              >
                Stay in
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick fine modal */}
      {fineModal && (
        <div className="fixed inset-0 flex items-end justify-center z-50 px-4 pb-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setFineModal(null)}>
          <div className="w-full rounded-2xl p-5"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', maxWidth: 430 }}
            onClick={e => e.stopPropagation()}>
            <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-warning-text)' }}>Issue Fine</p>
            <p className="font-semibold text-[var(--color-text)] mb-4">
              {fineModal.player.name} {fineModal.player.surname}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {FINE_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setFineType(t.value)}
                  className="py-3 rounded-xl text-sm font-semibold"
                  style={{
                    background: fineType === t.value ? '#C9A227' : 'var(--color-surface)',
                    color: fineType === t.value ? 'var(--color-text)' : 'var(--color-text-muted)',
                    border: `1px solid ${fineType === t.value ? '#C9A227' : 'var(--color-border)'}`,
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
                style={{ background: 'var(--color-warning-text)', color: '#000' }}
              >
                {issuingFine ? 'Issuing…' : `Issue £${FINE_TYPES.find(t => t.value === fineType)?.amount}`}
              </button>
              <button
                onClick={() => setFineModal(null)}
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin: not signed up. Collapsed by default — used to be 50+ rows of
          alphabetical scroll. When opened, ranked by recent attendance so the
          likeliest-to-play surface first, with a tier filter to narrow. */}
      {profile?.is_admin && notSignedUpAll.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setNotInOpen(o => !o)}
            className="w-full flex items-center justify-between mb-2 text-left"
          >
            <p
              className="text-xs"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--tt-green)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              ▶ Not In · {notSignedUpAll.length}
            </p>
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{notInOpen ? '▲' : '▼'}</span>
          </button>
          {notInOpen && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              <div className="flex gap-1.5 px-3 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--color-border)' }}>
                {([
                  { v: 'all' as const, label: `All · ${notSignedUpAll.length}` },
                  { v: 'subscribed' as const, label: `Subscribed · ${notSignedUpSubCount}` },
                  { v: 'wtp' as const, label: `WTP · ${notSignedUpWtpCount}` },
                ]).map(opt => (
                  <button
                    key={opt.v}
                    onClick={() => setNotInFilter(opt.v)}
                    className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
                    style={{
                      background: notInFilter === opt.v ? 'var(--color-primary)' : 'transparent',
                      color: notInFilter === opt.v ? '#fff' : 'var(--color-text-muted)',
                      border: `1px solid ${notInFilter === opt.v ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {notSignedUp.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  No matches for this filter.
                </p>
              ) : notSignedUp.map((p, idx) => {
                const playerType = p.player_type ?? 'wtp'
                const recent = recentApps[p.id] ?? 0
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2"
                    style={{
                      borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                    }}
                  >
                    <TierDot type={playerType} />
                    <span className="flex-1 truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {p.name} {p.surname}
                    </span>
                    {recent > 0 && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
                        {recent} of last 8
                      </span>
                    )}
                    <button
                      onClick={() => adminTogglePlayer(p.id)}
                      className="text-[10px] px-2 py-1 rounded font-semibold"
                      style={{ color: 'var(--tt-green)', border: '1px solid var(--tt-green)', letterSpacing: '0.06em' }}
                    >
                      ADD
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Last Result card */}
      {lastResult !== undefined && (
        <button
          onClick={() => navigate('/match')}
          className="w-full text-left p-5 rounded-2xl mt-5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.8px' }}>
              🏆 Last Result
            </p>
            {lastResult && (
              <span className="text-xs" style={{ color: '#9CA897' }}>
                {format(new Date(lastResult.matchDate + 'T12:00:00'), 'do MMM')} ›
              </span>
            )}
          </div>

          {lastResult === null ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No results posted yet — check back after Thursday ⚽
            </p>
          ) : (
            <>
              <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                {lastResult.format === 'tournament' || lastResult.format === '4-team'
                  ? '4-Team Tournament'
                  : lastResult.format}
              </p>
              {lastResult.scorers && (
                <p className="text-xs mb-1" style={{ color: 'var(--color-text)' }}>
                  ⚽ {lastResult.scorers.length > 60
                    ? lastResult.scorers.slice(0, 60) + '…'
                    : lastResult.scorers}
                </p>
              )}
              {lastResult.reportText && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  {lastResult.reportText.length > 100
                    ? lastResult.reportText.slice(0, 100) + '…'
                    : lastResult.reportText}
                </p>
              )}
              {!lastResult.scorers && !lastResult.reportText && (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Match played — tap to view result</p>
              )}
            </>
          )}
        </button>
      )}

      <TierLegend />
    </div>
  )
}
