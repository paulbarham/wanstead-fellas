// Direct cuntiness score badge — shows the raw /10 value, colour-graded by
// severity. (Replaced the tier-name/motif version, which lost its punch.)
function colours(v: number): { bg: string; fg: string; glow: boolean } {
  if (v <= 3) return { bg: 'var(--color-success-bg)', fg: 'var(--color-success-text)', glow: false }
  if (v <= 6) return { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning-text)', glow: false }
  if (v <= 8) return { bg: '#6e1a22', fg: '#ffffff', glow: false }
  return { bg: '#1a0a0c', fg: '#ff2d4d', glow: true }
}

export default function CuntinessBadge({
  value,
  size = 'sm',
}: {
  tier?: unknown
  value: number | null | undefined
  size?: 'sm' | 'md'
}) {
  if (value == null) return null
  const c = colours(value)
  const fontSize = size === 'md' ? '0.62rem' : '0.58rem'
  const pad = size === 'md' ? '2px 7px' : '1px 5px'

  return (
    <span
      title={`Cuntiness ${value}/10`}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 2,
        background: c.bg,
        color: c.fg,
        padding: pad,
        borderRadius: 4,
        fontWeight: 800,
        letterSpacing: '0.05em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        border: `1px solid ${c.fg}55`,
        boxShadow: c.glow ? `0 0 7px ${c.fg}88` : 'none',
        flexShrink: 0,
        fontSize,
      }}
    >
      <span>CUNTINESS</span>
      <span style={{ fontSize: '1.05em' }}>{value}</span>
      <span style={{ fontSize: '0.8em', opacity: 0.7, fontWeight: 700 }}>/10</span>
    </span>
  )
}
