import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import CeefaxHeader from '../components/CeefaxHeader'

interface MoreItem {
  pageId: string
  to: string
  label: string
  icon: string
  blurb: string
  adminOnly?: boolean
}

const ITEMS: MoreItem[] = [
  { pageId: 'P501', to: '/stats',    label: 'Stats',    icon: '📈', blurb: 'Top scorers, MOTM, DOTD, appearances.' },
  { pageId: 'P601', to: '/cards',    label: 'Cards',    icon: '🃏', blurb: 'Player cards · stats · ratings.' },
  { pageId: 'P701', to: '/pods',     label: 'Pods',     icon: '🎧', blurb: 'Football podcasts &amp; news feed.' },
  { pageId: 'P901', to: '/cup',      label: 'Cup',      icon: '🏆', blurb: 'World Cup predictor &amp; leaderboard.' },
  { pageId: 'P802', to: '/feedback', label: 'Feedback', icon: '✉️', blurb: 'Suggestions, bugs, requests.' },
  { pageId: 'P888', to: '/admin',    label: 'Admin',    icon: '⚙️', blurb: 'Player management, finance, fines.', adminOnly: true },
]

export default function MorePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const items = ITEMS.filter(i => !i.adminOnly || profile?.is_admin)

  return (
    <div className="px-5 py-5">
      <CeefaxHeader pageId="P800 · INDEX" title="MORE" meta="ALL PAGES · A–Z" />

      <div className="space-y-2 mt-3">
        {items.map(item => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className="w-full rounded-xl text-left flex items-center gap-3 px-4 py-3 transition-opacity active:opacity-70"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
            >
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[10px] tracking-wider"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--tt-cyan)' }}
                >
                  {item.pageId}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--tt-yellow)',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}
                >
                  {item.label.toUpperCase()}
                </span>
              </div>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {item.blurb}
              </p>
            </div>
            <span style={{ color: 'var(--color-text-muted)' }} className="text-sm">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
