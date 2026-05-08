import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import PlayerAvatar from './PlayerAvatar'

function InstagramIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

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
    <div className="flex flex-col h-full" style={{ background: '#F2F3EE' }}>
      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between px-4"
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E4DC',
          maxWidth: 430, width: '100%', margin: '0 auto',
          paddingTop: 'max(12px, calc(env(safe-area-inset-top) + 8px))',
          paddingBottom: 12,
        }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#0D6B52' }}>
            <span className="font-display text-sm text-white">WF</span>
          </div>
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span className="font-display text-lg tracking-wide leading-none" style={{ color: '#18201A' }}>WANSTEAD FELLAS</span>
            <a
              href="https://www.instagram.com/wanstead_football_fellas"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 leading-none"
              style={{ color: '#647060', textDecoration: 'none', fontSize: 10 }}
            >
              <InstagramIcon />
              @wanstead_football_fellas
            </a>
          </div>
        </div>

        {/* Avatar — tappable, navigates to Profile */}
        {profile && (
          <button
            onClick={() => navigate('/profile')}
            className="rounded-full transition-opacity active:opacity-70"
            style={{
              padding: 2,
              border: '2px solid #0D6B52',
              borderRadius: '50%',
              lineHeight: 0,
            }}
            aria-label="My profile"
          >
            <PlayerAvatar profile={profile} size={28} />
          </button>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto" style={{ maxWidth: 430, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="flex-shrink-0"
        style={{ background: '#FFFFFF', borderTop: '1px solid #E2E4DC', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors active:opacity-60"
              style={({ isActive }) => ({
                color: isActive ? '#0D6B52' : '#9CA897',
                borderTop: `2px solid ${isActive ? '#0D6B52' : 'transparent'}`,
              })}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[11px] font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
