import { useParams, Link, Navigate } from 'react-router-dom'
import { ChevronRight, Info } from 'lucide-react'
import { getLeg, recommendedOption, legs } from '../lib/itinerary'
import DayBadge from '../components/DayBadge'
import LegBanner from '../components/LegBanner'
import LegIdeas from '../components/LegIdeas'

export default function Leg() {
  const { id } = useParams()
  const leg = getLeg(id ?? '')

  if (!leg) return <Navigate to={`/leg/${legs[0].id}`} replace />

  return (
    <div className="space-y-4">
      <LegBanner leg={leg} />

      {/* Notes callout */}
      <div
        className="rounded-card p-4"
        style={{ background: 'var(--sand-2)', border: '1px solid rgba(224,136,83,0.25)', backgroundClip: 'padding-box' }}
      >
        <div className="flex items-center gap-2">
          <Info size={16} style={{ color: 'var(--coral-dark)' }} />
          <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--coral-dark)' }}>
            Good to know
          </span>
        </div>
        <p className="mt-1.5 text-[14px] leading-relaxed text-navy/85">{leg.notes}</p>
      </div>

      {/* Timeline of days */}
      <div className="relative pl-2">
        <div className="space-y-2.5">
          {leg.days.map((day) => {
            const rec = recommendedOption(day)
            return (
              <Link
                key={day.n}
                to={`/day/${day.n}`}
                className="flex items-center gap-3 rounded-card bg-white p-3 shadow-card active:opacity-90"
                style={{ border: '1px solid rgba(14,58,72,0.08)' }}
              >
                <DayBadge n={day.n} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-navy/45">
                    {day.weekday} · {day.date}
                  </div>
                  <div className="font-display text-[17px] leading-tight text-navy">{day.title}</div>
                  {rec && (
                    <div className="mt-0.5 truncate text-[13px] text-navy/60">★ {rec.title}</div>
                  )}
                </div>
                <ChevronRight className="flex-shrink-0" style={{ color: 'rgba(14,58,72,0.35)' }} />
              </Link>
            )
          })}
        </div>
      </div>

      <LegIdeas leg={leg} />
    </div>
  )
}
