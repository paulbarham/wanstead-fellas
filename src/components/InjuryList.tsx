import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PlayerAvatar from './PlayerAvatar'
import type { ActiveInjuryRow, Profile } from '../types'

// Public "On the injury list" surface. Shows every currently-injured fella
// (cleared_at NULL + return_date >= today) as a compact list — name, injury,
// return-Thursday. Renders nothing if the list is empty so the Tonight tab
// stays quiet in a healthy week.
//
// Reads from v_active_injuries (mig 078). No auth check needed — the RLS
// policy on `injuries` allows public read of the row set the view exposes.

function formatReturn(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function InjuryList() {
  const [rows, setRows] = useState<ActiveInjuryRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('v_active_injuries')
        .select('*')
        .order('return_date', { ascending: true })
      if (!cancelled) setRows((data as ActiveInjuryRow[] | null) ?? [])
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (!rows || rows.length === 0) return null

  return (
    <div className="rounded-2xl mb-4"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        backgroundClip: 'padding-box',
      }}>
      <div className="px-4 py-2.5 flex items-center justify-between"
        style={{
          borderTopLeftRadius: 15, borderTopRightRadius: 15,
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-2, var(--color-bg))',
        }}>
        <p className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--tt-red, #DC2626)' }}>
          🩹 On the injury list
        </p>
        <span className="text-[10px]"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          {rows.length} out
        </span>
      </div>
      <div>
        {rows.map((r, i) => (
          <div key={r.id}
            className="px-4 py-2.5 flex items-center gap-3"
            style={{
              borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
            }}>
            <PlayerAvatar
              profile={{ id: r.player_id, name: r.player_name, surname: r.player_surname, photo_url: r.player_photo_url } as unknown as Profile}
              size={32}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: 'var(--color-text)' }}>
                <span className="font-semibold">{r.display_name}</span>
                <span style={{ color: 'var(--color-text-muted)' }}> · {r.injury_type}</span>
              </p>
              {r.notes && (
                <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                  {r.notes}
                </p>
              )}
            </div>
            <span className="text-[10px] whitespace-nowrap flex-shrink-0"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              back {formatReturn(r.return_date)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
