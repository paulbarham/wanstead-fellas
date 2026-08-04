import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { supabase } from '../lib/supabase'
import PlayerAvatar from './PlayerAvatar'
import RouteErrorBoundary from './RouteErrorBoundary'

function InstagramIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

// Bottom nav stays at five entries plus a "More" overflow so labels never
// squeeze on narrow phones. Cards / Stats / Pods / Admin / Feedback all live
// behind /more (admin gated where relevant inside MorePage).
//
// The 5th slot is Predictor — permanent home for the World Cup archive
// and the coming Match of the Week / Season Card games (24 Jul 2026).
// More moves up to a ⋯ icon in the top-right header so it's still one-tap
// from any screen. Route stays /cup for URL back-compat with the WC-era
// links floating around in WhatsApp screenshots.
const BASE_NAV_ITEMS = [
  { to: '/',         label: 'Next Game', icon: '⚽' },
  { to: '/teams',    label: 'Teams',   icon: '👥' },
  { to: '/match',    label: 'Match',   icon: '📊' },
  { to: '/stats',    label: 'Stats',   icon: '📈' },
]
const PREDICTOR_NAV_ITEM = { to: '/cup', label: 'Predictor', icon: '🎯' }

export default function Layout() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const navItems = [...BASE_NAV_ITEMS, PREDICTOR_NAV_ITEM]

  // Red-dot badge on the Match tab whenever there's an open voting window
  // AND the signed-in player hasn't cast BOTH awards yet. Hides itself once
  // they've voted for MOTM + DOTD, or when the window closes. Refreshes every
  // 60s so it clears the moment the user votes (or on window close).
  const [showMatchBadge, setShowMatchBadge] = useState(false)
  useEffect(() => {
    if (!profile?.id) { setShowMatchBadge(false); return }
    let cancelled = false
    async function refresh() {
      const { data: vw } = await supabase
        .from('voting_windows')
        .select('match_id, opens_at, closes_at')
        .order('closes_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      const w = vw as { match_id: string; opens_at: string; closes_at: string } | null
      if (!w) { setShowMatchBadge(false); return }
      const now = Date.now()
      const opens = new Date(w.opens_at).getTime()
      const closes = new Date(w.closes_at).getTime()
      if (now < opens || now > closes) { setShowMatchBadge(false); return }
      const { data: votes } = await supabase
        .from('votes')
        .select('award_type')
        .eq('match_id', w.match_id)
        .eq('voter_id', profile!.id)
      if (cancelled) return
      const types = new Set(((votes as { award_type: string }[]) || []).map(v => v.award_type))
      setShowMatchBadge(!(types.has('motm') && types.has('dotd')))
    }
    refresh()
    const t = setInterval(refresh, 60000)
    return () => { cancelled = true; clearInterval(t) }
  }, [profile?.id])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between px-4"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          maxWidth: 430, width: '100%', margin: '0 auto',
          paddingTop: 'max(12px, calc(env(safe-area-inset-top) + 8px))',
          paddingBottom: 12,
        }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-primary)' }}>
            <span className="font-display text-sm text-white">WF</span>
          </div>
          <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
            <span className="font-display text-lg tracking-wide leading-none truncate" style={{ color: 'var(--color-text)' }}>WANSTEAD FELLAS</span>
            <a
              href="https://www.instagram.com/wanstead_football_fellas"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 leading-none"
              style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: 10 }}
            >
              <InstagramIcon />
              @wanstead_football_fellas
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 pl-2">
          {/* More overflow — Predictor now permanently owns the 5th
              bottom-nav slot, so More lives up here as the ⋯ button. */}
          <button
            onClick={() => navigate('/more')}
            className="flex items-center justify-center transition-opacity active:opacity-70"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--color-surface-2, var(--color-bg))',
              border: '1px solid var(--color-border)',
              fontSize: 18, lineHeight: 1, color: 'var(--color-text-muted)',
            }}
            aria-label="More"
          >
            ⋯
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="flex items-center justify-center transition-opacity active:opacity-70"
            style={{
              width: 32, height: 32,
              borderRadius: '50%',
              background: 'var(--color-surface-2, var(--color-bg))',
              border: '1px solid var(--color-border)',
              fontSize: 16,
              lineHeight: 1,
            }}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {/* Avatar — tappable, navigates to Profile */}
          {profile && (
            <button
              onClick={() => navigate('/profile')}
              className="rounded-full transition-opacity active:opacity-70"
              style={{
                padding: 2,
                border: '2px solid var(--color-primary)',
                borderRadius: '50%',
                lineHeight: 0,
              }}
              aria-label="My profile"
            >
              <PlayerAvatar profile={profile} size={28} />
            </button>
          )}
        </div>
      </header>

      {/* Main content — wrapped in a route error boundary so a single
          throwing page shows an in-tab diagnostic card instead of
          taking the whole shell (nav bar included) down with it. */}
      <main className="flex-1 overflow-y-auto" style={{ maxWidth: 430, width: '100%', margin: '0 auto', overflowX: 'hidden' }}>
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>

      {/* Bottom nav */}
      <nav className="flex-shrink-0"
        style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {navItems.map(item => {
            const badged = item.to === '/match' && showMatchBadge
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors active:opacity-60"
                style={({ isActive }) => ({
                  color: isActive ? 'var(--color-primary)' : '#9CA897',
                  borderTop: `2px solid ${isActive ? 'var(--color-primary)' : 'transparent'}`,
                })}
              >
                <span className="text-base leading-none relative inline-block">
                  {item.icon}
                  {badged && (
                    <span
                      aria-label="Voting open — cast your MOTM & DOTD picks"
                      style={{
                        position: 'absolute',
                        top: -2,
                        right: -6,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--tt-red, #DC2626)',
                        border: '1.5px solid var(--color-surface)',
                        boxShadow: '0 0 0 1px var(--tt-red, #DC2626)33',
                      }}
                    />
                  )}
                </span>
                <span className="text-[11px] font-medium">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
