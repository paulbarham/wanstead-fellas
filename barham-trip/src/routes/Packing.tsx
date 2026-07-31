import { Check } from 'lucide-react'
import { packing, slugKey } from '../lib/itinerary'
import { usePacking } from '../hooks/usePacking'
import { useAuth } from '../hooks/useAuth'

export default function Packing() {
  const { isChecked, toggle } = usePacking()
  const { member } = useAuth()

  const done = packing.filter((p) => isChecked(slugKey(p.name))).length

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl text-navy">Packing</h1>
          <p className="mt-1 text-[14px] text-navy/65">
            {member ? `${member.display_name}'s list` : 'Your list'} — just for you.
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl" style={{ color: 'var(--coral)' }}>
            {done}/{packing.length}
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/45">packed</div>
        </div>
      </div>

      <ul className="space-y-2">
        {packing.map((p) => {
          const key = slugKey(p.name)
          const checked = isChecked(key)
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
                    background: checked ? 'var(--teal)' : 'transparent',
                    border: checked ? '1px solid var(--teal)' : '1.5px solid rgba(14,58,72,0.25)',
                  }}
                >
                  {checked && <Check size={16} color="#fff" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[15px] font-semibold text-navy"
                    style={{ textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.55 : 1 }}
                  >
                    {p.name}
                  </div>
                  <div className="mt-0.5 text-[13px] leading-snug text-navy/60">{p.note}</div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
