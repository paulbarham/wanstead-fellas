import { addDays, format, parseISO } from 'date-fns'
import { BedDouble, MapPin, Navigation, PlaneTakeoff } from 'lucide-react'
import type { TripDay } from '../lib/itinerary'
import { hotelForDay } from '../lib/itinerary'

interface Props {
  day: TripDay
}

/** "Tonight's stay" — the hotel the family sleeps at on this day, with address
 *  and a one-tap Maps link so proximity and directions are easy to work out. */
export default function StayCard({ day }: Props) {
  const stay = hotelForDay(day)

  // No overnight stay (the final departure day).
  if (!stay) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-card p-3.5"
        style={{ background: 'var(--sand-2)', border: '1px solid rgba(14,58,72,0.08)' }}
      >
        <PlaneTakeoff size={17} style={{ color: 'var(--coral-dark)' }} className="flex-shrink-0" />
        <span className="text-[13px] font-medium text-navy/70">Checking out — flying home today. No overnight stay.</span>
      </div>
    )
  }

  const isCheckIn = day.iso_date === stay.check_in
  const isLastNight = format(addDays(parseISO(day.iso_date), 1), 'yyyy-MM-dd') === stay.check_out
  const mapsQuery = encodeURIComponent(`${stay.name}, ${stay.address}`)
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`
  const placeUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`

  return (
    <div
      className="rounded-card p-4 shadow-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid rgba(14,58,72,0.1)',
        backgroundClip: 'padding-box',
      }}
    >
      <div className="flex items-center gap-2">
        <BedDouble size={17} style={{ color: 'var(--coral-dark)' }} />
        <span className="text-[12px] font-bold uppercase tracking-wide text-navy/45">
          Tonight&rsquo;s stay
        </span>
        {isCheckIn && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ background: 'var(--coral)' }}
          >
            Check-in
          </span>
        )}
        {isLastNight && !isCheckIn && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: 'var(--sand)', color: 'var(--coral-dark)' }}
          >
            Last night
          </span>
        )}
      </div>

      <a
        href={placeUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block active:opacity-70"
      >
        <div className="font-display text-[18px] leading-tight text-navy">{stay.name}</div>
        <div className="mt-1 flex items-start gap-1.5 text-[13px] text-navy/65">
          <MapPin size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--coral-dark)' }} />
          <span>{stay.address}</span>
        </div>
      </a>

      <a
        href={directionsUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-white active:opacity-90"
        style={{ background: 'var(--teal)', minHeight: 40 }}
      >
        <Navigation size={15} /> Directions
      </a>
    </div>
  )
}
