// Notifications opt-in banner — sits at the top of TonightPage (where
// everyone lands first) to lift the push-subscription rate. Written to
// be the primary adoption lever now that push carries call-ups, results,
// match reports, monthly reviews and rivalry / duo callouts.
//
// Show rules (v2, 1 Sep 2026):
//   * Push must be supported by the device.
//   * Not 'denied' by the browser — a re-prompt would be a no-op there
//     (the "how to unblock" copy belongs on Profile, not on this banner).
//   * NO active subscription exists in the DB for THIS player on THIS
//     device (checked via getSubscription() on the SW registration). This
//     is stricter than the v1 rule (which only checked permission ===
//     'default') because it also catches the "granted on desktop, now on
//     phone" case where the phone has no sub even though permission is
//     'granted' at browser level.
//   * Not dismissed within 7 days (localStorage cooldown).
//   * Profile has loaded.
//
// If the user taps Enable, subscribeToPush() is called — that requests
// browser permission (if not yet granted on this device), registers the
// SW, and upserts a push_subscriptions row. If Dismiss, cooldown starts.

import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  getPermissionState,
  isPushSupported,
  subscribeToPush,
  ensureServiceWorker,
} from '../lib/push'

const DISMISSED_AT_KEY = 'wf-notifications-banner-dismissed-at'
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function withinCooldown(): boolean {
  const raw = localStorage.getItem(DISMISSED_AT_KEY)
  if (!raw) return false
  const ts = Number(raw)
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts < COOLDOWN_MS
}

// Does this specific device already have an active push subscription?
// Cheaper + faster than a DB round-trip; the SW registration is local.
async function deviceHasSubscription(): Promise<boolean> {
  try {
    const reg = await ensureServiceWorker()
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

export default function NotificationsBanner() {
  const { profile } = useAuth()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isPushSupported()) return
      if (getPermissionState() === 'denied') return
      if (withinCooldown()) return
      if (!profile?.id) return
      const has = await deviceHasSubscription()
      if (cancelled) return
      if (has) return
      setShow(true)
    })()
    return () => { cancelled = true }
  }, [profile?.id])

  async function enable() {
    if (!profile?.id) return
    setBusy(true); setError(null)
    const result = await subscribeToPush(profile.id)
    setBusy(false)
    if (result.ok) {
      setShow(false)
    } else if (result.reason === 'denied') {
      // Browser denied — no re-prompt possible. Extend cooldown 30 days.
      localStorage.setItem(DISMISSED_AT_KEY, String(Date.now() + 30 * 24 * 60 * 60 * 1000 - COOLDOWN_MS))
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
    <div
      className="mb-3 rounded-2xl"
      style={{
        background: 'linear-gradient(140deg, rgba(255,212,0,0.10), rgba(74,217,255,0.06) 80%)',
        border: '1.5px solid var(--tt-yellow)',
        backgroundClip: 'padding-box',
      }}>
      <div className="px-3 pt-3 pb-2 flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--tt-yellow)', color: '#0F1710', fontSize: 18 }}>
          🔔
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--tt-yellow)' }}>
            Turn on notifications
          </p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--color-text)' }}>
            You'll miss <strong>call-ups off the waiting list</strong>, <strong>voting opens</strong>,
            match reports, monthly wraps and duo-of-the-month callouts.
          </p>
          {error && (
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-error-text)' }}>⚠ {error}</p>
          )}
        </div>
        <button
          onClick={dismiss}
          disabled={busy}
          className="flex-shrink-0 text-lg leading-none disabled:opacity-50 px-1"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Dismiss for 7 days"
        >
          ×
        </button>
      </div>
      <div className="px-3 pb-3 flex gap-2">
        <button
          onClick={enable}
          disabled={busy}
          className="flex-1 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
          style={{ background: 'var(--tt-yellow)', color: '#0F1710' }}
        >
          {busy ? 'Enabling…' : '🔔 Enable on this device'}
        </button>
        <button
          onClick={dismiss}
          disabled={busy}
          className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{
            background: 'transparent',
            color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
          }}
        >
          Later
        </button>
      </div>
      <p className="px-3 pb-3 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        You can pick which categories buzz you on Profile.
      </p>
    </div>
  )
}
