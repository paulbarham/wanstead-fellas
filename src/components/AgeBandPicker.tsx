// 5-option age band picker — the privacy-preserving fallback for anyone
// unwilling to share exact DOB. Uses the same tap-cycle shape as
// FootPicker / PositionPicker so the three nudges feel uniform.
//
// Persists as profiles.age_group in the canonical string form
// (Under 20 / 20–29 / 30–39 / 40–49 / 50+). Short label displayed on the
// button; long label in the aria description.

export type AgeBand = 'Under 20' | '20–29' | '30–39' | '40–49' | '50+'

export const AGE_BANDS: { value: AgeBand; label: string; long: string }[] = [
  { value: 'Under 20', label: 'U20', long: 'Under 20' },
  { value: '20–29',    label: '20s', long: '20 to 29' },
  { value: '30–39',    label: '30s', long: '30 to 39' },
  { value: '40–49',    label: '40s', long: '40 to 49' },
  { value: '50+',      label: '50+', long: '50 and over' },
]

interface Props {
  value: AgeBand | null
  onChange: (next: AgeBand | null) => void
  compact?: boolean
}

export default function AgeBandPicker({ value, onChange, compact = false }: Props) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
    >
      {AGE_BANDS.map(opt => {
        const selected = value === opt.value
        const ring = selected ? 'var(--tt-yellow)' : 'var(--color-border)'
        const bg = selected ? 'rgba(255, 212, 0, 0.1)' : 'var(--color-surface)'
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(selected ? null : opt.value)}
            aria-pressed={selected}
            aria-label={opt.long}
            className="flex flex-col items-center rounded-xl transition-colors"
            style={{
              background: bg,
              border: `1px solid ${ring}`,
              padding: compact ? '6px 4px' : '10px 4px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: compact ? 11 : 13,
                fontWeight: 800,
                letterSpacing: '0.05em',
                color: selected ? 'var(--tt-yellow)' : 'var(--color-text)',
              }}
            >
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
