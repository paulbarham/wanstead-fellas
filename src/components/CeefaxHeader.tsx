// Page header shared across every page — a small teletext page-ID line, the
// big yellow title, and an optional meta line. Gives the whole app a
// "broadcast service" feel rather than a generic dashboard. Drop this in at
// the top of any page body and pass the page-ID + title that fit.

interface Props {
  pageId: string
  title: string
  meta?: string
  trailing?: React.ReactNode
}

export default function CeefaxHeader({ pageId, title, meta, trailing }: Props) {
  return (
    <div className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-xs tracking-wider"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--tt-cyan)' }}
          >
            {pageId}
          </p>
          <h1
            className="leading-none"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--tt-yellow)',
              fontSize: '28px',
              fontWeight: 700,
              letterSpacing: '0.02em',
              marginTop: '2px',
            }}
          >
            {title}
          </h1>
          {meta && (
            <p
              className="text-xs mt-1"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--tt-green)' }}
            >
              {meta}
            </p>
          )}
        </div>
        {trailing && <div className="flex-shrink-0">{trailing}</div>}
      </div>
    </div>
  )
}
