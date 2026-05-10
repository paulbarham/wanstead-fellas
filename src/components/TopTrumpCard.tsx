import type { Profile, BadgeType } from '../types'
import { getTier, calcStrength, calcTeamPlayer, calcTechnical } from '../types'
import PlayerTypeBadge from './PlayerTypeBadge'

const BADGE_STYLES: Record<BadgeType, { bg: string; color: string }> = {
  'Super Sharp Shooter': { bg: '#C0392B', color: 'white' },
  'Legend': { bg: '#B7860B', color: 'white' },
  'Captain': { bg: '#1A56DB', color: 'white' },
}

const TIER_STYLES = {
  gold: {
    bg: 'linear-gradient(145deg, #1a0533 0%, #2d0f5e 50%, #3d1a6e 100%)',
    accent: '#F0B429',
    label: 'GOLD',
    textColor: '#000',
  },
  silver: {
    bg: 'linear-gradient(145deg, #0a1628 0%, #162d4a 50%, #1e3a5f 100%)',
    accent: '#94A3B8',
    label: 'SILVER',
    textColor: '#000',
  },
  bronze: {
    bg: 'linear-gradient(145deg, #1a0e00 0%, #3d2000 50%, #5c3010 100%)',
    accent: '#CD7F32',
    label: 'BRONZE',
    textColor: '#fff',
  },
  standard: {
    bg: 'linear-gradient(145deg, #0d0d0d 0%, #141414 50%, #1c1c1c 100%)',
    accent: '#6B7280',
    label: 'STD',
    textColor: '#fff',
  },
}

interface Props {
  profile: Profile
  isAdmin?: boolean
  compact?: boolean
}

