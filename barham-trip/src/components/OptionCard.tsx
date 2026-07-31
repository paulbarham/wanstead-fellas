import { Star, Utensils } from 'lucide-react'
import type { TripOption } from '../lib/itinerary'

interface Props {
  option: TripOption
  /** Recommended renders as the full-width hero; alternatives are smaller. */
  hero?: boolean
}

/**
 * Renders one itinerary option.
 * NOTE: no `overflow: hidden` on these rounded cards — DM/serif bold titles
 * have negative left sidebearings and get clipped. We use backgroundClip
 * padding-box instead (see project UI conventions).
 */
export default function OptionCard({ option, hero = false }: Props) {
  const isRec = option.kind === 'recommended'

  return (
    <div
      className="rounded-card p-4 shadow-card"
      style={{
        background: isRec ? '#ffffff' : 'var(--sand-2)',
        border: `1px solid ${isRec ? 'rgba(224,136,83,0.35)' : 'rgba(74,136,150,0.28)'}`,
        backgroundClip: 'padding-box',
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isRec ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
            style={{ background: 'var(--coral)' }}
          >
            <Star size={12} fill="currentColor" strokeWidth={0} />
            Recommended
          </span>
        ) : (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
            style={{ background: 'var(--teal)' }}
          >
            Alternative
          </span>
        )}
        <span
          className="ml-auto inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
          style={{ background: 'var(--sand)', color: 'var(--coral-dark)' }}
        >
          {option.badge}
        </span>
      </div>

      <h3
        className={`font-display mt-3 leading-tight text-navy ${hero ? 'text-2xl' : 'text-lg'}`}
      >
        {option.title}
      </h3>

      <p className="mt-2 text-[15px] leading-relaxed text-navy/85">{option.plan}</p>

      <div
        className="mt-3 flex items-start gap-2 pt-3"
        style={{ borderTop: '1px dashed rgba(14,58,72,0.22)' }}
      >
        <Utensils size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--coral-dark)' }} />
        <p className="text-[14px] leading-snug text-navy/80">
          <span className="font-semibold text-navy">Food · </span>
          {option.food}
        </p>
      </div>
    </div>
  )
}
