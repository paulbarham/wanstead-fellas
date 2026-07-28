import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PreferredPosition } from '../types'
import PlayerAvatar from './PlayerAvatar'

// Formation shape "3-2-1" = 3 DEF, 2 MID, 1 ATT — GK implicit.
interface Shape { def: number; mid: number; att: number }

const SHAPES: Record<string, Shape> = {
  // 5v5 (4 outfield)
  '2-1-1': { def: 2, mid: 1, att: 1 },
  '1-2-1': { def: 1, mid: 2, att: 1 },
  '1-1-2': { def: 1, mid: 1, att: 2 },
  // 6v6 (5 outfield)
  '2-2-1': { def: 2, mid: 2, att: 1 },
  '3-1-1': { def: 3, mid: 1, att: 1 },
  '1-3-1': { def: 1, mid: 3, att: 1 },
  '2-1-2': { def: 2, mid: 1, att: 2 },
  // 7v7 (6 outfield)
  '2-3-1': { def: 2, mid: 3, att: 1 },
  '3-2-1': { def: 3, mid: 2, att: 1 },
  '2-2-2': { def: 2, mid: 2, att: 2 },
  '3-1-2': { def: 3, mid: 1, att: 2 },
  '1-3-2': { def: 1, mid: 3, att: 2 },
  '1-4-1': { def: 1, mid: 4, att: 1 },
  // 8v8 (7 outfield)
  '3-3-1': { def: 3, mid: 3, att: 1 },
  '2-3-2': { def: 2, mid: 3, att: 2 },
  '3-2-2': { def: 3, mid: 2, att: 2 },
  '2-4-1': { def: 2, mid: 4, att: 1 },
}

function outfieldCount(s: Shape) { return s.def + s.mid + s.att }
function totalSize(s: Shape) { return outfieldCount(s) + 1 }

// Which shape best fits a roster of this size. Preference order per size
// matches the club's most-common shapes.
const DEFAULT_SHAPE_BY_OUTFIELD: Record<number, string> = {
  4: '1-2-1',
  5: '2-2-1',
  6: '2-3-1',
  7: '3-3-1',
}

interface RosterEntry {
  id: string
  name: string
  surname: string
  photo_url: string | null
  preferred_position_primary: PreferredPosition | null
  preferred_position_secondary: PreferredPosition | null
}

type Slots = Record<string, string | null>

function slotRowKey(k: string): 'gk' | 'def' | 'mid' | 'att' | null {
  if (k === 'gk') return 'gk'
  if (k.startsWith('def_')) return 'def'
  if (k.startsWith('mid_')) return 'mid'
  if (k.startsWith('att_')) return 'att'
  return null
}

// Auto-assign a fresh slot map given a roster and a shape. Preference:
// GK → someone whose primary is GK; then DEF/MID/ATT rows filled by matching
// primary, then secondary, then whatever's left.
function autoAssign(roster: RosterEntry[], shape: Shape): Slots {
  const slots: Slots = {}
  const pool = [...roster]

  function take(match: (r: RosterEntry) => boolean): RosterEntry | null {
    const idx = pool.findIndex(match)
    if (idx === -1) return null
    return pool.splice(idx, 1)[0]
  }

  const gk = take(r => r.preferred_position_primary === 'GK')
             ?? take(r => r.preferred_position_secondary === 'GK')
             ?? take(() => true)
  if (gk) slots.gk = gk.id

  const rows: [string, PreferredPosition, number][] = [
    ['def', 'DEF', shape.def],
    ['mid', 'MID', shape.mid],
    ['att', 'ATT', shape.att],
  ]
  for (const [prefix, pref, n] of rows) {
    for (let i = 0; i < n; i++) {
      const p = take(r => r.preferred_position_primary === pref)
             ?? take(r => r.preferred_position_secondary === pref)
             ?? take(() => true)
      if (p) slots[`${prefix}_${i}`] = p.id
    }
  }
  return slots
}

function pickDefaultShape(outfield: number): string {
  return DEFAULT_SHAPE_BY_OUTFIELD[outfield] ?? '2-3-1'
}

interface Props {
  teamId: string
  teamName: string
  bibs?: boolean
  editable: boolean
}

