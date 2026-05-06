import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import PlayerAvatar from './PlayerAvatar'

const BASE_NAV_ITEMS = [
  { to: '/', label: 'Tonight', icon: '⚽' },
  { to: '/teams', label: 'Teams', icon: '👥' },
  { to: '/match', label: 'Match', icon: '📊' },
  { to: '/history', label: 'History', icon: '📅' },
  { to: '/cards', label: 'Cards', icon: '🃏' },
  { to: '/feedback', label: 'Feedback', icon: '💬' },
]

const ADMIN_NAV_ITEM = { to: '/admin', label: 'Admin', icon: '⚙️' }

export default function Layout() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const navItems = profile?.is_admin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS

  return (
    <div className="flex h-full" style={{ background: '#0a0a0a' }}>
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex flex-col flex-shrink-0 w-56"
        style={{ background: '#141414', borderRight: '1px solid #2e2e2e' }}>
        {/* Sidebar brand */}
        <div className="flex items-center gap-2 px-4 py-4" style={{ borderBottom: '1px solid #2e2e2e' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#0D6B52' }}>
            <span className="font-display text-sm text-white">WF</span>
          </div>
          <span className="font-display text-base text-white tracking-wide leading-tight">WANSTEAD FELLAS</span>
        </div>

        {/* Sidebar nav links */}
        <nav className="flex-1 flex flex-col py-3 gap-0.5 px-2">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
              style={({ isActive }) => ({
                color: isActive ? '#0D6B52' : '#888',
                background: isActive ? 'rgba(13,107,82,0.1)' : 'transparent',
              })}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Sidebar profile */}
        {profile && (
          <div style={{ borderTop: '1px solid #2e2e2e' }} className="p-3">
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 w-full px-2 py-2 rounded-lg transition-colors"
              style={{ color: '#888' }}
              aria-label="My profile"
            >
              <div style={{ padding: 2, border: '2px solid #0D6B52', borderRadius: '50%', lineHeight: 0 }}>
                <PlayerAvatar profile={profile} size={24} />
              </div>
              <span className="text-sm font-medium truncate">{profile.name ?? 'Profile'}</span>
            </button>
          </div>
        )}
      </aside>

      {/* Mobile + desktop content column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar — mobile only */}
        <header className="md:hidden flex-shrink-0 flex items-center justify-between px-4 py-3"
          style={{ background: '#141414', borderBottom: '1px solid #2e2e2e' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: '#0D6B52' }}>
              <span className="font-display text-sm text-white">WF</span>
            </div>
            <span className="font-display text-lg text-white tracking-wide">WANSTEAD FELLAS</span>
          </div>

          {profile && (
            <button
              onClick={() => navigate('/profile')}
              className="rounded-full transition-opacity active:opacity-70"
              style={{ padding: 2, border: '2px solid #0D6B52', borderRadius: '50%', lineHeight: 0 }}
              aria-label="My profile"
            >
              <PlayerAvatar profile={profile} size={28} />
            </button>
          )}
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Bottom nav — mobile only */}
        <nav className="md:hidden flex-shrink-0 fixed bottom-0 left-0 right-0"
          style={{ background: '#141414', borderTop: '1px solid #2e2e2e' }}>
          <div className="flex">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors"
                style={({ isActive }) => ({
                  color: isActive ? '#0D6B52' : '#555',
                })}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
