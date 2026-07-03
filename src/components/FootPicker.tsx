import { PREFERRED_FEET } from '../types'
import type { PreferredFoot } from '../types'

interface Props {
  value: PreferredFoot | null
  onChange: (next: PreferredFoot | null) => void
  compact?: boolean
}

// Three-option picker: LEFT · RIGHT · BOTH. Tap to set, tap again to clear.
// Mirrors PositionPicker's tap-cycle so the two nudges on Next Game feel
// identical.
export default function FootPicker({ value, onChange, compact = false }: Props) {
  return (
    <div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
      >
        {PREFERRED_FEET.map(opt => {
          const selected = value === opt.value
          const ringColor = selected ? 'var(--tt-yellow)' : 'var(--color-border)'
          const bg = selected ? 'rgba(255, 212, 0, 0.1)' : 'var(--color-surface)'
          const flip = opt.value === 'left'
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(selected ? null : opt.value)}
              aria-pressed={selected}
              aria-label={opt.full}
              className="flex flex-col items-center rounded-xl transition-colors"
              style={{
                background: bg,
                border: `1px solid ${ringColor}`,
                padding: compact ? '6px 4px' : '10px 4px',
              }}
            >
              <span
                style={{
                  fontSize: compact ? 18 : 22,
                  lineHeight: 1,
                  display: 'inline-block',
                  transform: flip ? 'scaleX(-1)' : undefined,
                }}
              >
                {opt.icon}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: compact ? 9 : 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  marginTop: 3,
                  color: selected ? 'var(--tt-yellow)' : 'var(--color-text)',
                }}
              >
                {opt.label}
              </span>
              {selected && (
                <span
                  style={{
                    fontSize: 8,
                    color: 'var(--tt-yellow)',
                    marginTop: 1,
                    letterSpacing: '0.04em',
                  }}
                >
                  PICKED
                </span>
              )}
            </button>
          )
        })}
      </div>
      {!compact && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Tap to set your natural side · tap again to clear.
        </p>
      )}
    </div>
  )
}
