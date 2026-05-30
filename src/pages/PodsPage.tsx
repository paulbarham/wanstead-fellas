import { POD_ENTRIES } from '../lib/pods'

const LABEL_CLASS = 'text-[10px] font-semibold uppercase'
const LABEL_STYLE = { color: 'var(--color-text-muted)', letterSpacing: '0.8px' } as const

export default function PodsPage() {
  return (
    <div className="px-5 py-5">
      <p className={LABEL_CLASS + ' mb-1'} style={LABEL_STYLE}>Feed</p>
      <h1 className="font-display text-[var(--color-text)] tracking-wide mb-5" style={{ fontSize: '28px' }}>PODS</h1>

      <div className="space-y-3">
        {POD_ENTRIES.map(entry => (
          <div key={entry.id}
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-start gap-3 p-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: entry.accent + '22', border: `1px solid ${entry.accent}55` }}
                aria-hidden="true"
              >
                {entry.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-[var(--color-text)] tracking-wide" style={{ fontSize: '18px', lineHeight: 1.1 }}>
                  {entry.title}
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {entry.host}
                </p>
              </div>
            </div>
            <p className="text-sm px-4 pb-3" style={{ color: 'var(--color-text)', lineHeight: 1.5 }}>
              {entry.blurb}
            </p>
            <div className="flex gap-2 px-4 pb-4">
              {entry.links.map(link => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center py-2 rounded-lg text-xs font-semibold"
                  style={{
                    background: 'var(--color-primary)',
                    color: 'var(--color-surface)',
                    textDecoration: 'none',
                  }}
                >
                  Listen on {link.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs mt-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
        More pods & news links coming. Got one to add? Drop it to an admin.
      </p>
    </div>
  )
}
