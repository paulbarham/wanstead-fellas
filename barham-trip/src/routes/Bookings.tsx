import { Check } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { bookings, slugKey } from '../lib/itinerary'
import { useRealtimeBookings } from '../hooks/useRealtimeBookings'
import { useAuth } from '../hooks/useAuth'

export default function Bookings() {
  const { bookings: ticks, toggle } = useRealtimeBookings()
  const { members } = useAuth()

  const done = bookings.filter((b) => ticks[slugKey(b.name)]?.checked).length

  function whoTicked(byId: string | null, at: string | null): string | null {
    if (!byId) return null
    const who = members.find((m) => m.id === byId)?.display_name ?? 'Someone'
    let when = ''
    try {
      if (at) when = ` · ${format(parseISO(at), 'd MMM')}`
    } catch {
      // ignore bad dates
    }
    return `${who}${when}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl text-navy">Bookings</h1>
          <p className="mt-1 text-[14px] text-navy/65">Shared checklist — everyone sees the ticks.</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl" style={{ color: 'var(--coral)' }}>
            {done}/{bookings.length}
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/45">done</div>
        </div>
      </div>

      <ul className="space-y-2">
        {bookings.map((b) => {
          const key = slugKey(b.name)
          const tick = ticks[key]
          const checked = tick?.checked ?? false
          const by = checked ? whoTicked(tick?.checked_by ?? null, tick?.checked_at ?? null) : null
          return (
            <li key={key}>
              <button
                onClick={() => toggle(key)}
                className="flex w-full items-start gap-3 rounded-card bg-white p-3.5 text-left shadow-card active:opacity-90"
                style={{ border: '1px solid rgba(14,58,72,0.08)', minHeight: 56 }}
              >
                <span
                  className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-md transition"
                  style={{
                    background: checked ? 'var(--coral)' : 'transparent',
                    border: checked ? '1px solid var(--coral)' : '1.5px solid rgba(14,58,72,0.25)',
                  }}
                >
                  {checked && <Check size={16} color="#fff" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[15px] font-semibold text-navy"
                    style={{ textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.6 : 1 }}
                  >
                    {b.name}
                  </div>
                  <div className="mt-0.5 text-[13px] leading-snug text-navy/60">{b.note}</div>
                  {by && (
                    <div className="mt-1 text-[12px] font-medium" style={{ color: 'var(--teal)' }}>
                      ✓ {by}
                    </div>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
