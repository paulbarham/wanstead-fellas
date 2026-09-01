import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import PositionPicker from './PositionPicker'
import FootPicker from './FootPicker'
import AgeBandPicker, { type AgeBand } from './AgeBandPicker'
import {
  getPermissionState,
  subscribeToPush,
  type PushPermissionState,
} from '../lib/push'
import type { PreferredPosition, PreferredFoot } from '../types'

// Single "Complete your card" banner on Next Game — replaces the two
// standalone position + foot nudges with one consolidated card that
// covers the six player-owned attributes:
//
//   Photo · Age (DOB or band) · Fav club · Position primary · Position
//   secondary · Preferred foot
//
// Position, foot and age band can all be set inline. Photo and club need
// the Profile page (photo upload flow, long club dropdown) so those rows
// deep-link.
//
// Dismissable per session; auto-hides when everything is set.

type Field =
  | 'photo'
  | 'age'
  | 'club'
  | 'pos1'
  | 'pos2'
  | 'foot'
  | 'notifications'

const TOTAL_FIELDS = 7

interface Row {
  key: Field
  icon: string
  title: string
  blurb: string
  set: boolean
  action: 'inline' | 'profile'
}

export default function ProfileCompletionCard() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState<Field | null>(null)
  const [saving, setSaving] = useState(false)

  // Notifications state — checked async (DB truth, not per-device browser sub)
  // so the tick reflects "this player has push on at least one device".
  // pushCount: null while loading, then number of push_subscription rows.
  // On 'unsupported' devices we count the row as set (nothing they can do).
  const [pushCount, setPushCount] = useState<number | null>(null)
  const [pushPermission, setPushPermission] = useState<PushPermissionState>('default')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushErr, setPushErr] = useState<string | null>(null)

  const refreshPushState = useCallback(async () => {
    setPushPermission(getPermissionState())
    if (!profile) return
    const { count } = await supabase.from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', profile.id)
    setPushCount(count ?? 0)
  }, [profile])

  useEffect(() => { refreshPushState() }, [refreshPushState])

  async function enablePush() {
    if (!profile || pushBusy) return
    setPushBusy(true); setPushErr(null)
    const res = await subscribeToPush(profile.id)
    if (!res.ok) {
      setPushErr(res.reason === 'denied'
        ? 'Blocked in this browser. Toggle Notifications in your browser or system settings, then try again.'
        : res.reason === 'unsupported'
          ? 'This device doesn\'t support web push.'
          : `Couldn't enable (${res.reason ?? 'unknown'}).`)
    }
    await refreshPushState()
    setPushBusy(false)
  }

  const notificationsSet =
    pushPermission === 'unsupported' ? true
    : pushCount == null ? true                                // treat unknown as set while loading (no flicker)
    : pushCount > 0

  const rows: Row[] = useMemo(() => {
    if (!profile) return []
    return [
      { key: 'pos1',          icon: '⚙️', title: 'Preferred position',    blurb: 'Where do you play?',                              set: !!profile.preferred_position_primary,   action: 'inline'  },
      { key: 'foot',          icon: '🦶', title: 'Preferred foot',         blurb: 'Left, right or both?',                            set: !!profile.preferred_foot,               action: 'inline'  },
      { key: 'age',           icon: '🎂', title: 'Age',                    blurb: 'Pick a decade band, or add exact DOB on Profile.',set: !!(profile.dob || profile.age_group),   action: 'inline'  },
      { key: 'pos2',          icon: '🛡️', title: 'Backup position',        blurb: 'Where can you cover if needed?',                  set: !!profile.preferred_position_secondary, action: 'inline'  },
      { key: 'photo',         icon: '📸', title: 'Profile photo',          blurb: 'Puts a face on your card.',                       set: !!profile.photo_url,                    action: 'profile' },
      { key: 'club',          icon: '🏆', title: 'Favourite club',         blurb: 'The badge on your card.',                         set: !!profile.favourite_club,               action: 'profile' },
      { key: 'notifications', icon: '🔔', title: 'Notifications',          blurb: 'Get pinged on call-ups, teams, results & MOTM.',  set: notificationsSet,                        action: 'inline'  },
    ]
  }, [profile, notificationsSet])

  const setCount = rows.filter(r => r.set).length
  const missing = rows.filter(r => !r.set)
  const pct = Math.round((setCount / TOTAL_FIELDS) * 100)

  if (!profile) return null
  if (missing.length === 0) return null
  if (dismissed) return null

  async function savePrimaryPos(next: { primary: PreferredPosition | null; secondary: PreferredPosition | null }) {
    if (!profile || saving) return
    setSaving(true)
    await supabase.from('profiles')
      .update({ preferred_position_primary: next.primary, preferred_position_secondary: next.secondary })
      .eq('id', profile.id)
    await refreshProfile()
    setSaving(false)
  }

  async function saveFoot(next: PreferredFoot | null) {
    if (!profile || saving) return
    setSaving(true)
    await supabase.from('profiles').update({ preferred_foot: next }).eq('id', profile.id)
    await refreshProfile()
    setSaving(false)
  }

  async function saveAge(next: AgeBand | null) {
    if (!profile || saving) return
    setSaving(true)
    await supabase.from('profiles').update({ age_group: next }).eq('id', profile.id)
    await refreshProfile()
    setSaving(false)
  }

  return (
    <div
      className="mb-4 rounded-2xl"
      style={{ background: 'rgba(74,220,122,0.06)', border: '1px solid rgba(74,220,122,0.4)' }}
    >
      {/* Header + progress + dismiss */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--tt-green)' }}>
              👋 Complete your card
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {setCount}/{TOTAL_FIELDS} done · {missing.length} to go. Every change saves instantly.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Dismiss for this session"
          >
            ✕
          </button>
        </div>

        <div
          className="w-full rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.08)', height: 6 }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--tt-green)',
              transition: 'width 200ms ease',
            }}
          />
        </div>
      </div>

      {/* Missing rows */}
      <div style={{ borderTop: '1px solid rgba(74,220,122,0.25)' }}>
        {missing.map((r, i) => {
          const isOpen = expanded === r.key
          return (
            <div
              key={r.key}
              style={{ borderTop: i === 0 ? undefined : '1px solid rgba(74,220,122,0.15)' }}
            >
              <button
                type="button"
                onClick={() => {
                  if (r.action === 'profile') {
                    navigate('/profile')
                  } else {
                    setExpanded(isOpen ? null : r.key)
                  }
                }}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5"
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{r.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {r.title}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {r.blurb}
                  </span>
                </span>
                <span className="text-[10px] font-semibold tracking-widest" style={{ color: 'var(--tt-green)' }}>
                  {r.action === 'profile' ? 'PROFILE →' : isOpen ? '× CLOSE' : 'SET'}
                </span>
              </button>

              {isOpen && r.action === 'inline' && (
                <div className="px-3 pb-3 pt-0">
                  {r.key === 'pos1' && (
                    <PositionPicker
                      primary={profile.preferred_position_primary ?? null}
                      secondary={profile.preferred_position_secondary ?? null}
                      onChange={savePrimaryPos}
                      compact
                    />
                  )}
                  {r.key === 'pos2' && (
                    <PositionPicker
                      primary={profile.preferred_position_primary ?? null}
                      secondary={profile.preferred_position_secondary ?? null}
                      onChange={savePrimaryPos}
                      compact
                    />
                  )}
                  {r.key === 'foot' && (
                    <FootPicker value={profile.preferred_foot ?? null} onChange={saveFoot} compact />
                  )}
                  {r.key === 'age' && (
                    <>
                      <AgeBandPicker
                        value={(profile.age_group as AgeBand | null) ?? null}
                        onChange={saveAge}
                        compact
                      />
                      <p className="mt-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        Prefer to share exact DOB (unlocks age badges on Cards)? <button
                          type="button"
                          onClick={() => navigate('/profile')}
                          className="underline"
                          style={{ color: 'var(--tt-cyan)' }}
                        >Add on Profile →</button>
                      </p>
                    </>
                  )}
                  {r.key === 'notifications' && (
                    <>
                      <button
                        type="button"
                        onClick={enablePush}
                        disabled={pushBusy || pushPermission === 'denied' || pushPermission === 'unsupported'}
                        className="w-full py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                        style={{ background: 'var(--tt-green)', color: 'var(--color-surface)' }}
                      >
                        {pushBusy ? 'Enabling…'
                          : pushPermission === 'denied' ? '🚫 Blocked in browser settings'
                          : pushPermission === 'unsupported' ? '🚫 Not supported on this device'
                          : '🔔 Enable notifications'}
                      </button>
                      {pushErr && (
                        <p className="mt-2 text-[11px]" style={{ color: 'var(--color-error-text)' }}>
                          {pushErr}
                        </p>
                      )}
                      <p className="mt-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        Fine-tune which categories buzz on Profile. Default: all on.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
