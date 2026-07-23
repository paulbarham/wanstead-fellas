// Notifications opt-in banner — sits at the top of TonightPage (where
// everyone lands first) to lift the push-subscription rate. At the time
// of writing only 13 of ~30 active players had subscribed; the full
// PushOptInCard lives on Profile, which most players never navigate to.
//
// Show rules:
//   * Push must be supported by the device.
//   * Notification permission must be 'default' — never had a decision yet.
//     If 'granted' we don't nudge (already on). If 'denied' we don't nudge
//     either — the browser blocks a re-prompt and there's nothing this
//     banner can do; a linked-to-Profile route would just show the "how to
//     re-enable in browser settings" copy.
//   * Not dismissed within the cooldown window (7 days). After that a
//     lapsed non-decision player gets the banner again.
//   * Profile has loaded (subscribeToPush needs the profile.id to key the
//     row in push_subscriptions).
//
// If the user taps Enable, we call the same subscribeToPush helper the
// Profile card uses. If they tap Dismiss we stash a timestamp; the cooldown
// window elapses before we show again.

import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getPermissionState, isPushSupported, subscribeToPush } from '../lib/push'

const DISMISSED_AT_KEY = 'wf-notifications-banner-dismissed-at'
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function withinCooldown(): boolean {
  const raw = localStorage.getItem(DISMISSED_AT_KEY)
  if (!raw) return false
  const ts = Number(raw)
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts < COOLDOWN_MS
}

export default function NotificationsBanner() {
  const { profile } = useAuth()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPushSupported()) return
    if (getPermissionState() !== 'default') return
    if (withinCooldown()) return
    if (!profile?.id) return
    setShow(true)
  }, [profile?.id])

  async function enable() {
    if (!profile?.id) return
    setBusy(true); setError(null)
    const result = await subscribeToPush(profile.id)
    setBusy(false)
    if (result.ok) {
      setShow(false)
    } else if (result.reason === 'denied') {
      // Browser denied — no way to re-prompt from here. Hide banner and set
      // long cooldown so we don't harass them next week either.
      localStorage.setItem(DISMISSED_AT_KEY, String(Date.now() + 30 * 24 * 60 * 60 * 1000))
      setShow(false)
    } else {
      setError(result.reason ?? 'Could not enable')
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="mx-0 mb-3 px-3 py-2.5 rounded-xl flex items-center gap-2"
      style={{ background: 'rgba(74,217,255,0.06)', border: '1px solid var(--tt-cyan)' }}>
      <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
        style={{ background: 'var(--tt-cyan)', color: '#0F1710', fontSize: 14 }}>
        🔔
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs" style={{ color: '#ccc' }}>
          <strong style={{ color: 'white' }}>Match-night notifications</strong> —
          get a nudge when teams drop, voting opens, and the report lands.
        </p>
        {error && (
          <p className="text-[10px] mt-1" style={{ color: 'var(--color-error-text)' }}>⚠ {error}</p>
        )}
      </div>
      <button
        onClick={enable}
        disabled={busy}
        className="text-xs font-semibold px-2.5 py-1 rounded-lg flex-shrink-0 disabled:opacity-50"
        style={{ background: 'var(--tt-cyan)', color: '#0F1710' }}
      >
        {busy ? '…' : 'Enable'}
      </button>
      <button
        onClick={dismiss}
        disabled={busy}
        className="flex-shrink-0 text-lg leading-none disabled:opacity-50"
        style={{ color: '#555' }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
