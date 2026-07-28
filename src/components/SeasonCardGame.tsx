import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import ClubBadge from './ClubBadge'

// Season Prediction Card — v1. Seven markets, one card per player.
// Locks 1h before matchday 1, reopens for 2 days after summer transfer
// window. Auto-saves each pick individually (no big Submit button — every
// dropdown change UPSERTs its row). RLS enforces the lock/edit-window.

const TT_YELLOW = 'var(--tt-yellow)'
const TT_CYAN = 'var(--tt-cyan)'
const TT_GREEN = 'var(--tt-green)'
const TT_MAGENTA = 'var(--tt-magenta)'
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
  help_text: string | null
  num_picks: number
  slot_labels: string[] | null
  option_type: string
  resolved_answers: string[] | null
  points_per_exact: number
  points_per_partial: number
  display_order: number
}
interface Option {
  id: string
  option_type: string
  option_key: string
  display_name: string
  extra: { club_slug?: string; position?: string } | null
  default_rank: number
}
interface Prediction {
  id: string
  market_id: string
  pick_index: number
  option_key: string
  points_awarded: number | null
}

export default function SeasonCardGame() {
  const { profile } = useAuth()
  const [card, setCard]       = useState<SeasonCard | null>(null)
  const [markets, setMarkets] = useState<Market[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [picks, setPicks]     = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick]       = useState(0)

  // Re-render every 30s so the countdown strip stays live.
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  void tick

  const refresh = useCallback(async () => {
    const { data: cardRow } = await supabase.from('season_cards')
      .select('id, season, lock_at, edit_window_start, edit_window_end, resolved_at')
      .order('season', { ascending: false })
      .limit(1).maybeSingle()
    const c = cardRow as SeasonCard | null
    setCard(c)
    if (!c) { setLoading(false); return }

    const [{ data: mkts }, { data: opts }, { data: pks }] = await Promise.all([
      supabase.from('season_card_markets')
        .select('id, key, title, help_text, num_picks, slot_labels, option_type, resolved_answers, points_per_exact, points_per_partial, display_order')
        .eq('season_card_id', c.id)
        .order('display_order'),
      supabase.from('season_card_options')
        .select('id, option_type, option_key, display_name, extra, default_rank')
        .eq('season_card_id', c.id)
        .order('default_rank').order('display_name'),
      profile?.id
        ? supabase.from('season_card_predictions')
            .select('id, market_id, pick_index, option_key, points_awarded')
            .eq('player_id', profile.id)
        : Promise.resolve({ data: [] }),
    ])
    setMarkets((mkts as Market[]) ?? [])
    setOptions((opts as Option[]) ?? [])
    setPicks((pks as Prediction[]) ?? [])
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { refresh() }, [refresh])

  const now = Date.now()
  const phase = useMemo<'loading'|'no_card'|'open'|'edit_reopen'|'locked'|'resolved'>(() => {
    if (loading) return 'loading'
    if (!card) return 'no_card'
    if (card.resolved_at) return 'resolved'
    const lockMs = new Date(card.lock_at).getTime()
    if (now < lockMs) return 'open'
    if (card.edit_window_start && card.edit_window_end) {
      const s = new Date(card.edit_window_start).getTime()
      const e = new Date(card.edit_window_end).getTime()
      if (now >= s && now < e) return 'edit_reopen'
    }
    return 'locked'
  }, [loading, card, now])

  const editable = phase === 'open' || phase === 'edit_reopen'
  const optionsByType = useMemo(() => {
    const grouped: Record<string, Option[]> = {}
    for (const o of options) (grouped[o.option_type] ??= []).push(o)
    return grouped
  }, [options])
  const picksByMarket = useMemo(() => {
    const grouped: Record<string, Prediction[]> = {}
    for (const p of picks) (grouped[p.market_id] ??= []).push(p)
    for (const k of Object.keys(grouped)) grouped[k].sort((a, b) => a.pick_index - b.pick_index)
    return grouped
  }, [picks])

  const submittedCount = useMemo(() => {
    let total = 0
    let filled = 0
    for (const m of markets) {
      total += m.num_picks
      const mine = picksByMarket[m.id] ?? []
      filled += mine.length
    }
    return { total, filled }
  }, [markets, picksByMarket])

  async function savePick(marketId: string, pickIndex: number, optionKey: string) {
    if (!profile?.id) return
    const existing = (picksByMarket[marketId] ?? []).find(p => p.pick_index === pickIndex)
    if (existing?.option_key === optionKey) return
    const row = {
      market_id: marketId, player_id: profile.id, pick_index: pickIndex, option_key: optionKey,
    }
    const { data, error } = await supabase
      .from('season_card_predictions')
      .upsert(row, { onConflict: 'market_id,player_id,pick_index' })
      .select('id, market_id, pick_index, option_key, points_awarded')
      .single()
    if (error) { console.warn('savePick', error); return }
    setPicks(prev => {
      const idx = prev.findIndex(p => p.market_id === marketId && p.pick_index === pickIndex)
      if (idx >= 0) return prev.map((p, i) => i === idx ? data as Prediction : p)
      return [...prev, data as Prediction]
    })
  }

  async function clearPick(marketId: string, pickIndex: number) {
    if (!profile?.id) return
    const existing = (picksByMarket[marketId] ?? []).find(p => p.pick_index === pickIndex)
    if (!existing) return
    const { error } = await supabase.from('season_card_predictions')
      .delete().eq('id', existing.id)
    if (error) return
    setPicks(prev => prev.filter(p => p.id !== existing.id))
  }

  if (phase === 'loading') {
    return <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>Loading…</p>
  }
  if (phase === 'no_card') {
    return (
      <div className="mt-2 rounded-2xl px-4 py-6 text-center"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No season card configured yet.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      <CardHeader card={card!} phase={phase} filled={submittedCount.filled} total={submittedCount.total} />

      {markets.map(m => (
        <MarketPanel
          key={m.id}
          market={m}
          options={optionsByType[m.option_type] ?? []}
          myPicks={picksByMarket[m.id] ?? []}
          editable={editable}
          onSave={savePick}
          onClear={clearPick}
        />
      ))}
    </div>
  )
}

// ── Header (season + phase + lock countdown) ───────────────────────────────
function CardHeader({ card, phase, filled, total }: {
  card: SeasonCard
  phase: 'open'|'edit_reopen'|'locked'|'resolved'
  filled: number; total: number
}) {
  const now = Date.now()
  const lockMs = new Date(card.lock_at).getTime()
  const editStart = card.edit_window_start ? new Date(card.edit_window_start).getTime() : null
  const editEnd   = card.edit_window_end   ? new Date(card.edit_window_end).getTime()   : null

  let phaseLine: string
  let tone: string
  if (phase === 'open') {
    phaseLine = `⚡ Picks close ${relativeTo(lockMs, now)}`
    tone = TT_GREEN
  } else if (phase === 'edit_reopen') {
    phaseLine = `✎ Edit window — closes ${relativeTo(editEnd!, now)}`
    tone = TT_YELLOW
  } else if (phase === 'locked') {
    if (editStart && now < editStart) {
      phaseLine = `🔒 Locked — reopens ${relativeTo(editStart, now)} (post-transfer)`
    } else {
      phaseLine = `🔒 Locked for the season`
    }
    tone = TT_MAGENTA
  } else {
    phaseLine = `🏁 Season resolved`
    tone = TT_CYAN
  }

  return (
    <div className="rounded-xl"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        backgroundClip: 'padding-box',
      }}>
      <div className="px-4 py-2 flex items-center justify-between gap-3"
        style={{
          borderTopLeftRadius: 11,
          borderTopRightRadius: 11,
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-2, var(--color-bg))',
          fontFamily: MONO,
        }}>
        <span className="text-[10px] uppercase tracking-wide font-semibold min-w-0 break-words" style={{ color: TT_CYAN }}>
          📋 Season Card · {card.season}
        </span>
        <span className="text-[10px] flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
          {filled}/{total} picked
        </span>
      </div>
      <div className="px-4 py-2 text-center"
        style={{ borderBottomLeftRadius: 11, borderBottomRightRadius: 11 }}>
        <p style={{ color: tone, fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.02em' }}>
          {phaseLine}
        </p>
      </div>
    </div>
  )
}

function relativeTo(target: number, now: number): string {
  const diff = target - now
  if (diff < 0) return 'now'
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const mins  = Math.floor((diff % 3_600_000) / 60_000)
  if (days >= 2)  return `in ${days}d ${hours}h`
  if (days === 1) return `in 1d ${hours}h`
  if (hours >= 1) return `in ${hours}h ${mins}m`
  return `in ${mins}m`
}

// ── Market panel (title + N pickers) ───────────────────────────────────────
function MarketPanel({ market, options, myPicks, editable, onSave, onClear }: {
  market: Market
  options: Option[]
  myPicks: Prediction[]
  editable: boolean
  onSave: (marketId: string, pickIndex: number, optionKey: string) => void
  onClear: (marketId: string, pickIndex: number) => void
}) {
  const resolved = market.resolved_answers != null
  return (
    <div className="rounded-xl"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        backgroundClip: 'padding-box',
      }}>
      <div className="px-4 py-2.5"
        style={{
          borderTopLeftRadius: 11,
          borderTopRightRadius: 11,
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-2, var(--color-bg))',
        }}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>
            {market.title}
          </span>
          <span className="text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded"
            style={{
              color: 'var(--color-text-muted)', fontFamily: MONO,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}>
            {market.num_picks === 1
              ? `${market.points_per_exact} pts`
              : `${market.points_per_exact}/${market.points_per_partial} pts`}
          </span>
        </div>
        {market.help_text && (
          <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
            {market.help_text}
          </p>
        )}
      </div>

      <div className="px-4 py-2 flex flex-col gap-2"
        style={{ borderBottomLeftRadius: 11, borderBottomRightRadius: 11 }}>
        {Array.from({ length: market.num_picks }).map((_, i) => {
          const pick = myPicks.find(p => p.pick_index === i)
          const slotLabel = market.slot_labels?.[i] ?? null
          const resolvedForSlot = market.resolved_answers?.[i] ?? null
          return (
            <SlotPicker
              key={i}
              slotIndex={i}
              slotLabel={slotLabel}
              options={options}
              value={pick?.option_key ?? null}
              points={pick?.points_awarded ?? null}
              resolved={resolved}
              resolvedForSlot={resolvedForSlot}
              editable={editable && !resolved}
              onPick={key => onSave(market.id, i, key)}
              onClear={() => onClear(market.id, i)}
            />
          )
        })}
      </div>
    </div>
  )
}

