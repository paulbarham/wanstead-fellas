import type { Result, ReportNoteItem } from '../types'
import { hasStructuredReport } from '../lib/report'
import SectionHeader from './SectionHeader'

// Body sizing for report copy — bumped 13→14px + line-height 1.6→1.65
// for a universal readability lift (players told us the report was hard
// to read on smaller screens). The Text-size toggle in Profile scales
// this proportionally for players who want bigger still.
const BODY_STYLE = { fontSize: '14px', lineHeight: '1.65', color: 'var(--color-text-muted)' } as const

function splitPoints(text: string): string[] {
  return text
    .split('\n')
    .flatMap(line => line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
    .map(s => s.trim())
    .filter(Boolean)
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pt-5 mt-5" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="mb-3">
        <SectionHeader label={label} />
      </div>
      {children}
    </section>
  )
}

function NoteList({ items }: { items: ReportNoteItem[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => {
        const head = it.player ?? it.label
        return (
          <li key={i} style={BODY_STYLE}>
            {head && (
              <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{head}</span>
            )}
            {head && it.note ? ' — ' : null}
            {it.note}
          </li>
        )
      })}
    </ul>
  )
}

export default function MatchReport({ result }: { result: Result }) {
  if (!hasStructuredReport(result)) {
    if (!result.report_text) return null
    return (
      <div style={{ ...BODY_STYLE, whiteSpace: 'pre-wrap' }}>{result.report_text}</div>
    )
  }

  const { key_highlights, fines_admin, banter, app_watch } = result

  return (
    <div>
      {result.summary && (
        <p className="text-base font-medium mb-1" style={{ color: 'var(--color-text)', lineHeight: '1.55' }}>
          {result.summary}
        </p>
      )}

      {/* Predicted vs. Actual is rendered by MatchResultView (between the
          group table and the results), not here — see PredictedVsActual. */}

      {key_highlights && key_highlights.length > 0 && (
        <Section label="Key Highlights">
          <NoteList items={key_highlights} />
        </Section>
      )}

      {fines_admin && (fines_admin.headline || fines_admin.items?.length || fines_admin.redemption || fines_admin.footer) && (
        <Section label="Fines & Admin">
          {fines_admin.headline && (
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text)' }}>{fines_admin.headline}</p>
          )}
          {fines_admin.items && fines_admin.items.length > 0 && (
            <ul className="space-y-1 list-disc pl-4" style={BODY_STYLE}>
              {fines_admin.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          )}
          {fines_admin.redemption && <p style={{ ...BODY_STYLE, marginTop: 8 }}>{fines_admin.redemption}</p>}
          {fines_admin.footer && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{fines_admin.footer}</p>
          )}
        </Section>
      )}

      {banter && banter.length > 0 && (
        <Section label="Banter & Incidents">
          <NoteList items={banter} />
        </Section>
      )}

      {app_watch && app_watch.length > 0 && (
        <Section label="App Watch">
          <NoteList items={app_watch} />
        </Section>
      )}

      {(result.conclusion || result.closer) && (
        <Section label="Conclusion">
          <ul className="space-y-1.5">
            {splitPoints([result.conclusion, result.closer].filter(Boolean).join('\n')).map((line, i) => (
              <li key={i} style={BODY_STYLE}>{line}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
