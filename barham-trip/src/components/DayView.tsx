import { Lightbulb, EyeOff, RotateCcw } from 'lucide-react'
import type { TripDay } from '../lib/itinerary'
import { getLegForDay, optionKey } from '../lib/itinerary'
import { useAuth } from '../hooks/useAuth'
import { useDismissedOptions } from '../hooks/useDismissedOptions'
import { routeForDay } from '../lib/routes'
import DayBadge from './DayBadge'
import OptionCard from './OptionCard'
import WeatherChip from './WeatherChip'
import DayPlan from './DayPlan'
import StayCard from './StayCard'
import RouteMap from './RouteMap'

interface Props {
  day: TripDay
  /** Small "TODAY" ribbon on the badge row. */
  isToday?: boolean
}

/** Full day page body — badge, title, suggested plan, alternatives, tip. */
export default function DayView({ day, isToday = false }: Props) {
  const leg = getLegForDay(day.n)
  const route = routeForDay(day.n)
  const { isAdmin } = useAuth()
  const { dismissed, dismiss, restore } = useDismissedOptions(day.n)

  const dismissedSet = new Set(dismissed)
  const withKeys = day.options.map((o) => ({ o, key: optionKey(day.n, o) }))
  const visible = withKeys.filter((x) => !dismissedSet.has(x.key))
  const removed = withKeys.filter((x) => dismissedSet.has(x.key))
  const hero = visible[0]
  const rest = visible.slice(1)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <DayBadge iso={day.iso_date} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--coral-dark)' }}>
              {day.weekday} · {day.date}
            </span>
            {isToday && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ background: 'var(--coral)' }}
              >
                Today
              </span>
            )}
            {leg && (
              <span className="text-[12px] font-medium text-navy/50">{leg.title}</span>
            )}
          </div>
          <h1 className="font-display mt-1 text-2xl leading-tight text-navy">{day.title}</h1>
          <p className="mt-1 text-[14px] text-navy/70">{day.subtitle}</p>
        </div>
      </div>

      {leg && <WeatherChip legTitle={leg.title} isoDate={day.iso_date} />}

      {/* Where we're staying tonight — hotel, address, directions */}
      <StayCard day={day} />

      {/* Offline drive map on transfer days */}
      {route && <RouteMap route={route} />}

      {/* The family's editable plan for the day */}
      <DayPlan day={day} />

      {/* Suggested plan */}
      <div>
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-navy/45">
          Suggested plan
        </h2>
        {hero ? (
          <OptionCard
            option={hero.o}
            hero
            onRemove={isAdmin ? () => dismiss(hero.key) : undefined}
          />
        ) : (
          <p
            className="rounded-card p-4 text-[14px] text-navy/60"
            style={{ background: 'var(--sand-2)', border: '1px dashed rgba(14,58,72,0.2)' }}
          >
            No suggestions for this day — build your own in the plan above.
          </p>
        )}
      </div>

      {/* Alternatives */}
      {rest.length > 0 && (
        <div>
          <h2 className="mb-2 mt-1 text-[13px] font-bold uppercase tracking-wide text-navy/45">
            Other ideas
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {rest.map((x) => (
              <OptionCard
                key={x.key}
                option={x.o}
                onRemove={isAdmin ? () => dismiss(x.key) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Admin-only: restore removed suggestions */}
      {isAdmin && removed.length > 0 && (
        <div
          className="rounded-card p-3"
          style={{ background: 'var(--sand-2)', border: '1px dashed rgba(14,58,72,0.2)' }}
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-navy/45">
            <EyeOff size={13} /> Removed from the plan ({removed.length})
          </div>
          <ul className="space-y-1.5">
            {removed.map((x) => (
              <li key={x.key} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-navy/60">{x.o.title}</span>
                <button
                  onClick={() => restore(x.key)}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                  style={{ border: '1px solid rgba(14,58,72,0.18)', color: 'var(--teal)' }}
                >
                  <RotateCcw size={12} /> Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tip */}
      {day.tip && (
        <div
          className="rounded-card p-4 text-white"
          style={{ background: 'var(--navy)', backgroundClip: 'padding-box' }}
        >
          <div className="flex items-center gap-2">
            <Lightbulb size={16} style={{ color: '#f6c9a0' }} />
            <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#f6c9a0' }}>
              {day.tip.label}
            </span>
          </div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-white/90">{day.tip.body}</p>
        </div>
      )}
    </div>
  )
}
