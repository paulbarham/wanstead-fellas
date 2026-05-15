import type { CuntTier } from '../types'

const TIERS: Record<CuntTier, { label: string; bg: string; fg: string }> = {
  saint:     { label: 'THE SAINT',     bg: '#f7f1de', fg: '#3a2f1a' },
  gentleman: { label: 'THE GENTLEMAN', bg: '#1a2940', fg: '#e9e2d0' },
  scamp:     { label: 'THE SCAMP',     bg: '#c98b22', fg: '#1f1100' },
  nuisance:  { label: 'THE NUISANCE',  bg: '#6e1a22', fg: '#ffffff' },
  cunt:      { label: 'THE C*NT',      bg: '#1a0a0c', fg: '#aa1830' },
}

// Fallback only — cunt_tier is a generated DB column and should normally be set.
function tierFromValue(v: number): CuntTier {
  if (v <= 2) return 'saint'
  if (v <= 4) return 'gentleman'
  if (v <= 6) return 'scamp'
  if (v <= 8) return 'nuisance'
  return 'cunt'
}

function Motif({ tier, color }: { tier: CuntTier; color: string }) {
  const c = color
  switch (tier) {
    case 'saint': // halo ring
      return <svg width="11" height="11" viewBox="0 0 12 12"><ellipse cx="6" cy="4" rx="4" ry="1.6" fill="none" stroke={c} strokeWidth="1.2" /></svg>
    case 'gentleman': // bow tie
      return <svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 3 L5 6 L1 9 Z M11 3 L7 6 L11 9 Z" fill={c} /><rect x="5" y="4.5" width="2" height="3" rx="0.5" fill={c} /></svg>
    case 'scamp': // devil tail
      return <svg width="11" height="11" viewBox="0 0 12 12"><path d="M3 1 C3 6 3 9 7 9 C9 9 9 7 8 7" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" /><path d="M9 5 L11 7 L8 8 Z" fill={c} /></svg>
    case 'nuisance': // horns
      return <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 9 C2 4 4 3 5 3 M10 9 C10 4 8 3 7 3" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" /></svg>
    case 'cunt': // devil silhouette
      return <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 2 L4 5 M10 2 L8 5" stroke={c} strokeWidth="1.2" strokeLinecap="round" /><circle cx="6" cy="7" r="3.4" fill={c} /></svg>
  }
}

export default function CuntinessBadge({
  tier,
  value,
  size = 'sm',
}: {
  tier: CuntTier | null | undefined
  value: number | null | undefined
  size?: 'sm' | 'md'
}) {
  const resolved: CuntTier = tier ?? tierFromValue(value ?? 5)
  const s = TIERS[resolved]
  const isCunt = resolved === 'cunt'
  const fontSize = size === 'md' ? '0.62rem' : '0.52rem'
  const pad = size === 'md' ? '3px 8px' : '2px 6px'

  return (
    <span
      title={`Cuntiness ${value ?? '?'}/10 — ${s.label}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: s.bg,
        color: s.fg,
        padding: pad,
        borderRadius: 4,
        fontSize,
        fontWeight: 800,
        letterSpacing: '0.08em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        border: isCunt ? `1px solid ${s.fg}66` : `1px solid rgba(0,0,0,0.18)`,
        boxShadow: isCunt ? `0 0 7px ${s.fg}77` : 'none',
        flexShrink: 0,
      }}
    >
      <Motif tier={resolved} color={s.fg} />
      <span>{s.label}</span>
      {value != null && (
        <sup style={{ fontSize: '0.7em', opacity: 0.8, fontWeight: 700 }}>{value}</sup>
      )}
    </span>
  )
}
