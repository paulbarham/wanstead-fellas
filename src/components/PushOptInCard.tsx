import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  getPermissionState,
  hasActiveSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/push'

// Opt-in banner shown on the Profile page. Handles the four-state lifecycle:
//   * unsupported  → device / browser can't do web push (some iOS versions,
//                    private windows, etc.) → single explanatory line, no CTA
//   * default      → user hasn't decided → primary CTA to enable
//   * granted+on   → toggle to disable (leaves permission granted; only
//                    unsubscribes the current device)
//   * denied       → explain how to re-enable via browser settings
export default function PushOptInCard() {
  const { profile } = useAuth()
  const [permission, setPermission] = useState(getPermissionState())
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const has = await hasActiveSubscription()
      if (!cancelled) setActive(has)
    })()
    return () => { cancelled = true }
  }, [])

  if (!isPushSupported() || !profile) {
    return (
      <div className="rounded-2xl p-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          🔔 Notifications
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          This browser doesn't support push notifications yet. On iPhone, add the app to your
          Home Screen and open it from there.
        </p>
      </div>
    )
  }

  async function enable() {
    if (!profile) return
    setBusy(true); setError(null)
    const result = await subscribeToPush(profile.id)
    if (result.ok) {
      setPermission('granted')
      setActive(true)
    } else if (result.reason === 'denied') {
      setPermission('denied')
    } else {
      setError(result.reason ?? 'Could not enable notifications')
    }
    setBusy(false)
  }

  async function disable() {
    setBusy(true); setError(null)
    const result = await unsubscribeFromPush()
    if (result.ok) {
      setActive(false)
    } else {
      setError(result.reason ?? 'Could not turn off notifications')
    }
    setBusy(false)
  }

  const bg = active
    ? 'rgba(74,220,122,0.07)'
    : permission === 'denied'
      ? 'rgba(255,85,85,0.06)'
      : 'rgba(74,217,255,0.07)'
  const border = active
    ? 'rgba(74,220,122,0.5)'
    : permission === 'denied'
      ? 'rgba(255,85,85,0.4)'
      : 'rgba(74,217,255,0.5)'

  return (
    <div className="rounded-2xl p-4"
      style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            🔔 Match-night notifications
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {active
              ? 'Turned on — you\'ll get a nudge when voting opens after full time and when the results are published.'
              : permission === 'denied'
                ? 'Blocked in your browser. To re-enable, open your browser settings for this site and allow notifications.'
                : 'Get a nudge when voting opens after full time and when the results are published. Handy for anyone who forgets to open the app on Thursday evening.'}
          </p>
        </div>
        <span className="text-[10px] font-semibold tracking-widest"
          style={{
            color: active ? 'var(--tt-green)' : permission === 'denied' ? 'var(--tt-red)' : 'var(--tt-cyan)',
          }}>
          {active ? 'ON' : permission === 'denied' ? 'BLOCKED' : 'OFF'}
        </span>
      </div>

      {error && (
        <p className="text-[11px] mb-2 px-2 py-1 rounded"
          style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)' }}>
          ⚠ {error}
        </p>
      )}

      {permission !== 'denied' && (
        <button
          type="button"
          onClick={active ? disable : enable}
          disabled={busy}
          className="w-full py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{
            background: active ? 'var(--color-surface)' : 'var(--color-primary)',
            color: active ? 'var(--color-text)' : '#FFFFFF',
            border: active ? '1px solid var(--color-border)' : '1px solid var(--color-primary)',
          }}>
          {busy ? 'Working…' : active ? 'Turn off on this device' : 'Enable notifications'}
        </button>
      )}
    </div>
  )
}
