import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import DecisionComposer from './DecisionComposer'

// Admin-only append-only log of decisions that shape the group:
// half-sub arrangements, house-rule changes, dispute resolutions,
// roster bans, finance one-offs. See supabase/migrations/082.
//
// Rows are frozen 24h after creation (RLS) so the audit trail sticks.
// To retire a decision, add a new one that supersedes it — the historic
// row stays in place.

type Category = 'subs' | 'house_rules' | 'disputes' | 'roster' | 'finance' | 'other'

interface DecisionRow {
  id: string
  decided_at: string
  decided_by: string | null
  category: Category
  summary: string
  details: string | null
  related_player_id: string | null
  effective_from: string | null
  effective_to: string | null
  archived: boolean
  created_at: string
  decided_by_profile: { name: string; surname: string | null } | null
  related_player: { name: string; surname: string | null } | null
}

const CATEGORIES: { key: Category | 'all'; label: string; emoji: string }[] = [
  { key: 'all', label: 'All', emoji: '📋' },
  { key: 'subs', label: 'Subs', emoji: '💷' },
  { key: 'house_rules', label: 'House rules', emoji: '📜' },
  { key: 'disputes', label: 'Disputes', emoji: '⚖️' },
  { key: 'roster', label: 'Roster', emoji: '👥' },
  { key: 'finance', label: 'Finance', emoji: '💰' },
  { key: 'other', label: 'Other', emoji: '📝' },
]

const CATEGORY_META: Record<Category, { label: string; emoji: string; tint: string }> = {
  subs:        { label: 'Subs',        emoji: '💷', tint: 'var(--color-primary)' },
  house_rules: { label: 'House rules', emoji: '📜', tint: 'var(--tt-cyan, var(--color-primary))' },
  disputes:    { label: 'Disputes',    emoji: '⚖️', tint: 'var(--color-warning-text)' },
  roster:      { label: 'Roster',      emoji: '👥', tint: 'var(--color-primary)' },
  finance:     { label: 'Finance',     emoji: '💰', tint: 'var(--color-warning-text)' },
  other:       { label: 'Other',       emoji: '📝', tint: 'var(--color-text-muted)' },
}

function fullName(p: { name: string; surname: string | null } | null): string {
  if (!p) return ''
  return [p.name, p.surname].filter(Boolean).join(' ').trim()
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try { return format(parseISO(iso), 'd MMM yyyy') } catch { return iso }
}

function effectiveLabel(from: string | null, to: string | null): string {
  if (!from && !to) return ''
  if (from && !to) return `from ${fmtDate(from)}`
  if (!from && to) return `until ${fmtDate(to)}`
  return `${fmtDate(from)} → ${fmtDate(to)}`
}

function within24hGrace(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000
}

export default function AdminDecisionsPanel() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<DecisionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('decisions')
      .select(`
        id, decided_at, decided_by, category, summary, details,
        related_player_id, effective_from, effective_to, archived, created_at,
        decided_by_profile:profiles!decisions_decided_by_fkey(name, surname),
        related_player:profiles!decisions_related_player_id_fkey(name, surname)
      `)
      .order('decided_at', { ascending: false })
      .limit(500)
    if (error) {
      console.error('load decisions', error)
      setRows([])
    } else {
      setRows((data ?? []) as unknown as DecisionRow[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter(r => {
      if (r.archived) return false
      if (filter !== 'all' && r.category !== filter) return false
      if (!needle) return true
      const hay = [
        r.summary, r.details ?? '',
        fullName(r.related_player), fullName(r.decided_by_profile),
      ].join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }, [rows, filter, search])

  if (!profile?.is_admin) return null

  async function archive(id: string) {
    if (!confirm('Archive this decision? It stops appearing in the list but stays in the audit trail.')) return
    const { error } = await supabase.from('decisions').update({ archived: true }).eq('id', id)
    if (error) { alert(`Archive failed: ${error.message}`); return }
    load()
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
            Decisions log
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Append-only. Rows frozen 24h after logging. Supersede by adding a new decision.
          </p>
        </div>
        <button
          onClick={() => setShowComposer(true)}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
        >
          + New
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
            style={{
              background: filter === c.key ? 'var(--color-primary)' : 'var(--color-surface)',
              color: filter === c.key ? 'white' : 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search summary, details, players…"
        className="w-full px-3 py-2 rounded-lg text-sm mb-3"
        style={{
          background: 'var(--color-surface-2)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
        }}
      />

      {loading ? (
        <p className="text-center text-sm py-8" style={{ color: 'var(--color-text-muted)' }}>
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 px-4 rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {rows.length === 0
              ? 'No decisions logged yet. Add the first one with + New.'
              : 'No matches for the current filter.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map(r => {
            const meta = CATEGORY_META[r.category]
            const canArchive = within24hGrace(r.created_at)
            const isOpen = expandedId === r.id
            const effLabel = effectiveLabel(r.effective_from, r.effective_to)
            const authorName = fullName(r.decided_by_profile) || 'admin'
            const playerTag = fullName(r.related_player)
            return (
              <li key={r.id} className="rounded-xl"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  backgroundClip: 'padding-box',
                }}>
                <button
                  onClick={() => setExpandedId(isOpen ? null : r.id)}
                  className="w-full text-left px-3 py-2.5"
                >
                  <div className="flex items-start gap-2 mb-1">
                    <span
                      className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                      style={{
                        background: 'var(--color-surface-2)',
                        color: meta.tint,
                        border: `1px solid ${meta.tint}`,
                      }}>
                      {meta.emoji} {meta.label}
                    </span>
                    {effLabel && (
                      <span className="flex-shrink-0 text-[10px] font-mono"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {effLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>
                    {r.summary}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Logged {fmtDate(r.decided_at)} by {authorName}
                    {playerTag && <> · re {playerTag}</>}
                  </p>
                </button>

                {isOpen && r.details && (
                  <div className="px-3 pb-2.5 pt-1">
                    <p className="text-[12px] whitespace-pre-wrap"
                      style={{ color: 'var(--color-text)' }}>
                      {r.details}
                    </p>
                  </div>
                )}

                {isOpen && canArchive && (
                  <div className="px-3 pb-2.5 pt-1 flex items-center justify-between">
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      Within 24h grace — you can still archive.
                    </p>
                    <button
                      onClick={() => archive(r.id)}
                      className="text-[11px] px-2 py-1 rounded font-semibold"
                      style={{
                        background: 'var(--color-error-bg)',
                        color: 'var(--color-error-text)',
                        border: '1px solid var(--color-error-text)',
                      }}>
                      Archive
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {showComposer && (
        <DecisionComposer
          onClose={() => setShowComposer(false)}
          onSaved={() => { setShowComposer(false); load() }}
          decidedBy={profile.id}
        />
      )}
    </>
  )
}
