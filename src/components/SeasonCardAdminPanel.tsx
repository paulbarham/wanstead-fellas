import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// Admin panel for resolving Season Card markets. Lives in CupAdminPage.
// Every market has N ordered slots (1 for singles, 3 for triples). Setting
// `resolved_answers` on a market triggers settle_season_card_market()
// which cascades points to every prediction on that market.
//
// Also exposes:
//   * Lock date + edit-window edits (in case admin needs to shift them)
//   * "Mark season resolved" button that sets season_cards.resolved_at
//     — cosmetic (locks the UI phase to 'resolved') but doesn't undo
//     settled points.

const TT_YELLOW = 'var(--tt-yellow)'
const TT_CYAN = 'var(--tt-cyan)'
const TT_GREEN = 'var(--tt-green)'
const TT_RED = 'var(--tt-red)'
const MONO = 'var(--font-mono)'

interface SeasonCard {
  id: string
  season: string
  lock_at: string
  edit_window_start: string | null
  edit_window_end: string | null
  resolved_at: string | null
}
interface Market {
  id: string
  key: string
  title: string
  num_picks: number
  slot_labels: string[] | null
  option_type: string
  resolved_answers: string[] | null
  display_order: number
}
interface Option {
  id: string
  option_type: string
  option_key: string
  display_name: string
  extra: { club_slug?: string } | null
  default_rank: number
}

