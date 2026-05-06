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
    bg: 'linear-gradient(160deg, #1a1430 0%, #2d1f5e 50%, #1a0e3a 100%)',
    accent: '#C9A227',
    label: 'GOLD',
    textColor: '#000',
  },
  silver: {
    bg: 'linear-gradient(160deg, #0d1829 0%, #1a2840 50%, #0a1220 100%)',
    accent: '#9BAAB5',
    label: 'SILVER',
    textColor: '#000',
  },
  bronze: {
    bg: 'linear-gradient(160deg, #1a0e08 0%, #2e1a0e 50%, #1a0e05 100%)',
    accent: '#A0714F',
    label: 'BRONZE',
    textColor: '#fff',
  },
  standard: {
    bg: 'linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 50%, #0a0a0a 100%)',
    accent: '#7a7a7a',
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
          <span style={{ color: s.accent, fontSize: '0.6rem', fontFamily: "'DM Mono', monospace", fontWeight: 700, letterSpacing: '0.15em' }}>WF</span>
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
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1,
        }}>
          {profile.photo_url ? (
            <img src={profile.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
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
      background: '#0a0a0a',
      border: `2px solid ${s.accent}44`,
      userSelect: 'none',
    }}>
      {/* Hero photo section */}
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: s.bg, overflow: 'hidden' }}>

        {/* Top accent line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.accent, zIndex: 5 }} />

        {/* Shine */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.09) 0%, transparent 55%)',
        }} />

        {/* Photo or initials */}
        {profile.photo_url ? (
          <img src={profile.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'display', fontSize: '7rem', color: s.accent, opacity: 0.3, lineHeight: 1 }}>
              {profile.name?.[0]}{profile.surname?.[0]}
            </span>
          </div>
        )}

        {/* Gradient vignette over photo */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.92))',
          zIndex: 2,
        }} />

        {/* Name + tier */}
        <div style={{ position: 'absolute', bottom: 14, left: 16, right: 70, zIndex: 4 }}>
          <p style={{ fontFamily: 'display', fontSize: '1.5rem', color: 'white', lineHeight: 1, letterSpacing: '0.02em' }}>
            {profile.name?.toUpperCase()} {profile.surname?.toUpperCase()}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <p style={{ color: s.accent, fontSize: '0.7rem', letterSpacing: '0.12em', fontWeight: 700 }}>
              {s.label} · WANSTEAD FELLAS
            </p>
            <PlayerTypeBadge type={profile.player_type ?? 'wtp'} />
          </div>
        </div>

        {/* Overall badge */}
        <div style={{
          position: 'absolute', bottom: 14, right: 14, zIndex: 4,
          background: s.accent, borderRadius: 12, padding: '6px 12px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <span style={{ color: s.textColor, fontFamily: 'display', fontSize: '1.9rem', lineHeight: 1 }}>
            {profile.overall_rating}
          </span>
          <span style={{ color: s.textColor, fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7 }}>OVR</span>
        </div>

        {/* Badges */}
        {badges.length > 0 && (
          <div style={{ position: 'absolute', top: 14, left: 12, zIndex: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {badges.map(b => (
              <span key={b} style={{
                background: BADGE_STYLES[b].bg, color: 'white',
                fontSize: '0.6rem', padding: '3px 7px', borderRadius: 5, fontWeight: 700,
              }}>{b}</span>
            ))}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ padding: '14px 14px 10px', background: '#0a0a0a' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {stats.map(stat => (
            <div key={stat.label} style={{
              background: '#141414', borderRadius: 10, padding: '8px 10px',
              border: `1px solid ${s.accent}22`,
            }}>
              <p style={{ color: s.accent, fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 5 }}>
                {stat.label}
              </p>
              {stat.displayValue ? (
                <p style={{ color: 'white', fontSize: '0.95rem', fontWeight: 700 }}>{stat.displayValue}</p>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ flex: 1, height: 3, background: `${s.accent}22`, borderRadius: 2 }}>
                      <div style={{ width: `${stat.value * 10}%`, height: '100%', background: s.accent, borderRadius: 2 }} />
                    </div>
                    <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700, minWidth: 12, textAlign: 'right' }}>
                      {stat.value}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
