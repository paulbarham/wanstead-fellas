import { useState, type ReactNode } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { Menu, X, PoundSterling, User, Plane, LogOut, Moon, Sun } from 'lucide-react'
import { meta } from '../lib/itinerary'
import { APP } from '../config'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import BottomTabs from './BottomTabs'
import OfflineIndicator from './OfflineIndicator'
import UpdateToast from './UpdateToast'
import Avatar from './Avatar'

/** App frame: compact header (title + hamburger), content, bottom tabs. */
export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { member, signOut } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()

  async function handleSignOut() {
    setMenuOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[480px] flex-col">
      <OfflineIndicator />

      <header
        className="safe-top sticky top-0 z-30 flex items-center gap-3 px-4 py-3 backdrop-blur"
        style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)' }}
      >
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <span
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg font-display text-lg font-bold text-white"
            style={{ background: 'var(--coral)' }}
          >
            {APP.iconLetter}
          </span>
          <span className="font-display text-lg leading-tight text-navy">{APP.short}</span>
        </Link>

        <button
          onClick={() => setMenuOpen(true)}
          className="ml-auto grid h-10 w-10 place-items-center rounded-lg"
          aria-label="Menu"
          style={{ color: 'var(--text)' }}
        >
          <Menu size={24} />
        </button>
      </header>

      <main className="flex-1 px-4 pb-28 pt-3">
        <Outlet />
      </main>

      <BottomTabs />
      <UpdateToast />

      {/* Hamburger drawer */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            style={{ cursor: 'pointer' }}
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="safe-top fixed right-0 top-0 z-50 flex h-full w-[78%] max-w-[320px] flex-col p-5"
            style={{ background: 'var(--bg)', boxShadow: '-12px 0 40px rgba(0,0,0,0.35)' }}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-xl text-navy">{meta.trip}</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg"
                aria-label="Close menu"
              >
                <X size={22} style={{ color: 'var(--text)' }} />
              </button>
            </div>

            {member && (
              <Link
                to="/me"
                onClick={() => setMenuOpen(false)}
                className="mt-5 flex items-center gap-3 rounded-card p-3"
                style={{ background: 'var(--surface)', border: '1px solid rgba(14,58,72,0.1)' }}
              >
                <Avatar member={member} size={44} />
                <div className="leading-tight">
                  <div className="font-semibold text-navy">{member.display_name}</div>
                  <div className="text-[12px] text-navy/55">View account</div>
                </div>
              </Link>
            )}

            <nav className="mt-4 flex flex-col gap-1">
              <DrawerLink to="/trip" icon={<Plane size={18} />} label="Trip overview" onClick={() => setMenuOpen(false)} />
              <DrawerLink to="/costs" icon={<PoundSterling size={18} />} label="Costs" onClick={() => setMenuOpen(false)} />
              <DrawerLink to="/me" icon={<User size={18} />} label="Account" onClick={() => setMenuOpen(false)} />
              <button
                onClick={toggleTheme}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-navy active:opacity-70"
                style={{ minHeight: 48 }}
              >
                <span style={{ color: 'var(--coral-dark)' }}>
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </span>
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </nav>

            <button
              onClick={handleSignOut}
              className="mt-auto flex items-center gap-2 rounded-xl px-4 py-3 text-left font-semibold"
              style={{ color: 'var(--coral-dark)', border: '1px solid rgba(200,108,58,0.4)' }}
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function DrawerLink({
  to,
  icon,
  label,
  onClick,
}: {
  to: string
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium text-navy active:opacity-70"
      style={{ minHeight: 48 }}
    >
      <span style={{ color: 'var(--coral-dark)' }}>{icon}</span>
      {label}
    </Link>
  )
}
