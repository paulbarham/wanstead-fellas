import { useEffect } from 'react'
import { X, CalendarArrowUp, Check } from 'lucide-react'
import { legs } from '../lib/itinerary'

interface Props {
  title: string
  currentDay: number
  onPick: (toDay: number) => void
  onClose: () => void
}

/** Bottom sheet to move a day-plan activity to another day of the trip. */
export default function MoveDaySheet({ title, currentDay, onPick, onClose }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, cursor: 'pointer' }}
      className="flex items-end justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 430,
          maxHeight: '85vh',
          background: 'var(--surface)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: '0 -12px 40px rgba(0,0,0,0.45)',
          cursor: 'default',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        className="flex flex-col overflow-hidden"
      >
        <div className="flex-shrink-0 px-4 pt-2">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{ background: 'rgba(14,58,72,0.2)' }} />
          <div className="flex items-center gap-2 pb-1">
            <CalendarArrowUp size={18} style={{ color: 'var(--coral-dark)' }} />
            <h3 className="font-display text-lg text-navy">Move to another day</h3>
            <button
              onClick={onClose}
              className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-navy/45"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <p className="truncate pb-2 text-[13px] text-navy/60">{title}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {legs.map((leg) => (
            <div key={leg.id} className="mt-3 first:mt-0">
              <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-navy/45">
                {leg.title}
              </div>
              <div className="divide-y overflow-hidden rounded-xl" style={{ border: '1px solid rgba(14,58,72,0.12)', borderColor: 'rgba(14,58,72,0.06)' }}>
                {leg.days.map((d) => {
                  const isCurrent = d.n === currentDay
                  return (
                    <button
                      key={d.n}
                      disabled={isCurrent}
                      onClick={() => onPick(d.n)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left disabled:opacity-45 active:opacity-70"
                      style={{ background: 'var(--surface)' }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--coral-dark)' }}>
                          {d.weekday} {d.date}
                        </div>
                        <div className="truncate text-[14px] font-medium text-navy">{d.title}</div>
                      </div>
                      {isCurrent && (
                        <span className="flex items-center gap-1 text-[12px] font-medium text-navy/40">
                          <Check size={13} /> here now
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
