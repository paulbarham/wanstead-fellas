import { Users } from 'lucide-react'
import { TRAVELLERS } from '../lib/family'
import Avatar from './Avatar'

/** The six travellers on the trip — a friendly roster on the Trip overview. */
export default function WhosComing() {
  return (
    <section
      className="rounded-card p-4 shadow-card"
      style={{ background: 'var(--surface)', border: '1px solid rgba(14,58,72,0.1)', backgroundClip: 'padding-box' }}
    >
      <div className="flex items-center gap-2">
        <Users size={18} style={{ color: 'var(--coral-dark)' }} />
        <h3 className="font-display text-lg text-navy">Who's coming</h3>
        <span className="ml-auto text-[13px] font-semibold text-navy/45">{TRAVELLERS.length} of us</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-3">
        {TRAVELLERS.map((t) => (
          <div key={t.name} className="flex items-center gap-2">
            <Avatar member={{ display_name: t.name, avatar_url: null, color: t.color }} size={40} />
            <div className="leading-tight">
              <div className="text-[14px] font-semibold text-navy">{t.name}</div>
              {t.note && <div className="text-[11px] text-navy/50">{t.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