export default function SeasonCardAdminPanel() {
  const [card, setCard]       = useState<SeasonCard | null>(null)
  const [markets, setMarkets] = useState<Market[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const { data: cardRow, error: e1 } = await supabase.from('season_cards')
      .select('id, season, lock_at, edit_window_start, edit_window_end, resolved_at')
      .order('season', { ascending: false })
      .limit(1).maybeSingle()
    if (e1) { setErr(e1.message); setLoading(false); return }
    const c = cardRow as SeasonCard | null
    setCard(c)
    if (!c) { setLoading(false); return }

    const [{ data: m }, { data: o }] = await Promise.all([
      supabase.from('season_card_markets')
        .select('id, key, title, num_picks, slot_labels, option_type, resolved_answers, display_order')
        .eq('season_card_id', c.id)
        .order('display_order'),
      supabase.from('season_card_options')
        .select('id, option_type, option_key, display_name, extra, default_rank')
        .eq('season_card_id', c.id)
        .order('default_rank').order('display_name'),
    ])
    setMarkets((m as Market[]) ?? [])
    setOptions((o as Option[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const optionsByType = useMemo(() => {
    const g: Record<string, Option[]> = {}
    for (const o of options) (g[o.option_type] ??= []).push(o)
    return g
  }, [options])

  async function saveResolved(marketId: string, answers: (string | null)[]) {
    const trimmed = answers.filter((a): a is string => !!a)
    const value = trimmed.length === 0 ? null : trimmed
    const { error } = await supabase.from('season_card_markets')
      .update({ resolved_answers: value })
      .eq('id', marketId)
    if (error) { setErr(error.message); return }
    await refresh()
  }

  async function markSeasonResolved() {
    if (!card) return
    if (!confirm('Mark the season as fully resolved? Locks the UI phase (points stay as-is).')) return
    const { error } = await supabase.from('season_cards')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', card.id)
    if (error) { setErr(error.message); return }
    await refresh()
  }

  async function unResolveSeason() {
    if (!card?.resolved_at) return
    const { error } = await supabase.from('season_cards')
      .update({ resolved_at: null })
      .eq('id', card.id)
    if (error) { setErr(error.message); return }
    await refresh()
  }

  if (loading) return <p className="text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>Loading Season Card admin…</p>
  if (!card) return <p className="text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>No season card configured.</p>

  const resolvedCount = markets.filter(m => m.resolved_answers != null).length
  return (
    <div className="rounded-xl p-3 mb-3" style={{ border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs" style={{ color: TT_CYAN, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: MONO }}>
          ▶ Season Card · {card.season}
        </p>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>
          {resolvedCount}/{markets.length} resolved
        </span>
      </div>

      {err && (
        <p className="text-xs mb-2 p-2 rounded" style={{ background: 'var(--color-error-bg, rgba(220,38,38,0.10))', color: TT_RED, border: '1px solid rgba(220,38,38,0.30)' }}>
          {err}
        </p>
      )}

      <div className="flex flex-col gap-2 mb-3">
        {markets.map(m => (
          <AdminMarketRow
            key={m.id}
            market={m}
            options={optionsByType[m.option_type] ?? []}
            onSave={answers => saveResolved(m.id, answers)}
          />
        ))}
      </div>

      <div className="flex gap-2">
        {!card.resolved_at ? (
          <button
            onClick={markSeasonResolved}
            className="text-[11px] px-3 py-1.5 rounded"
            style={{ background: TT_GREEN, color: '#0F1710', fontWeight: 700, fontFamily: MONO }}
          >
            ✓ Mark season resolved
          </button>
        ) : (
          <button
            onClick={unResolveSeason}
            className="text-[11px] px-3 py-1.5 rounded"
            style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', fontFamily: MONO }}
          >
            Reopen season
          </button>
        )}
      </div>
    </div>
  )
}

// ── Single market row ──────────────────────────────────────────────────────
function AdminMarketRow({ market, options, onSave }: {
  market: Market
  options: Option[]
  onSave: (answers: (string | null)[]) => void | Promise<void>
}) {
  const [draft, setDraft] = useState<(string | null)[]>(
    () => Array.from({ length: market.num_picks }, (_, i) => market.resolved_answers?.[i] ?? null),
  )
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(Array.from({ length: market.num_picks }, (_, i) => market.resolved_answers?.[i] ?? null))
    setDirty(false)
  }, [market.id, market.resolved_answers, market.num_picks])

  async function handleSave() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setDirty(false)
  }

  async function handleClear() {
    if (!confirm(`Clear resolved answers for "${market.title}"? Points will reset to null on all predictions.`)) return
    setSaving(true)
    await onSave([])
    setSaving(false)
    setDirty(false)
  }

  const resolved = market.resolved_answers != null

  return (
    <div className="rounded p-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text)' }}>
          {market.title}
        </span>
        <span className="text-[10px]" style={{ color: resolved ? TT_GREEN : 'var(--color-text-muted)', fontFamily: MONO }}>
          {resolved ? '✓ resolved' : '· unresolved'}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 mb-1.5">
        {Array.from({ length: market.num_picks }).map((_, i) => (
          <AdminOptionPicker
            key={i}
            slotLabel={market.slot_labels?.[i] ?? null}
            options={options}
            value={draft[i]}
            onChange={key => {
              setDraft(d => d.map((x, ix) => ix === i ? key : x))
              setDirty(true)
            }}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="text-[11px] px-3 py-1 rounded"
          style={{
            background: dirty ? TT_YELLOW : 'transparent',
            color: dirty ? '#0F1710' : 'var(--color-text-muted)',
            border: '1px solid ' + (dirty ? TT_YELLOW : 'var(--color-border)'),
            fontFamily: MONO, fontWeight: dirty ? 700 : 400,
          }}
        >
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
        {resolved && (
          <button
            onClick={handleClear}
            disabled={saving}
            className="text-[11px] px-2 py-1 rounded"
            style={{ background: 'transparent', color: TT_RED, border: '1px solid rgba(220,38,38,0.4)', fontFamily: MONO }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ── Simple searchable picker (admin flavour — no crest, tight sizing) ──────
function AdminOptionPicker({ slotLabel, options, value, onChange }: {
  slotLabel: string | null
  options: Option[]
  value: string | null
  onChange: (key: string | null) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => options.find(o => o.option_key === value) ?? null, [options, value])
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return options.slice(0, 80)
    return options.filter(o => o.display_name.toLowerCase().includes(term)).slice(0, 80)
  }, [options, q])

  return (
    <div className="flex items-start gap-2 relative">
      {slotLabel && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--color-text-muted)', minWidth: 60, textAlign: 'right', paddingTop: 6 }}>
          {slotLabel}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-2 py-1 rounded text-left"
          style={{
            background: 'var(--color-surface-2, var(--color-bg))',
            border: `1px solid ${open ? TT_CYAN : 'var(--color-border)'}`,
            fontSize: 12, color: selected ? 'var(--color-text)' : 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span className="truncate">{selected?.display_name ?? 'Choose…'}</span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>▾</span>
        </button>
        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: slotLabel ? 68 : 0, right: 0, zIndex: 40,
            marginTop: 4, background: 'var(--color-surface)',
            border: '1px solid ' + TT_CYAN, borderRadius: 6, overflow: 'hidden',
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
          }}>
            <div style={{ padding: 6, borderBottom: '1px solid var(--color-border)' }}>
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search…"
                className="w-full px-2 py-1 rounded text-xs"
                style={{ background: 'var(--color-surface-2, var(--color-bg))', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {value && (
                <button
                  type="button"
                  onClick={() => { onChange(null); setOpen(false); setQ('') }}
                  className="w-full text-left px-2 py-1 text-[10px]"
                  style={{ color: TT_RED, fontFamily: MONO, borderBottom: '1px solid var(--color-border)' }}
                >
                  ✕ Clear
                </button>
              )}
              {filtered.length === 0 && (
                <div className="px-2 py-2 text-[11px]" style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  No matches
                </div>
              )}
              {filtered.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onChange(o.option_key); setOpen(false); setQ('') }}
                  className="w-full text-left px-2 py-1 text-[12px]"
                  style={{
                    background: o.option_key === value ? 'rgba(14,116,144,0.10)' : 'transparent',
                    color: 'var(--color-text)',
                    borderTop: '1px solid var(--color-border)',
                  }}
                >
                  {o.display_name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
