import { PREFERRED_POSITIONS } from '../types'
import type { PreferredPosition } from '../types'

interface Props {
  primary: PreferredPosition | null
  secondary: PreferredPosition | null
  onChange: (next: { primary: PreferredPosition | null; secondary: PreferredPosition | null }) => void
  // Compact mode = used inline (e.g. on the Next Game nudge). Default is the
  // full Profile-page treatment with labels and help text.
  compact?: boolean
}

// Tap cycle per slot:
//   primary unset, secondary unset           → tap sets primary
//   primary set (X), secondary unset         → tap X again clears it
//   primary set (X), secondary unset, tap Y  → secondary = Y
//   primary set (X), secondary set (Y), tap Y → secondary cleared
//   primary set (X), secondary set (Y), tap X → primary cleared, secondary
//                                                promotes to primary (so the
//                                                user can re-pick a primary
//                                                without two taps)
//   primary set (X), secondary unset, tap X  → primary cleared
export default function PositionPicker({ primary, secondary, onChange, compact = false }: Props) {
  function handleTap(p: PreferredPosition) {
    if (primary === p) {
      // Tapped primary → clear primary; promote secondary if present.
      onChange({ primary: secondary, secondary: null })
      return
    }
    if (secondary === p) {
      // Tapped current secondary → clear secondary.
      onChange({ primary, secondary: null })
      return
    }
    if (!primary) {
      onChange({ primary: p, secondary })
    } else {
      onChange({ primary, secondary: p })
    }
  }

  return (
    <div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
      >
        {PREFERRED_POSITIONS.map(opt => {
          const isPrimary = primary === opt.value
          const isSecondary = secondary === opt.value
          const ringColor = isPrimary
            ? 'var(--tt-yellow)'
            : isSecondary
              ? 'var(--tt-cyan)'
              : 'var(--color-border)'
          const bg = isPrimary
            ? 'rgba(255, 212, 0, 0.1)'
            : isSecondary
              ? 'rgba(74, 217, 255, 0.08)'
              : 'var(--color-surface)'
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTap(opt.value)}
              aria-pressed={isPrimary || isSecondary}
              aria-label={`${opt.full}${isPrimary ? ' (primary)' : isSecondary ? ' (secondary)' : ''}`}
              className="flex flex-col items-center rounded-xl transition-colors"
              style={{
                background: bg,
                border: `1px solid ${ringColor}`,
                padding: compact ? '6px 4px' : '10px 4px',
              }}
            >
              <span style={{ fontSize: compact ? 18 : 22, lineHeight: 1 }}>{opt.icon}</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: compact ? 9 : 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  marginTop: 3,
                  color: isPrimary ? 'var(--tt-yellow)' : isSecondary ? 'var(--tt-cyan)' : 'var(--color-text)',
                }}
              >
                {opt.label}
              </span>
              {(isPrimary || isSecondary) && (
                <span
                  style={{
                    fontSize: 8,
                    color: isPrimary ? 'var(--tt-yellow)' : 'var(--tt-cyan)',
                    marginTop: 1,
                    letterSpacing: '0.04em',
                  }}
                >
                  {isPrimary ? 'PRIMARY' : 'BACKUP'}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {!compact && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Tap once for primary · tap a second to set a backup · tap again to clear.
        </p>
      )}
    </div>
  )
}
