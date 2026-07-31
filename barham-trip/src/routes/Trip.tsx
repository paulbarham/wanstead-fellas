import { legs, meta, TOTAL_DAYS } from '../lib/itinerary'
import LegBanner from '../components/LegBanner'

export default function Trip() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl text-navy">The trip</h1>
        <p className="mt-1 text-[14px] text-navy/65">
          {meta.trip} · {TOTAL_DAYS} days · {meta.travellers} of us · five legs up and down the coast.
        </p>
      </div>

      <div className="space-y-3">
        {legs.map((leg) => (
          <LegBanner key={leg.id} leg={leg} asLink />
        ))}
      </div>

      <p className="pt-2 text-center text-[12px] text-navy/45">
        Tap a leg to see its days. Everything works offline once installed.
      </p>
    </div>
  )
}
