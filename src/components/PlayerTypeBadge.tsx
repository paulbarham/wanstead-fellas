import type { PlayerType } from '../types'

const BADGE: Record<PlayerType, { label: string; color: string; bg: string }> = {
  subscribed: { label: 'SUB', color: '#0D6B52', bg: '#0a1a10' },
  wtp_priority: { label: 'WTP★', color: '#C9A227', bg: '#1a1300' },
  wtp: { label: 'WTP', color: '#666', bg: '#1e1e1e' },
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
