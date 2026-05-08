import type { PlayerType } from '../types'

const BADGE: Record<PlayerType, { label: string; color: string; bg: string }> = {
  subscribed: { label: 'SUB', color: 'var(--color-success-text)', bg: 'var(--color-success-bg)' },
  wtp_priority: { label: 'WTP★', color: 'var(--color-warning-text)', bg: 'var(--color-warning-bg)' },
  wtp: { label: 'WTP', color: 'var(--color-text-muted)', bg: 'var(--color-bg)' },
}

export default function PlayerTypeBadge({ type }: { type: PlayerType }) {
  const s = BADGE[type]
  return (
    <span style={{
      fontSize: '0.58rem',
      fontWeight: 700,
      letterSpacing: '0.05em',
      padding: '1px 5px',
      borderRadius: 4,
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}55`,
      flexShrink: 0,
    }}>{s.label}</span>
  )
}
