import { useState } from 'react'
import { getClub, BADGE_URLS } from '../lib/clubs'
import type { Club } from '../types'

// Abstract, generic motifs — deliberately NOT reproductions of trademarked
// crests. Colour + simple shape recognition only. Glyphs not in this map fall
// back to the club's initials in the primary colour.
const GLYPHS: Record<string, (fg: string) => React.ReactNode> = {
  cannon: fg => <g fill={fg}><rect x="6" y="12" width="11" height="3.4" rx="0.6" /><circle cx="18" cy="13.7" r="2" /><rect x="7" y="15" width="2.4" height="3" /><rect x="12" y="15" width="2.4" height="3" /></g>,
  cockerel: fg => <g fill={fg}><path d="M13 6 C16 6 18 9 18 13 C18 17 15 19 13 19 C11 19 9 17 9 14 C9 13 9 12 10 11 L8 9 L11 9 C11 7 12 6 13 6 Z" /><path d="M17 7 L20 6 L18 9 Z" /><path d="M11 19 L10 23 M14 19 L15 23" stroke={fg} strokeWidth="1.1" /></g>,
  hammers: fg => <g stroke={fg} strokeWidth="1.6" strokeLinecap="round"><path d="M8 8 L17 19" /><path d="M17 8 L8 19" /><path d="M6 6 L10 10 M16 6 L20 10" /></g>,
  lion: fg => <g fill={fg}><circle cx="13" cy="13" r="4.5" /><path d="M13 7 L13 4 M9 9 L7 6 M17 9 L19 6 M8 14 L5 14 M18 14 L21 14 M10 19 L9 22 M16 19 L17 22" stroke={fg} strokeWidth="1.4" /></g>,
  lion_blue: fg => GLYPHS.lion(fg),
  lion_red: fg => GLYPHS.lion(fg),
  bee: fg => <g fill={fg}><ellipse cx="13" cy="14" rx="4" ry="5.5" /><path d="M9.5 12 H16.5 M9.5 15 H16.5" stroke="#000" strokeWidth="1" opacity="0.4" /><path d="M9 9 C5 6 5 11 9 11 M17 9 C21 6 21 11 17 11" /></g>,
  eagle: fg => <g fill={fg}><path d="M13 8 L13 19 M13 10 C9 7 5 8 4 11 C8 11 10 13 13 13 C16 13 18 11 22 11 C21 8 17 7 13 10 Z" /></g>,
  devil: fg => <g fill={fg}><path d="M9 7 L11 11 M17 7 L15 11" stroke={fg} strokeWidth="1.4" strokeLinecap="round" /><circle cx="13" cy="14" r="4.2" /><path d="M11 21 L13 18 L15 21 Z" /></g>,
  tree: fg => <g fill={fg}><path d="M13 6 C16 9 16 12 13 13 C10 12 10 9 13 6 Z M13 9 C17 12 17 16 13 17 C9 16 9 12 13 9 Z" /><rect x="12.2" y="16" width="1.6" height="5" /></g>,
  fox: fg => <g fill={fg}><path d="M7 9 L11 13 L9 18 L13 16 L17 18 L15 13 L19 9 L14 11 L13 8 L12 11 Z" /></g>,
  swan: fg => <g fill="none" stroke={fg} strokeWidth="1.6" strokeLinecap="round"><path d="M9 20 C9 13 12 9 16 9 C13 10 12 13 13 15 C14 17 12 20 9 20 Z" /></g>,
  owl: fg => <g fill={fg}><circle cx="10" cy="13" r="3" /><circle cx="16" cy="13" r="3" /><circle cx="10" cy="13" r="1" fill="#000" opacity="0.5" /><circle cx="16" cy="13" r="1" fill="#000" opacity="0.5" /><path d="M13 16 L13 21" stroke={fg} strokeWidth="1.4" /></g>,
  canary: fg => <g fill={fg}><circle cx="12" cy="13" r="4" /><path d="M16 13 L20 11 L18 14 Z" /><path d="M11 17 L10 21 M14 17 L15 21" stroke={fg} strokeWidth="1.1" /></g>,
  wolf: fg => <g fill={fg}><path d="M7 8 L10 12 L8 19 L13 16 L18 19 L16 12 L19 8 L15 11 L13 8 L11 11 Z" /></g>,
  seagull: fg => <g fill="none" stroke={fg} strokeWidth="1.8" strokeLinecap="round"><path d="M5 14 C8 10 11 10 13 14 C15 10 18 10 21 14" /></g>,
  stripes: fg => <g fill={fg}><rect x="7" y="7" width="2.6" height="14" /><rect x="11.7" y="7" width="2.6" height="14" /><rect x="16.4" y="7" width="2.6" height="14" /></g>,
  stripes_bw: fg => GLYPHS.stripes(fg),
  stripes_rw: fg => GLYPHS.stripes(fg),
  hoops: fg => <g fill="none" stroke={fg} strokeWidth="2.2"><path d="M6 11 H20 M6 15 H20 M6 19 H20" /></g>,
}

function initials(name: string): string {
  const words = name.replace(/&/g, ' ').split(/\s+/).filter(Boolean)
  return words.map(w => w[0]).join('').slice(0, 4).toUpperCase()
}

function ShieldBadge({ club, size }: { club: Club; size: number }) {
  const h = Math.round(size * (30 / 26))
  const glyph = GLYPHS[club.glyph]
  // Pick a foreground that contrasts the primary fill.
  const fg = club.secondary_color?.toUpperCase() === club.primary_color?.toUpperCase()
    ? '#FFFFFF'
    : club.secondary_color

  return (
    <span title={club.display_name} style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}>
      <svg width={size} height={h} viewBox="0 0 26 30" aria-label={club.display_name}>
        <path
          d="M2 2 H24 V16 C24 24 13 29 13 29 C13 29 2 24 2 16 Z"
          fill={club.primary_color}
          stroke={fg}
          strokeWidth="1.4"
        />
        {glyph ? (
          glyph(fg)
        ) : (
          <text
            x="13"
            y="17"
            textAnchor="middle"
            fontSize="7"
            fontWeight="800"
            fill={fg}
            style={{ letterSpacing: '-0.5px' }}
          >
            {initials(club.display_name)}
          </text>
        )}
      </svg>
    </span>
  )
}

export default function ClubBadge({
  slug,
  size = 26,
}: {
  slug: string | null | undefined
  size?: number
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const club = getClub(slug)
  if (!club) return null

  const url = slug ? BADGE_URLS[slug] : undefined
  if (url && !imgFailed) {
    return (
      <span title={club.display_name} style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}>
        <img
          src={url}
          alt={club.display_name}
          width={size}
          height={Math.round(size * (30 / 26))}
          onError={() => setImgFailed(true)}
          style={{ objectFit: 'contain', display: 'block' }}
        />
      </span>
    )
  }

  return <ShieldBadge club={club} size={size} />
}
