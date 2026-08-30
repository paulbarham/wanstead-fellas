import { useEffect, useState } from 'react'
import { registerWithUpdates, applyUpdate } from '../lib/swUpdate'

/**
 * "New version available — Refresh" toast.
 *
 * Sits above the bottom nav rather than over it, so it never covers the tab
 * a player is reaching for. Dismiss is session-scoped on purpose: it hides
 * the toast for now but it returns next time the app opens, because the whole
 * point is that people shouldn't quietly sit on a stale build for days.
 */
export default function UpdatePrompt() {
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    registerWithUpdates(() => setReady(true))
  }, [])

  if (!ready || dismissed) return null

  return (
    <div
      role="status"
      className="fixed left-0 right-0 px-3"
      style={{
        // Clear of the bottom nav (~56px) plus the home indicator.
        bottom: 'calc(env(safe-area-inset-bottom) + 64px)',
        zIndex: 90,
        maxWidth: 430,
        margin: '0 auto',
        pointerEvents: 'none',
      }}>
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--tt-cyan, #4AD9FF)',
          backgroundClip: 'padding-box',
          boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
          pointerEvents: 'auto',
        }}>
        <span className="text-base leading-none" aria-hidden="true">🔄</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            New version available
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Refresh to get the latest updates.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setBusy(true); void applyUpdate() }}
          disabled={busy}
          className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-60 active:opacity-70"
          style={{
            background: 'var(--color-primary)',
            color: '#FFFFFF',
            border: '1px solid var(--color-primary)',
            whiteSpace: 'nowrap',
          }}>
          {busy ? 'Updating…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss update prompt"
          className="flex-shrink-0 px-1 text-sm active:opacity-60"
          style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none' }}>
          ✕
        </button>
      </div>
    </div>
  )
}
