import { Lightbulb } from 'lucide-react'
import type { TripDay } from '../lib/itinerary'
import { recommendedOption, alternativeOptions, getLegForDay } from '../lib/itinerary'
import DayBadge from './DayBadge'
import OptionCard from './OptionCard'
import WeatherChip from './WeatherChip'
import DayPlan from './DayPlan'

interface Props {
  day: TripDay
  /** Small "TODAY" ribbon on the badge row. */
  isToday?: boolean
}

/** Full day page body — badge, title, recommended hero, alternatives, tip, family. */
export default function DayView({ day, isToday = false }: Props) {
  const rec = recommendedOption(day)
  const alts = alternativeOptions(day)
  const leg = getLegForDay(day.n)

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

      {/* The family's editable plan for the day */}
      <DayPlan day={day} />

      {/* Suggested plan */}
      <div>
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-navy/45">
          Suggested plan
        </h2>
        {rec && <OptionCard option={rec} hero />}
      </div>

      {/* Alternatives */}
      {alts.length > 0 && (
        <div>
          <h2 className="mb-2 mt-1 text-[13px] font-bold uppercase tracking-wide text-navy/45">
            Other ideas
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {alts.map((alt, i) => (
              <OptionCard key={i} option={alt} />
            ))}
          </div>
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
