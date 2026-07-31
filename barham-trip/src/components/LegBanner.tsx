import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Leg } from '../lib/itinerary'

interface Props {
  leg: Leg
  /** When true, renders as a tappable card linking to the leg. */
  asLink?: boolean
}

/** Cover-gradient region banner used on the Trip list and Leg header. */
export default function LegBanner({ leg, asLink = false }: Props) {
  const inner = (
    <div
      className="relative rounded-card p-5 text-white shadow-card"
      style={{
        backgroundImage: 'linear-gradient(135deg, #e08853 0%, #0e3a48 100%)',
        backgroundClip: 'padding-box',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="font-display text-4xl leading-none opacity-90">{leg.num}</span>
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight">{leg.title}</h2>
          <p className="text-[13px] font-medium uppercase tracking-wide text-white/80">
            {leg.range}
          </p>
        </div>
        {asLink && <ChevronRight className="ml-auto flex-shrink-0 opacity-80" />}
      </div>
      <p className="mt-3 text-[14px] leading-snug text-white/90">{leg.tagline}</p>
    </div>
  )

  if (asLink) {
    return (
      <Link to={`/leg/${leg.id}`} className="block active:opacity-90">
        {inner}
      </Link>
    )
  }
  return inner
}
