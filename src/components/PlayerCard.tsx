import type { Profile, TierType } from '../types'
import { getTier } from '../types'
import PlayerTypeBadge from './PlayerTypeBadge'
import CuntinessBadge from './CuntinessBadge'
import ClubBadge from './ClubBadge'

const TIER: Record<TierType, { bg: string; accent: string; label: string }> = {
  gold:     { bg: 'linear-gradient(150deg, #1a0533 0%, #2d0f5e 55%, #3d1a6e 100%)', accent: '#F0B429', label: 'GOLD' },
  silver:   { bg: 'linear-gradient(150deg, #0a1628 0%, #162d4a 55%, #1e3a5f 100%)', accent: '#C7CED6', label: 'SILVER' },
  bronze:   { bg: 'linear-gradient(150deg, #1a0e00 0%, #3d2000 55%, #5c3010 100%)', accent: '#CD7F32', label: 'BRONZE' },
  standard: { bg: 'linear-gradient(150deg, #0d0d0d 0%, #141414 55%, #1c1c1c 100%)', accent: '#8A8F98', label: 'STANDARD' },
}

type Stat = { label: string; value: number | null }

function statsFor(p: Profile): Stat[] {
  const isGK = p.position === 'GK'
  const hasGk = p.gk_pace != null || p.gk_reflexes != null || p.gk_handling != null
  if (isGK && hasGk) {
    return [
      { label: 'PAC', value: p.gk_pace },
      { label: 'REF', value: p.gk_reflexes },
      { label: 'HAN', value: p.gk_handling },
      { label: 'POS', value: p.gk_positioning },
      { label: 'DIS', value: p.gk_distribution },
      { label: 'PHY', value: p.gk_physicality },
    ]
  }
  return [
    { label: 'PAC', value: p.card_pace },
    { label: 'DRI', value: p.card_dribbling },
    { label: 'SHO', value: p.card_shooting },
    { label: 'DEF', value: p.card_defence },
    { label: 'PAS', value: p.card_passing },
    { label: 'PHY', value: p.card_physicality },
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
  const subtitle = [profile.age_group, profile.position].filter(Boolean).join(' · ')

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

        {/* Name + age · position */}
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