// Club types put their slug in option_key; player/manager options carry a
// club_slug in extra. Unify so ClubBadge always resolves.
function badgeSlugFor(o: Option | null | undefined): string | null {
  if (!o) return null
  if (o.option_type === 'pl_club' || o.option_type === 'championship_club') return o.option_key
  return o.extra?.club_slug ?? null
}

// Prevent the underlying page from scrolling behind the modal on iOS.
function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [locked])
}

// ── One slot (bottom-sheet picker) ────────────────────────────────────────
function SlotPicker({ slotIndex, slotLabel, options, value, points, resolved, resolvedForSlot, editable, onPick, onClear }: {
  slotIndex: number
  slotLabel: string | null
  options: Option[]
  value: string | null
  points: number | null
  resolved: boolean
  resolvedForSlot: string | null
  editable: boolean
  onPick: (optionKey: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  useBodyScrollLock(open)

  const selected = useMemo(() => options.find(o => o.option_key === value) ?? null, [options, value])
  const resolvedOption = useMemo(
    () => resolvedForSlot ? options.find(o => o.option_key === resolvedForSlot) ?? null : null,
    [options, resolvedForSlot],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.display_name.toLowerCase().includes(q))
  }, [options, query])

  const pointsTone = points === null ? 'var(--color-text-muted)'
    : points > 0 ? (points >= 3 ? TT_YELLOW : TT_CYAN)
    : TT_RED

  const selectedBadge = badgeSlugFor(selected)
  const resolvedBadge = badgeSlugFor(resolvedOption)

  function close() { setOpen(false); setQuery('') }

  return (
    <div style={{ position: 'relative' }}>
      <div className="flex items-center gap-2">
        {slotLabel && (
          <div style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em',
            color: 'var(--color-text-muted)', minWidth: 46, textAlign: 'right',
          }}>{slotLabel}</div>
        )}
        <button
          type="button"
          onClick={() => editable && setOpen(true)}
          disabled={!editable}
          className="flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left"
          style={{
            background: 'var(--color-surface-2, var(--color-bg))',
            border: `1px solid ${selected ? 'var(--color-border)' : 'var(--color-border)'}`,
            fontSize: 13,
            color: selected ? 'var(--color-text)' : 'var(--color-text-muted)',
            opacity: editable ? 1 : 0.85,
            cursor: editable ? 'pointer' : 'default',
          }}
        >
          <span className="flex items-center gap-2 min-w-0">
            {selectedBadge && <ClubBadge slug={selectedBadge} size={20} />}
            <span className="truncate">
              {selected ? selected.display_name : (editable ? 'Choose…' : '—')}
            </span>
          </span>
          {editable && (
            <span style={{ fontFamily: MONO, color: 'var(--color-text-muted)', fontSize: 11 }}>▾</span>
          )}
        </button>
        {resolved && (
          <div style={{
            fontFamily: MONO, fontSize: 12, fontWeight: 700, color: pointsTone,
            minWidth: 30, textAlign: 'right',
          }}>
            {points != null ? `+${points}` : '—'}
          </div>
        )}
      </div>

      {resolved && (
        <div className="mt-1 text-[11px] flex items-center gap-1.5" style={{ paddingLeft: slotLabel ? 54 : 0, color: 'var(--color-text-muted)' }}>
          <span>Actual:</span>
          {resolvedBadge && <ClubBadge slug={resolvedBadge} size={14} />}
          <span style={{ color: TT_YELLOW, fontWeight: 600 }}>
            {resolvedOption?.display_name ?? resolvedForSlot ?? '—'}
          </span>
        </div>
      )}

      {open && editable && (
        <PickerSheet
          title={slotLabel ? `Pick — ${slotLabel}` : 'Pick option'}
          query={query}
          onQuery={setQuery}
          options={filtered}
          value={value}
          hasClear={!!value}
          onPick={(key) => { onPick(key); close() }}
          onClear={() => { onClear(); close() }}
          onClose={close}
        />
      )}
      {void slotIndex}
    </div>
  )
}

