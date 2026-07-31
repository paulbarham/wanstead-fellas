import { NavLink } from 'react-router-dom'
import { CalendarDays, Map, ListChecks, Luggage } from 'lucide-react'

const tabs = [
  { to: '/', label: 'Today', Icon: CalendarDays, end: true },
  { to: '/trip', label: 'Trip', Icon: Map, end: false },
  { to: '/bookings', label: 'Bookings', Icon: ListChecks, end: false },
  { to: '/packing', label: 'Packing', Icon: Luggage, end: false },
]

/** Persistent 4-tab bottom bar. 56px + safe-area, tap targets ≥44px. */
export default function BottomTabs() {
  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
      style={{ background: 'var(--header-bg)', borderColor: 'var(--border)' }}
    >
      <div className="mx-auto flex max-w-[480px] items-stretch justify-around">
        {tabs.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
            style={{ minHeight: 56 }}
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={22}
                  style={{
                    color: isActive
                      ? 'var(--coral)'
                      : 'color-mix(in srgb, var(--text) 60%, transparent)',
                  }}
                  strokeWidth={isActive ? 2.4 : 1.9}
                />
                <span
                  className="text-[11px] font-semibold"
                  style={{
                    color: isActive
                      ? 'var(--coral-dark)'
                      : 'color-mix(in srgb, var(--text) 55%, transparent)',
                  }}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
