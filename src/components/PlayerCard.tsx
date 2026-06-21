import type { Profile, TierType, PreferredPosition } from '../types'
import { getTier, PREFERRED_POSITIONS } from '../types'
import PlayerTypeBadge from './PlayerTypeBadge'
import CuntinessBadge from './CuntinessBadge'
import ClubBadge from './ClubBadge'

const TIER: Record<TierType, { bg: string; accent: string; label: string }> = {
  gold:     { bg: 'linear-gradient(150deg, #1a0533 0%, #2d0f5e 55%, #3d1a6e 100%)', accent: '#F0B429', label: 'GOLD' },
  silver:   { bg: 'linear-gradient(150deg, #0a1628 0%, #162d4a 55%, #1e3a5f 100%)', accent: '#C7CED6', label: 'SILVER' },
  bronze:   { bg: 'linear-gradient(150deg, #1a0e00 0%, #3d2000 55%, #5c3010 100%)', accent: '#CD7F32', label: 'BRONZE' },
  standard: { bg: 'linear-gradient(150deg, #0d0d0d 0%, #141414 55%, #1c1c1c 100%)', accent: '#8A8F98', label: 'STANDARD' },
}

// Position visual treatment — coloured pill on the card so the player's
// preferred position reads at a glance. Keys match the four PreferredPosition
// values (GK / DEF / MID / ATT); the legacy admin `position` (ST/MF/DF/GK) is
// mapped through too so older profiles still render a badge.
const POS_STYLE: Record<PreferredPosition, { bg: string; fg: string; icon: string; label: string }> = {
  GK:  { bg: '#0F2E18', fg: '#4ADC7A', icon: '🧤', label: 'GK' },
  DEF: { bg: '#0E2434', fg: '#4AD9FF', icon: '🛡️', label: 'DEF' },
  MID: { bg: '#2A2410', fg: '#FFD400', icon: '⚙️', label: 'MID' },
  ATT: { bg: '#2A0E1E', fg: '#FF66CC', icon: '⚽', label: 'ATT' },
}
function preferredPositionOf(p: Profile): PreferredPosition | null {
  if (p.preferred_position_primary) return p.preferred_position_primary
  // Fall back to the legacy admin-set position for older profiles. Stale
  // 'MD' values still exist in the DB outside the typed union, so coerce
  // through a string before matching.
  const legacy = (p.position ?? '') as string
  if (legacy === 'GK') return 'GK'
  if (legacy === 'DF') return 'DEF'
  if (legacy === 'MF' || legacy === 'MD') return 'MID'
  if (legacy === 'ST') return 'ATT'
  return null
}
function PositionBadge({ pos, size = 'lg' }: { pos: PreferredPosition; size?: 'lg' | 'sm' }) {
  const s = POS_STYLE[pos]
  const px = size === 'lg' ? 8 : 5
  const py = size === 'lg' ? 4 : 2
  const fs = size === 'lg' ? 12 : 9
  const icSize = size === 'lg' ? 13 : 10
  return (
    <span
      title={PREFERRED_POSITIONS.find(o => o.value === pos)?.full}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: `${py}px ${px}px`, borderRadius: 999,
        background: s.bg, color: s.fg,
        border: `1px solid ${s.fg}55`,
        fontFamily: 'ui-monospace, monospace',
        fontSize: fs, fontWeight: 800, letterSpacing: '0.04em',
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: icSize, lineHeight: 1 }}>{s.icon}</span>
      <span>{s.label}</span>
    </span>
  )
}

type Stat = { label: string; value: number | null }

function statsFor(p: Profile): Stat[] {
  // Use preferred position (player-set) over legacy admin `position` to
  // decide which stat set to show. So Kev who now self-identifies as GK
  // sees his GK stats even if admin hasn't updated the legacy field.
  const isGK = preferredPositionOf(p) === 'GK'
  const hasGk = p.gk_pace != null || p.gk_reflexes != null || p.gk_handling != null
  // New signups / My-Squad children have no card_* values yet — fall back to
  // overall_rating so the card shows a sensible baseline instead of "—".
  // Any admin-set value overrides this automatically.
  const base = p.overall_rating ?? 7
  if (isGK && hasGk) {
    return [
      { label: 'PAC', value: p.gk_pace ?? base },
      { label: 'REF', value: p.gk_reflexes ?? base },
      { label: 'HAN', value: p.gk_handling ?? base },
      { label: 'POS', value: p.gk_positioning ?? base },
      { label: 'DIS', value: p.gk_distribution ?? base },
      { label: 'PHY', value: p.gk_physicality ?? base },
    ]
  }
  return [
    { label: 'PAC', value: p.card_pace ?? base },
    { label: 'DRI', value: p.card_dribbling ?? base },
    { label: 'SHO', value: p.card_shooting ?? base },
    { label: 'DEF', value: p.card_defence ?? base },
    { label: 'PAS', value: p.card_passing ?? base },
    { label: 'PHY', value: p.card_physicality ?? base },
  ]
}

function Portrait({ p, accent, big }: { p: Profile; accent: string; big: boolean }) {
  if (p.photo_url) {
    return (
      <img src={p.photo_url} alt="" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', display: 'block',
      }} />
    )
  }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{
        fontFamily: 'display', fontSize: big ? '7rem' : '3.2rem',
        color: accent, opacity: 0.5, lineHeight: 1, letterSpacing: '-0.02em',
      }}>
        {p.name?.[0]}{p.surname?.[0]}
      </span>
    </div>
  )
}

interface Props {
  profile: Profile
  compact?: boolean
}

