import { costs } from '../lib/itinerary'

export default function Costs() {
  // Treat a row literally named like a total as the emphasised summary row.
  const isTotal = (item: string) => /total/i.test(item)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl text-navy">Costs</h1>
        <p className="mt-1 text-[14px] text-navy/65">Rough budget for the trip — read-only.</p>
      </div>

      <div
        className="overflow-hidden rounded-card bg-white shadow-card"
        style={{ border: '1px solid rgba(14,58,72,0.08)' }}
      >
        {costs.map((c, i) => {
          const total = isTotal(c.item)
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-3 px-4 py-3.5"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid rgba(14,58,72,0.07)',
                background: total ? 'var(--navy)' : 'transparent',
              }}
            >
              <span
                className={`text-[14px] ${total ? 'font-display text-lg font-semibold text-white' : 'font-medium text-navy/85'}`}
              >
                {c.item}
              </span>
              <span
                className={`flex-shrink-0 whitespace-nowrap font-semibold ${total ? 'font-display text-xl text-white' : 'text-[15px]'}`}
                style={{ color: total ? '#fff' : 'var(--coral-dark)' }}
              >
                {c.amount}
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-center text-[12px] text-navy/45">
        Estimates in GBP — actuals will vary with exchange rate and bookings.
      </p>
    </div>
  )
}
