import { Link } from 'react-router-dom'
import { ArrowRight, Plane, PartyPopper } from 'lucide-react'
import { tripPosition } from '../lib/date'
import { meta, allDays, FIRST_DAY_N } from '../lib/itinerary'
import DayView from '../components/DayView'

export default function Today() {
  const pos = tripPosition()

  if (pos.phase === 'during') {
    return <DayView day={pos.day} isToday />
  }

  if (pos.phase === 'before') {
    return <Countdown days={pos.daysUntil} />
  }

  return <TripDone daysSince={pos.daysSince} />
}

function Countdown({ days }: { days: number }) {
  const first = allDays[0]
  return (
    <div className="space-y-5">
      <div
        className="rounded-card p-6 text-center text-white shadow-card"
        style={{ backgroundImage: 'linear-gradient(160deg, #f6c9a0 0%, #e08853 42%, #0e3a48 100%)' }}
      >
        <Plane className="mx-auto mb-3 opacity-90" size={28} />
        <div className="font-display text-6xl leading-none">{days}</div>
        <div className="mt-2 text-[13px] font-semibold uppercase tracking-[0.2em] text-white/80">
          {days === 1 ? 'day to go' : 'days to go'}
        </div>
        <p className="mx-auto mt-4 max-w-[280px] text-[14px] text-white/90">{meta.notes}</p>
      </div>

      <Link
        to={`/day/${FIRST_DAY_N}`}
        className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card active:opacity-90"
        style={{ border: '1px solid rgba(14,58,72,0.1)' }}
      >
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--coral-dark)' }}>
            First day · {first.weekday} {first.date}
          </div>
          <div className="font-display text-lg text-navy">{first.title}</div>
        </div>
        <ArrowRight className="ml-auto flex-shrink-0" style={{ color: 'var(--coral)' }} />
      </Link>

      <Link to="/trip" className="btn-navy w-full">
        See the whole trip <ArrowRight size={18} />
      </Link>
    </div>
  )
}

function TripDone({ daysSince }: { daysSince: number }) {
  return (
    <div className="space-y-5">
      <div
        className="rounded-card p-6 text-center text-white shadow-card"
        style={{ backgroundImage: 'linear-gradient(160deg, #f6c9a0 0%, #e08853 42%, #0e3a48 100%)' }}
      >
        <PartyPopper className="mx-auto mb-3 opacity-90" size={28} />
        <h1 className="font-display text-3xl">That's a wrap!</h1>
        <p className="mt-2 text-[14px] text-white/90">
          The trip finished {daysSince} {daysSince === 1 ? 'day' : 'days'} ago. Relive any day below.
        </p>
      </div>
      <Link to="/trip" className="btn-coral w-full">
        Browse the trip <ArrowRight size={18} />
      </Link>
    </div>
  )
}