export default function PlayerCard({ profile, compact = false }: Props) {
  const tier = getTier(profile.overall_rating)
  const t = TIER[tier]
  const primaryPos = preferredPositionOf(profile)
  const secondaryPos = profile.preferred_position_secondary ?? null
  // Subtitle drops position now that it has its own prominent badge.
  const subtitle = profile.age_group ?? ''

  // ── Compact (grid thumbnail) ─────────────────────────────────────────────
  if (compact) {
    return (
      <div style={{
        borderRadius: 16, overflow: 'hidden', background: t.bg,
        border: `2px solid ${t.accent}55`, aspectRatio: '2 / 3',
        position: 'relative', userSelect: 'none', width: '100%',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3,
          padding: '6px 9px', background: `${t.accent}28`,
          borderBottom: `1px solid ${t.accent}30`,
        }}>
          <span style={{ color: t.accent, fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em' }}>{t.label}</span>
        </div>

        <div style={{
          position: 'absolute', top: 24, right: 7, zIndex: 3,
          background: '#f5f5f0', borderRadius: 7, width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: '#1a1a1a', fontFamily: 'display', fontSize: '1rem', lineHeight: 1 }}>
            {profile.overall_rating}
          </span>
        </div>

        {/* Compact position badge under OVR — secondary kept off compact card */}
        {primaryPos && (
          <div style={{ position: 'absolute', top: 56, right: 7, zIndex: 3 }}>
            <PositionBadge pos={primaryPos} size="sm" />
          </div>
        )}

        <div style={{ position: 'absolute', top: 24, bottom: 42, left: 0, right: 0, overflow: 'hidden' }}>
          <Portrait p={profile} accent={t.accent} big={false} />
        </div>

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
          padding: '20px 8px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
        }}>
          <p style={{ color: 'white', fontFamily: 'display', fontSize: '0.78rem', lineHeight: 1.1, letterSpacing: '0.03em' }}>
            {profile.name?.toUpperCase()} {profile.surname?.toUpperCase()}
          </p>
          <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <PlayerTypeBadge type={profile.player_type ?? 'wtp'} />
            <ClubBadge slug={profile.favourite_club} size={18} />
          </div>
        </div>
      </div>
    )
  }

  // ── Full card ────────────────────────────────────────────────────────────
  const stats = statsFor(profile)

  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden', background: t.bg,
      border: `2px solid ${t.accent}66`, boxShadow: `0 0 0 1px ${t.accent}22 inset`,
      userSelect: 'none', position: 'relative',
    }}>
      {/* 1. Tier strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 14px', background: `${t.accent}26`,
        borderBottom: `1px solid ${t.accent}40`, position: 'relative', zIndex: 5,
      }}>
        <span style={{ color: t.accent, fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.18em' }}>{t.label}</span>
        <span style={{ color: t.accent, fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', opacity: 0.7 }}>WANSTEAD FELLAS</span>
      </div>

      {/* 2. Portrait zone */}
      <div style={{ position: 'relative', aspectRatio: '5 / 4', overflow: 'hidden', zIndex: 2 }}>
        <Portrait p={profile} accent={t.accent} big />

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
          background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.88) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Overall rating bubble */}
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 3,
          background: '#f5f5f0', borderRadius: 9, width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
        }}>
          <span style={{ color: '#1a1a1a', fontFamily: 'display', fontSize: '1.5rem', lineHeight: 1 }}>
            {profile.overall_rating}
          </span>
        </div>

        {/* Position badge stack (primary + optional secondary) below OVR */}
        {primaryPos && (
          <div style={{
            position: 'absolute', top: 56, right: 12, zIndex: 3,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
          }}>
            <PositionBadge pos={primaryPos} size="lg" />
            {secondaryPos && (
              <span style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: 9, letterSpacing: '0.05em',
                color: 'rgba(255,255,255,0.7)',
                background: 'rgba(0,0,0,0.45)',
                padding: '2px 6px', borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.15)',
              }}>
                also {POS_STYLE[secondaryPos].icon} {secondaryPos}
              </span>
            )}
          </div>
        )}

        {/* Name + age (position now lives in its own badge) */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 16px 12px', zIndex: 3 }}>
          <p style={{ fontFamily: 'display', fontSize: '1.5rem', color: 'white', lineHeight: 1, letterSpacing: '0.02em' }}>
            {profile.name?.toUpperCase()} {profile.surname?.toUpperCase()}
          </p>
          {subtitle && (
            <p style={{ color: t.accent, fontSize: '0.7rem', letterSpacing: '0.14em', fontWeight: 700, marginTop: 5 }}>
              {subtitle.toUpperCase()}
            </p>
          )}
        </div>
      </div>

      {/* 3. Stats grid */}
      <div style={{ padding: '12px 14px 10px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {stats.map((stat, i) => (
            <div key={i} style={{
              background: 'rgba(0,0,0,0.42)', borderRadius: 10, padding: '8px 10px',
              border: `1px solid ${t.accent}3d`, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ color: t.accent, fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em' }}>
                {stat.label}
              </span>
              <span style={{ color: 'white', fontSize: '1rem', fontWeight: 700, lineHeight: 1 }}>
                {stat.value ?? '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Badge row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '0 14px 14px', position: 'relative', zIndex: 2,
      }}>
        <PlayerTypeBadge type={profile.player_type ?? 'wtp'} />
        <CuntinessBadge tier={profile.cunt_tier} value={profile.cunt} />
        <div style={{ marginLeft: 'auto' }}>
          <ClubBadge slug={profile.favourite_club} size={24} />
        </div>
      </div>
    </div>
  )
}
