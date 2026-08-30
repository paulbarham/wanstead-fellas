import { useState } from 'react'
import { useNotificationPrefs } from '../hooks/useNotificationPrefs'
import { ALWAYS_ON_COPY, NOTIFICATION_CATEGORIES } from '../lib/notifications'

/**
 * Per-category notification toggles, sitting under PushOptInCard on Profile.
 *
 * Everything defaults ON — a player only ever lands here to turn something
 * OFF, which is why there's no "enable all" affordance competing with the
 * switches. "Turn everything off" is deliberately a bordered destructive pill
 * behind a confirm, not a switch: it's the action most likely to be tapped by
 * accident and least likely to be intended.
 *
 * NOTE: no `overflow: hidden` on this card — it holds bold text and the
 * DM Sans sidebearing bug clips capitals at the padding edge (see CLAUDE.md).
 */
export default function NotificationPrefsCard() {
  const { prefs, loading, error, toggle, setAll, enabledCount, allOff } = useNotificationPrefs()
  const [confirmingOff, setConfirmingOff] = useState(false)

  if (loading) {
    return (
      <div className="rounded-2xl p-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Loading notification settings…
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-2xl p-4"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          backgroundClip: 'padding-box',
        }}>
        <div className="flex flex-wrap items-baseline gap-2 mb-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            What you get notified about
          </p>
          <span className="text-[10px] font-semibold tracking-widest"
            style={{ color: allOff ? 'var(--tt-red)' : 'var(--color-text-muted)' }}>
            {allOff ? 'ALL OFF' : `${enabledCount}/${NOTIFICATION_CATEGORIES.length} ON`}
          </span>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Everything’s on by default. Turn off anything you’d rather not hear about.
        </p>

        {error && (
          <p className="text-[11px] mb-2 px-2 py-1 rounded"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)' }}>
            ⚠ Couldn’t save that — {error}
          </p>
        )}

        <div className="flex flex-col">
          {NOTIFICATION_CATEGORIES.map((cat, i) => (
            <PrefRow
              key={cat.key}
              emoji={cat.emoji}
              label={cat.label}
              blurb={cat.blurb}
              on={prefs[cat.key]}
              first={i === 0}
              onToggle={() => toggle(cat.key)}
            />
          ))}
        </div>

        <p className="text-[11px] mt-3 pt-3"
          style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
          🔒 {ALWAYS_ON_COPY}
        </p>

        {!allOff && (
          <button
            type="button"
            onClick={() => setConfirmingOff(true)}
            className="w-full mt-3 py-2 rounded-xl text-xs font-semibold active:opacity-70"
            style={{
              background: 'transparent',
              color: 'var(--tt-red)',
              border: '1px solid rgba(255,85,85,0.45)',
            }}>
            Turn everything off
          </button>
        )}

        {allOff && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="w-full mt-3 py-2 rounded-xl text-xs font-semibold active:opacity-70"
            style={{
              background: 'var(--color-primary)',
              color: '#FFFFFF',
              border: '1px solid var(--color-primary)',
            }}>
            Turn everything back on
          </button>
        )}
      </div>

      {confirmingOff && (
        <ConfirmAllOff
          onCancel={() => setConfirmingOff(false)}
          onConfirm={() => { setAll(false); setConfirmingOff(false) }}
        />
      )}
    </>
  )
}

function PrefRow({ emoji, label, blurb, on, first, onToggle }: {
  emoji: string
  label: string
  blurb: string
  on: boolean
  first: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="w-full flex items-start gap-3 py-3 text-left active:opacity-70"
      style={{ borderTop: first ? 'none' : '1px solid var(--color-border)' }}>
      <span className="text-base leading-none mt-0.5" aria-hidden="true">{emoji}</span>
      {/* min-w-0 so a long blurb wraps instead of shoving the switch off-screen */}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {label}
        </span>
        <span className="block text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {blurb}
        </span>
      </span>
      <Switch on={on} />
    </button>
  )
}

/** 44px-wide touch-friendly switch. Purely presentational — the row is the button. */
function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex-shrink-0 mt-0.5 rounded-full transition-colors"
      style={{
        width: 44,
        height: 26,
        padding: 3,
        background: on ? 'var(--tt-green)' : 'var(--color-border)',
        display: 'inline-flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}>
      <span
        className="rounded-full"
        style={{ width: 20, height: 20, background: '#FFFFFF' }}
      />
    </span>
  )
}

/**
 * Confirm sheet for the nuclear option. Spells out what actually stops
 * arriving, and reassures that call-ups still come through — otherwise
 * "turn everything off" reads as "stop telling me I'm playing".
 */
function ConfirmAllOff({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.55)', zIndex: 100, cursor: 'pointer' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-2xl p-5"
        style={{
          maxWidth: 360,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          backgroundClip: 'padding-box',
          cursor: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
        }}>
        <p className="text-base font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
          Turn everything off?
        </p>
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
          You’ll stop getting notified when teams go up, when voting opens, when the
          match report lands, and about anything else from the club.
        </p>
        <p className="text-xs mb-4 px-3 py-2 rounded-lg"
          style={{ background: 'rgba(74,220,122,0.08)', color: 'var(--color-text-muted)' }}>
          🔒 {ALWAYS_ON_COPY}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-sm font-semibold active:opacity-70"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2 rounded-xl text-sm font-semibold active:opacity-70"
            style={{ background: 'var(--tt-red)', color: '#FFFFFF', border: '1px solid var(--tt-red)' }}>
            Turn all off
          </button>
        </div>
      </div>
    </div>
  )
}