export default function TopTrumpCard({ profile, compact = false }: Props) {
  const tier = getTier(profile.overall_rating)
  const s = TIER_STYLES[tier]
  const badges = (profile.badges ?? []) as BadgeType[]

  // ── Compact card (grid thumbnail) ────────────────────────────────────────
  if (compact) {
    return (
      <div style={{
        borderRadius: 16,
        overflow: 'hidden',
        background: s.bg,
        border: `2px solid ${s.accent}55`,
        aspectRatio: '2 / 3',
        position: 'relative',
        userSelect: 'none',
        width: '100%',
      }}>
        {/* Gloss shine */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.13) 0%, transparent 55%)',
        }} />

        {/* Top strip */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '7px 9px 6px',
          background: `${s.accent}28`,
          borderBottom: `1px solid ${s.accent}30`,
        }}>
          <span style={{ color: s.accent, fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', opacity: 0.9 }}>{s.label}</span>
        </div>

        {/* Overall rating badge */}
        <div style={{
          position: 'absolute', top: 26, right: 7, zIndex: 3,
          background: s.accent, borderRadius: 7, padding: '2px 6px',
        }}>
          <span style={{ color: s.textColor, fontSize: '0.95rem', fontFamily: 'display', fontWeight: 700, lineHeight: 1 }}>
            {profile.overall_rating}
          </span>
        </div>

        {/* Photo / initials — fills the card body */}
        <div style={{
          position: 'absolute', top: 26, bottom: 44, left: 0, right: 0,
          overflow: 'hidden',
          zIndex: 1,
        }}>
          {profile.photo_url ? (
            <img src={profile.photo_url} alt="" style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              borderRadius: 0,
              display: 'block',
            }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{
                fontFamily: 'display',
                fontSize: '3.2rem',
                color: s.accent,
                opacity: 0.45,
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}>
                {profile.name?.[0]}{profile.surname?.[0]}
              </span>
            </div>
          )}
        </div>

        {/* Bottom name band */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
          padding: '22px 8px 8px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.88))',
        }}>
          <p style={{
            color: 'white', fontFamily: 'display',
            fontSize: '0.78rem', lineHeight: 1.1, letterSpacing: '0.03em',
          }}>
            {profile.name?.toUpperCase()} {profile.surname?.toUpperCase()}
          </p>
          <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            <PlayerTypeBadge type={profile.player_type ?? 'wtp'} />
            {badges.slice(0, 1).map(b => (
              <span key={b} style={{
                background: BADGE_STYLES[b].bg, color: 'white',
                fontSize: '0.48rem', padding: '1px 4px', borderRadius: 3, fontWeight: 700,
              }}>{b}</span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Full card (modal view) ────────────────────────────────────────────────
  const stats = [
    { label: 'AGE', value: 0, displayValue: profile.age_group ?? '—' },
    { label: 'STR', value: calcStrength(profile) },
    { label: 'SPD', value: profile.sp },
    { label: 'TEAM', value: calcTeamPlayer(profile) },
    { label: 'TECH', value: calcTechnical(profile) },
    { label: 'C*NT', value: profile.cunt },
  ]

  return (
    <div style={{
      borderRadius: 20,
      overflow: 'hidden',
      background: s.bg,
      border: `2px solid ${s.accent}66`,
      boxShadow: `0 0 0 1px ${s.accent}22 inset`,
      userSelect: 'none',
      position: 'relative',
    }}>
      {/* Top accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.accent, zIndex: 5 }} />

      {/* Card-wide gloss shine */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 55%)',
      }} />

      {/* Photo zone — top portion, rectangular full-bleed */}
      <div style={{ position: 'relative', aspectRatio: '5 / 4', overflow: 'hidden', zIndex: 2 }}>
        {profile.photo_url ? (
          <img
            src={profile.photo_url}
            alt=""
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              borderRadius: 0,
              display: 'block',
            }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'display', fontSize: '7rem', color: s.accent, opacity: 0.5, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {profile.name?.[0]}{profile.surname?.[0]}
            </span>
          </div>
        )}

        {/* Bottom fade — blends photo into gradient below */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
          background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.85) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Badges (top-left of photo) */}
        {badges.length > 0 && (
          <div style={{ position: 'absolute', top: 14, left: 12, zIndex: 3, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {badges.map(b => (
              <span key={b} style={{
                background: BADGE_STYLES[b].bg, color: 'white',
                fontSize: '0.6rem', padding: '3px 7px', borderRadius: 5, fontWeight: 700,
              }}>{b}</span>
            ))}
          </div>
        )}

        {/* OVR badge (top-right of photo, tier-coloured) */}
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 3,
          background: s.accent, borderRadius: 12, padding: '6px 12px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
        }}>
          <span style={{ color: s.textColor, fontFamily: 'display', fontSize: '1.9rem', lineHeight: 1 }}>
            {profile.overall_rating}
          </span>
          <span style={{ color: s.textColor, fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.75 }}>OVR</span>
        </div>
      </div>

      {/* Name + tier label band — sits on the gradient */}
      <div style={{ padding: '12px 16px 6px', position: 'relative', zIndex: 2 }}>
        <p style={{ fontFamily: 'display', fontSize: '1.45rem', color: 'white', lineHeight: 1, letterSpacing: '0.02em' }}>
          {profile.name?.toUpperCase()} {profile.surname?.toUpperCase()}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
          <p style={{ color: s.accent, fontSize: '0.7rem', letterSpacing: '0.14em', fontWeight: 700 }}>
            {s.label} · WANSTEAD FELLAS
          </p>
          <PlayerTypeBadge type={profile.player_type ?? 'wtp'} />
        </div>
      </div>

      {/* Stats grid — translucent cells so gradient bleeds through */}
      <div style={{ padding: '8px 14px 14px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {stats.map(stat => (
            <div key={stat.label} style={{
              background: 'rgba(0,0,0,0.42)',
              borderRadius: 10, padding: '8px 10px',
              border: `1px solid ${s.accent}3d`,
            }}>
              <p style={{ color: s.accent, fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 5 }}>
                {stat.label}
              </p>
              {stat.displayValue ? (
                <p style={{ color: 'white', fontSize: '0.95rem', fontWeight: 700 }}>{stat.displayValue}</p>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ flex: 1, height: 4, background: `${s.accent}33`, borderRadius: 2 }}>
                    <div style={{ width: `${stat.value * 10}%`, height: '100%', background: s.accent, borderRadius: 2 }} />
                  </div>
                  <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700, minWidth: 12, textAlign: 'right' }}>
                    {stat.value}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
