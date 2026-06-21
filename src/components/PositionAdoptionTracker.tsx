import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PositionPicker from './PositionPicker'
import type { PreferredPosition } from '../types'

interface AdoptionRow {
  id: string
  name: string
  surname: string
  player_type: string
  preferred_position_primary: PreferredPosition | null
  preferred_position_secondary: PreferredPosition | null
  recent_apps: number
  last_app: string | null
  status: 'set' | 'unset'
}

// Admin-only panel surfacing how many active players have set their preferred
// position, with a per-player inline picker so admin can set on a straggler's
// behalf without leaving the page. Reads from v_position_adoption (migration
// 025); writes back to profiles directly.
export default function PositionAdoptionTracker() {
  const [rows, setRows] = useState<AdoptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('v_position_adoption')
      .select('*')
    setRows((data as AdoptionRow[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function savePosition(playerId: string, next: { primary: PreferredPosition | null; secondary: PreferredPosition | null }) {
    setSavingId(playerId)
    await supabase
      .from('profiles')
      .update({
        preferred_position_primary: next.primary,
        preferred_position_secondary: next.secondary,
      })
      .eq('id', playerId)
    await load()
    setSavingId(null)
  }

  const setCount = rows.filter(r => r.status === 'set').length
  const unsetRows = rows.filter(r => r.status === 'unset')
  const total = rows.length
  const pct = total > 0 ? Math.round((setCount / total) * 100) : 0

  if (loading) {
    return (
      <div className="p-3 rounded-2xl mb-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading position adoption…</p>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl mb-3 overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full p-3 text-left"
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tt-cyan)' }}>
            ⚽ Position Adoption
          </p>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--tt-yellow)', lineHeight: 1 }}>
            {setCount}<span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>/{total}</span>
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>
            ({pct}%) · {unsetRows.length} to chase
          </span>
        </div>
        <div
          style={{
            height: 6, borderRadius: 3,
            background: 'var(--color-border)', overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`, height: '100%',
              background: pct >= 90 ? 'var(--tt-green)' : pct >= 70 ? 'var(--tt-yellow)' : 'var(--tt-red)',
              transition: 'width 0.3s',
            }}
          />
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)' }}>
          {unsetRows.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs" style={{ color: 'var(--tt-green)' }}>
              🎉 All active players have set a position.
            </p>
          ) : (
            <>
              <p className="px-3 pt-3 pb-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Tap a position to set on the player's behalf — they can change it later from their Profile.
              </p>
              {unsetRows.map(row => (
                <div key={row.id} className="px-3 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                      {row.name} {row.surname}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {row.recent_apps} of last 8 · {row.player_type === 'subscribed' ? 'SUB' : 'WTP'}
                    </span>
                  </div>
                  <div style={{ opacity: savingId === row.id ? 0.5 : 1 }}>
                    <PositionPicker
                      primary={row.preferred_position_primary}
                      secondary={row.preferred_position_secondary}
                      onChange={next => savePosition(row.id, next)}
                      compact
                    />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