// ── Full-viewport bottom-sheet picker ──────────────────────────────────────
function PickerSheet({ title, query, onQuery, options, value, hasClear, onPick, onClear, onClose }: {
  title: string
  query: string
  onQuery: (q: string) => void
  options: Option[]
  value: string | null
  hasClear: boolean
  onPick: (key: string) => void
  onClear: () => void
  onClose: () => void
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 430,
          background: 'var(--color-surface)',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          border: '1px solid var(--color-border)',
          borderBottom: 'none',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.55)',
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle */}
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>

        {/* Header */}
        <div className="px-4 pb-2 flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full flex items-center justify-center"
            style={{
              width: 28, height: 28,
              background: 'var(--color-surface-2, var(--color-bg))',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              fontSize: 14, lineHeight: 1,
            }}
            aria-label="Close picker"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <input
            autoFocus
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg"
            style={{
              background: 'var(--color-surface-2, var(--color-bg))',
              border: '1px solid var(--color-border)',
              padding: '10px 12px',
              fontSize: 14, color: 'var(--color-text)',
              outline: 'none',
            }}
          />
        </div>

        {/* Clear pill (only if a value is set) */}
        {hasClear && (
          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={onClear}
              className="w-full py-2 rounded-lg text-[12px] font-semibold"
              style={{
                background: 'transparent',
                border: '1px solid rgba(220,38,38,0.4)',
                color: TT_RED,
                fontFamily: MONO,
              }}
            >
              ✕ Clear this pick
            </button>
          </div>
        )}

        {/* Option list */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {options.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No matches for “{query}”
            </div>
          ) : (
            options.map((o, i) => {
              const isSelected = o.option_key === value
              const badge = badgeSlugFor(o)
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onPick(o.option_key)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left active:opacity-70"
                  style={{
                    background: isSelected ? 'rgba(14,116,144,0.14)' : 'transparent',
                    borderTop: i === 0 ? '1px solid var(--color-border)' : 'none',
                    borderBottom: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontSize: 14,
                  }}
                >
                  {badge ? <ClubBadge slug={badge} size={24} /> : <span style={{ width: 24 }} />}
                  <span className="flex-1 truncate" style={{
                    color: isSelected ? TT_CYAN : 'var(--color-text)',
                    fontWeight: isSelected ? 600 : 400,
                  }}>
                    {o.display_name}
                  </span>
                  {isSelected && <span style={{ color: TT_CYAN, fontSize: 16 }}>✓</span>}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