export default function FormationPicker({ teamId, teamName, bibs, editable }: Props) {
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [shape, setShape] = useState<string>('2-3-1')
  const [slots, setSlots] = useState<Slots>({})
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    hasLoadedRef.current = false
    ;(async () => {
      setLoading(true)
      const { data: tps } = await supabase
        .from('team_players')
        .select('player_id, profiles:player_id(id, name, surname, photo_url, preferred_position_primary, preferred_position_secondary)')
        .eq('team_id', teamId)

      type TpRow = { profiles: RosterEntry | null }
      const list: RosterEntry[] = ((tps as unknown as TpRow[]) || [])
        .map(r => r.profiles)
        .filter((p): p is RosterEntry => p !== null)
      const order: Record<string, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 }
      list.sort((a, b) => {
        const oa = order[a.preferred_position_primary ?? 'ZZ'] ?? 99
        const ob = order[b.preferred_position_primary ?? 'ZZ'] ?? 99
        if (oa !== ob) return oa - ob
        return (a.surname || '').localeCompare(b.surname || '')
      })

      const { data: fmt } = await supabase
        .from('team_formations')
        .select('shape, slots')
        .eq('team_id', teamId)
        .maybeSingle()

      if (cancelled) return
      setRoster(list)

      if (fmt) {
        const row = fmt as { shape: string; slots: Slots }
        setShape(row.shape)
        setSlots(row.slots || {})
      } else {
        const best = pickDefaultShape(list.length - 1)
        setShape(best)
        setSlots(autoAssign(list, SHAPES[best]))
      }
      setLoading(false)
      hasLoadedRef.current = true
    })()
    return () => { cancelled = true }
  }, [teamId])

  useEffect(() => {
    if (!hasLoadedRef.current || !editable) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      const { data: prof } = await supabase.auth.getUser()
      const authId = prof.user?.id
      let updated_by: string | null = null
      if (authId) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_user_id', authId)
          .maybeSingle()
        updated_by = (p as { id: string } | null)?.id ?? null
      }
      const { error } = await supabase
        .from('team_formations')
        .upsert({ team_id: teamId, shape, slots, updated_by }, { onConflict: 'team_id' })
      if (error) {
        setSaveState('error')
        return
      }
      setSaveState('saved')
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500)
    }, 500)
    return () => clearTimeout(t)
  }, [shape, slots, editable, teamId])

  const currentShape = SHAPES[shape] ?? SHAPES['2-3-1']

  const slotKeys = useMemo(() => {
    const keys: string[] = ['gk']
    for (let i = 0; i < currentShape.def; i++) keys.push(`def_${i}`)
    for (let i = 0; i < currentShape.mid; i++) keys.push(`mid_${i}`)
    for (let i = 0; i < currentShape.att; i++) keys.push(`att_${i}`)
    return keys
  }, [currentShape])

  const validSlotSet = useMemo(() => new Set(slotKeys), [slotKeys])
  const assignedIds = new Set(
    Object.entries(slots)
      .filter(([k, v]) => validSlotSet.has(k) && !!v)
      .map(([, v]) => v as string)
  )
  const bench = roster.filter(r => !assignedIds.has(r.id))
  const outfield = roster.length - 1

  const availableShapes = Object.entries(SHAPES).filter(([, s]) => totalSize(s) === roster.length)
  const displayShapes = availableShapes.length ? availableShapes : Object.entries(SHAPES).filter(([, s]) => outfieldCount(s) === Math.max(0, outfield))

  function tapSlot(key: string) {
    if (!editable) return
    setSelectedSlot(prev => (prev === key ? null : key))
  }

  function tapBenchPlayer(playerId: string) {
    if (!editable || !selectedSlot) return
    setSlots(prev => {
      const next = { ...prev }
      for (const [k, v] of Object.entries(next)) {
        if (v === playerId) delete next[k]
      }
      next[selectedSlot] = playerId
      return next
    })
    setSelectedSlot(null)
  }

  function clearSelectedSlot() {
    if (!editable || !selectedSlot) return
    setSlots(prev => {
      const next = { ...prev }
      delete next[selectedSlot]
      return next
    })
    setSelectedSlot(null)
  }

  function autoFill() {
    if (!editable) return
    setSlots(autoAssign(roster, currentShape))
    setSelectedSlot(null)
  }

  const rosterById = useMemo(() => {
    const map: Record<string, RosterEntry> = {}
    for (const r of roster) map[r.id] = r
    return map
  }, [roster])

  const rows: { label: string; keys: string[] }[] = [
    { label: 'ATT', keys: slotKeys.filter(k => k.startsWith('att_')) },
    { label: 'MID', keys: slotKeys.filter(k => k.startsWith('mid_')) },
    { label: 'DEF', keys: slotKeys.filter(k => k.startsWith('def_')) },
    { label: 'GK',  keys: ['gk'] },
  ]

  const bibsChip = bibs !== undefined ? (bibs ? '🟠 BIBS' : '⚫ NO BIBS') : null

  return (
    <div className="rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', backgroundClip: 'padding-box' }}>
      <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{teamName}</span>
          {bibsChip && (
            <span className="text-[9px] font-semibold tracking-widest px-1.5 py-0.5 rounded" style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface-2)' }}>{bibsChip}</span>
          )}
        </div>
        <span className="text-[9px] font-semibold tracking-widest" style={{ color: saveState === 'error' ? 'var(--tt-red)' : 'var(--color-text-muted)' }}>
          {saveState === 'saving' ? 'SAVING…' : saveState === 'saved' ? '✓ SAVED' : saveState === 'error' ? '⚠ ERROR' : shape}
        </span>
      </div>

      {loading ? (
        <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : (
        <>
          <div className="px-3 py-2 flex flex-wrap gap-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
            {displayShapes.map(([key]) => {
              const active = key === shape
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!editable}
                  onClick={() => {
                    if (!editable) return
                    setShape(key)
                    setSlots(autoAssign(roster, SHAPES[key]))
                    setSelectedSlot(null)
                  }}
                  className="text-[10px] font-semibold tracking-widest px-2 py-1 rounded-md"
                  style={{
                    background: active ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: active ? '#FFFFFF' : 'var(--color-text-muted)',
                    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    opacity: editable ? 1 : 0.7,
                  }}
                >
                  {key}
                </button>
              )
            })}
            {editable && (
              <button
                type="button"
                onClick={autoFill}
                className="ml-auto text-[10px] font-semibold tracking-widest px-2 py-1 rounded-md"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              >
                ⚡ AUTO-FILL
              </button>
            )}
          </div>

          <div
            className="relative px-3 py-4"
            style={{
              background: 'linear-gradient(180deg, #0F8566 0%, #0D6B52 100%)',
              backgroundImage: `
                linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.10) 100%),
                repeating-linear-gradient(180deg, rgba(255,255,255,0.045) 0 10%, rgba(0,0,0,0.045) 10% 20%)
              `,
            }}
          >
            {/* Halfway line */}
            <div className="absolute left-3 right-3 top-1/2 h-px" style={{ background: 'rgba(255,255,255,0.35)' }} />
            {/* Centre circle */}
            <div
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{
                width: 60, height: 60,
                transform: 'translate(-50%, -50%)',
                border: '1px solid rgba(255,255,255,0.35)',
              }}
            />
            <div className="space-y-2 relative">
              {rows.map(row => (
                <div key={row.label} className="flex justify-around items-center min-h-[68px]">
                  {row.keys.length === 0 ? (
                    <span className="text-[9px] font-semibold tracking-widest opacity-40" style={{ color: '#FFFFFF' }}>—</span>
                  ) : row.keys.map(k => {
                    const pid = slots[k]
                    const player = pid ? rosterById[pid] : null
                    const isSelected = selectedSlot === k
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={!editable}
                        onClick={() => tapSlot(k)}
                        className="flex flex-col items-center gap-1"
                        style={{ opacity: editable ? 1 : 1 }}
                      >
                        <div
                          className="rounded-full flex items-center justify-center"
                          style={{
                            width: 48, height: 48,
                            background: player ? '#FFFFFF' : 'rgba(255,255,255,0.15)',
                            border: `2px solid ${isSelected ? '#FFD400' : player ? '#FFFFFF' : 'rgba(255,255,255,0.6)'}`,
                            boxShadow: isSelected ? '0 0 0 3px rgba(255, 212, 0, 0.4)' : 'none',
                          }}
                        >
                          {player ? (
                            <PlayerAvatar profile={player} size={44} />
                          ) : (
                            <span className="text-lg" style={{ color: 'rgba(255,255,255,0.8)' }}>+</span>
                          )}
                        </div>
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            background: 'rgba(0,0,0,0.35)',
                            color: '#FFFFFF',
                            maxWidth: 72,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {player ? `${player.name[0]}. ${player.surname}`.toUpperCase() : row.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {editable && selectedSlot && (
            <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span className="text-[10px] font-semibold tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                PICK PLAYER FOR {slotRowKey(selectedSlot)?.toUpperCase()}
              </span>
              <div className="flex gap-2">
                {slots[selectedSlot] && (
                  <button
                    type="button"
                    onClick={clearSelectedSlot}
                    className="text-[10px] font-semibold tracking-widest px-2 py-1 rounded-md"
                    style={{ background: 'var(--color-surface)', color: 'var(--tt-red)', border: '1px solid var(--color-border)' }}
                  >
                    CLEAR
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  className="text-[10px] font-semibold tracking-widest px-2 py-1 rounded-md"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          <div className="px-3 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                BENCH · {bench.length}
              </span>
            </div>
            {bench.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Everyone's on the pitch.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {bench.map(p => {
                  const canAssign = editable && !!selectedSlot
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!canAssign}
                      onClick={() => tapBenchPlayer(p.id)}
                      className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full"
                      style={{
                        background: canAssign ? 'var(--color-primary)' : 'var(--color-surface-2)',
                        color: canAssign ? '#FFFFFF' : 'var(--color-text)',
                        border: `1px solid ${canAssign ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        cursor: canAssign ? 'pointer' : 'default',
                      }}
                    >
                      <PlayerAvatar profile={p} size={22} />
                      <span className="text-[11px] font-semibold whitespace-nowrap">
                        {p.name[0]}. {p.surname}
                      </span>
                      {p.preferred_position_primary && (
                        <span className="text-[8px] font-semibold tracking-widest opacity-70">
                          {p.preferred_position_primary}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {!editable && (
              <p className="text-[10px] mt-3" style={{ color: 'var(--color-text-muted)' }}>
                Only players on this team (or the admin) can edit the formation.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
