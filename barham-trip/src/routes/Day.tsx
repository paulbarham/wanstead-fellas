import { useParams, Link, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getDay, FIRST_DAY_N, LAST_DAY_N } from '../lib/itinerary'
import { hasPrevDay, hasNextDay } from '../lib/date'
import DayView from '../components/DayView'

export default function Day() {
  const { n } = useParams()
  const dayN = Number(n)
  const day = getDay(dayN)

  // Scroll to top on day change.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [dayN])

  if (!day) {
    return <Navigate to={`/day/${FIRST_DAY_N}`} replace />
  }

  return (
    <div>
      <DayView day={day} />

      {/* Prev / next day nav */}
      <nav className="mt-6 flex items-stretch gap-3">
        {hasPrevDay(dayN) ? (
          <Link
            to={`/day/${dayN - 1}`}
            className="flex flex-1 items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-card active:opacity-80"
            style={{ border: '1px solid rgba(14,58,72,0.1)' }}
          >
            <ChevronLeft size={20} style={{ color: 'var(--coral)' }} />
            <div className="leading-tight">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/45">
                Yesterday
              </div>
              <div className="truncate text-[13px] font-semibold text-navy">
                {getDay(dayN - 1)?.title}
              </div>
            </div>
          </Link>
        ) : (
          <span className="flex-1" />
        )}

        {hasNextDay(dayN) ? (
          <Link
            to={`/day/${dayN + 1}`}
            className="flex flex-1 items-center justify-end gap-2 rounded-xl bg-white px-4 py-3 text-right shadow-card active:opacity-80"
            style={{ border: '1px solid rgba(14,58,72,0.1)' }}
          >
            <div className="leading-tight">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/45">
                Tomorrow
              </div>
              <div className="truncate text-[13px] font-semibold text-navy">
                {getDay(dayN + 1)?.title}
              </div>
            </div>
            <ChevronRight size={20} style={{ color: 'var(--coral)' }} />
          </Link>
        ) : (
          <span className="flex-1" />
        )}
      </nav>

      {dayN === LAST_DAY_N && (
        <p className="mt-4 text-center text-[13px] text-navy/50">The end of the trip. 🌴</p>
      )}
    </div>
  )
}
