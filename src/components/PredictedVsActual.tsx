// "Predicted vs. Actual" — the algorithm's pre-match table prediction lined up
// against the final standings. Lives between the Group Table and the Results so
// the Match and History tabs share one ordering (table → prediction → results →
// awards → report). Renders nothing when a match has no recorded prediction.

import type { ReportPredictions } from '../types'
import SectionHeader from './SectionHeader'

export default function PredictedVsActual({ predictions }: { predictions: ReportPredictions | null | undefined }) {
  if (!predictions || !predictions.rows?.length) return null
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <SectionHeader label="Predicted vs. Actual" />
      </div>
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
            <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
              <td className="px-3 py-2 font-medium text-[var(--color-text)]">{row.position}</td>
              <td className="px-3 py-2" style={{ color: 'var(--color-text-muted)' }}>{row.predicted}</td>
              <td className="px-3 py-2 font-medium" style={{ color: 'var(--color-accent)' }}>{row.actual}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {predictions.note && (
        <p className="px-4 py-3" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
          {predictions.note}
        </p>
      )}
    </div>
  )
}
