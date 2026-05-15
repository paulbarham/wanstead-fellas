import type { Result, ReportNoteItem, TeamAward } from '../types'
import { hasStructuredReport } from '../lib/report'

const LABEL_STYLE = { color: 'var(--color-text-muted)', letterSpacing: '0.8px' } as const
const LABEL_CLASS = 'text-[10px] font-semibold uppercase mb-2'
const BODY_STYLE = { fontSize: '13px', lineHeight: '1.6', color: 'var(--color-text-muted)' } as const

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <p className={LABEL_CLASS} style={LABEL_STYLE}>{label}</p>
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

function Award({ label, award }: { label: string; award: TeamAward }) {
  return (
    <div>
      <p className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
        {label}{award.title ? ` · ${award.title}` : ''}
      </p>
      {award.players && (
        <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--color-text)' }}>{award.players}</p>
      )}
      {award.note && <p style={{ ...BODY_STYLE, marginTop: 2 }}>{award.note}</p>}
    </div>
  )
}

export default function MatchReport({ result }: { result: Result }) {
  if (!hasStructuredReport(result)) {
    if (!result.report_text) return null
    return (
      <div style={{ ...BODY_STYLE, whiteSpace: 'pre-wrap' }}>{result.report_text}</div>
    )
  }

  const { predictions, key_highlights, team_awards, fines_admin, banter, app_watch, player_of_tournament } = result
  const awards: [string, TeamAward | null | undefined][] = [
    ['Defensive', team_awards?.defensive],
    ['Safe Hands', team_awards?.safe_hands],
    ['Forward', team_awards?.forward],
  ]
  const hasAwards = awards.some(([, a]) => a)

  return (
    <div className="space-y-5">
      {result.summary && (
        <p className="text-sm font-medium" style={{ color: 'var(--color-text)', lineHeight: '1.5' }}>
          {result.summary}
        </p>
      )}

      {predictions && predictions.rows?.length > 0 && (
        <Section label="Predictions">
          <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--color-text-muted)' }}>
                  <th className="px-3 py-2 text-left font-medium">Position</th>
                  <th className="px-3 py-2 text-left font-medium">Predicted</th>
                  <th className="px-3 py-2 text-left font-medium">Actual</th>
                </tr>
              </thead>
              <tbody>
                {predictions.rows.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #F2F3EE' }}>
                    <td className="px-3 py-2 font-medium text-[var(--color-text)]">{row.position}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--color-text-muted)' }}>{row.predicted}</td>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--color-primary)' }}>{row.actual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {predictions.note && <p style={{ ...BODY_STYLE, marginTop: 8 }}>{predictions.note}</p>}
        </Section>
      )}

      {key_highlights && key_highlights.length > 0 && (
        <Section label="Key Highlights">
          <NoteList items={key_highlights} />
        </Section>
      )}

      {hasAwards && (
        <Section label="Team Awards">
          <div className="space-y-3">
            {awards.map(([label, a]) => (a ? <Award key={label} label={label} award={a} /> : null))}
          </div>
        </Section>
      )}

      {player_of_tournament?.name && (
        <Section label="Player of the Tournament">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
            {player_of_tournament.name}
          </p>
          {player_of_tournament.note && <p style={{ ...BODY_STYLE, marginTop: 2 }}>{player_of_tournament.note}</p>}
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
            <p className="text-xs mt-2" style={{ color: '#9CA897', fontStyle: 'italic' }}>{fines_admin.footer}</p>
          )}
        </Section>
      )}

      {banter && banter.length > 0 && (
        <Section label="Banter">
          <NoteList items={banter} />
        </Section>
      )}

      {app_watch && app_watch.length > 0 && (
        <Section label="App Watch">
          <NoteList items={app_watch} />
        </Section>
      )}

      {result.conclusion && (
        <Section label="Conclusion">
          <p style={{ ...BODY_STYLE, whiteSpace: 'pre-wrap' }}>{result.conclusion}</p>
        </Section>
      )}

      {result.closer && (
        <p className="text-sm font-semibold text-center pt-1" style={{ color: 'var(--color-primary)' }}>
          {result.closer}
        </p>
      )}
    </div>
  )
}
