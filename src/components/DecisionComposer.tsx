import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// Bottom-sheet composer for logging a new decision.
// See supabase/migrations/082_decisions_log.sql for schema.
//
// For category='subs' or 'house_rules', we pre-fill effective_from
// so admin isn't hunting for the date picker. Subs default to the
// current season boundaries (Apr → Mar); house rules default to
// "today, no end date".

type Category = 'subs' | 'house_rules' | 'disputes' | 'roster' | 'finance' | 'other'

const CATEGORY_OPTIONS: { key: Category; label: string; emoji: string; hint: string }[] = [
  { key: 'subs',        label: 'Subs',        emoji: '💷', hint: 'Half subs, shared subs, mid-season joiners' },
  { key: 'house_rules', label: 'House rules', emoji: '📜', hint: 'No slide tackles, fine ladder, timings' },
  { key: 'disputes',    label: 'Disputes',    emoji: '⚖️', hint: 'Resolution notes for on/off pitch issues' },
  { key: 'roster',      label: 'Roster',      emoji: '👥', hint: 'Bans, half-year sub-outs, priorities' },
  { key: 'finance',     label: 'Finance',     emoji: '💰', hint: 'Block-start cutoffs, one-off adjustments' },
  { key: 'other',       label: 'Other',       emoji: '📝', hint: 'Anything that doesn\'t fit above' },
]

function currentSeasonBoundaries(now: Date = new Date()): { from: string; to: string } {
  const y = now.getUTCFullYear()
  const isPreApril = now.getUTCMonth() < 3
  const startYear = isPreApril ? y - 1 : y
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  }
}

export default function DecisionComposer({ onClose, onSaved, decidedBy }: {
  onClose: () => void
  onSaved: () => void
  decidedBy: string
}) {
  const [category, setCategory] = useState<Category>('subs')
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [effectiveTo, setEffectiveTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Auto-fill dates per category. Fires on category change so admin
  // switching from Subs → House rules refreshes the defaults.
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    if (category === 'subs') {
      const s = currentSeasonBoundaries()
      setEffectiveFrom(s.from)
      setEffectiveTo(s.to)
    } else if (category === 'house_rules') {
      setEffectiveFrom(today)
      setEffectiveTo('') // ongoing
    } else {
      setEffectiveFrom(today)
      setEffectiveTo('')
    }
  }, [category])

  const dateHint = useMemo(() => {
    if (category === 'subs') return 'Subs cover Apr → Mar. Pre-filled to current season; override for mid-season joiners.'
    if (category === 'house_rules') return 'When the rule takes effect. Leave "to" empty for ongoing rules.'
    return 'Optional. When this decision starts / ends applying.'
  }, [category])

  async function save() {
    if (!summary.trim()) return
    setSaving(true)
    setErr(null)
    const { error } = await supabase.from('decisions').insert({
      category,
      summary: summary.trim(),
      details: details.trim() || null,
      effective_from: effectiveFrom || null,
      effective_to: effectiveTo || null,
      decided_by: decidedBy,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 430, maxHeight: '90vh',
          background: 'var(--color-surface)',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          boxShadow: '0 -12px 40px rgba(0,0,0,0.55)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          overflowY: 'auto',
        }}>
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: 'var(--color-border)',
          margin: '10px auto',
        }} />

        <div className="flex items-center justify-between px-4 pb-2">
          <button onClick={onClose}
            className="text-sm"
            style={{ color: 'var(--tt-cyan, var(--color-primary))' }}>
            Cancel
          </button>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            📝 New decision
          </p>
          <div style={{ width: 48 }} />
        </div>

        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1.5"
              style={{ color: 'var(--color-text-muted)' }}>
              Category
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORY_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setCategory(opt.key)}
                  className="text-left px-2.5 py-1.5 rounded-lg transition-all"
                  style={{
                    background: category === opt.key ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: category === opt.key ? 'white' : 'var(--color-text)',
                    border: '1px solid ' + (category === opt.key ? 'var(--color-primary)' : 'var(--color-border)'),
                  }}
                >
                  <div className="text-xs font-semibold">{opt.emoji} {opt.label}</div>
                </button>
              ))}
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {CATEGORY_OPTIONS.find(o => o.key === category)?.hint}
            </p>
          </div>

          <div>
            <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1"
              style={{ color: 'var(--color-text-muted)' }}>
              Summary — one line, shown in the list
            </label>
            <input
              type="text"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="e.g. Aaron Franklin on half sub (£47.50)"
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>

          <div>
            <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1"
              style={{ color: 'var(--color-text-muted)' }}>
              Details (optional) — the why, context, mechanics
            </label>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Longer explanation, links to WhatsApp thread, etc."
              maxLength={2000}
              rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>

          <div>
            <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1"
              style={{ color: 'var(--color-text-muted)' }}>
              Effective dates
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-[10px] mb-0.5" style={{ color: 'var(--color-text-muted)' }}>From</p>
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={e => setEffectiveFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] mb-0.5" style={{ color: 'var(--color-text-muted)' }}>To (empty = ongoing)</p>
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={e => setEffectiveTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                />
              </div>
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {dateHint}
            </p>
          </div>

          <div className="px-3 py-2 rounded-lg"
            style={{
              background: 'var(--color-warning-bg)',
              color: 'var(--color-warning-text)',
              border: '1px solid var(--color-warning-text)',
              fontSize: 11,
            }}>
            ⚠️ Append-only. Editable for 24h after logging; frozen after that. To retire a decision, log a new one that supersedes it.
          </div>

          {err && (
            <div className="px-3 py-2 rounded-lg text-[11px]"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)' }}>
              {err}
            </div>
          )}

          <button
            onClick={save}
            disabled={saving || !summary.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
          >
            {saving ? 'Logging…' : '📝 Log decision'}
          </button>
        </div>
      </div>
    </div>
  )
}
