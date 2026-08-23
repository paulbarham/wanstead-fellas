import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import PlayerAvatar from './PlayerAvatar'
import type { ActiveInjuryRow, Profile } from '../types'

// Admin view of the injury list. Reads the same v_active_injuries the
// Tonight tab uses; adds a Clear button for admins to end a stub-profile
// or forgetful player's injury on their behalf.
//
// Also lists CLEARED / EXPIRED injuries from the last 90 days as a
// history strip so the admin can see recent turnover.

interface AdminHistoryRow {
  id: string
  player_id: string
  injury_type: string
  notes: string | null
  reported_at: string
  return_date: string
  cleared_at: string | null
  player_name: string | null
}

function formatDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function AdminInjuriesPanel() {
  const { profile } = useAuth()
  const [active, setActive] = useState<ActiveInjuryRow[] | null>(null)
  const [history, setHistory] = useState<AdminHistoryRow[] | null>(null)
  const [clearing, setClearing] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: activeRows }, { data: hist }] = await Promise.all([
      supabase
        .from('v_active_injuries')
        .select('*')
        .order('return_date', { ascending: true }),
      supabase
        .from('injuries')
        .select('id, player_id, injury_type, notes, reported_at, return_date, cleared_at')
        .or(`cleared_at.not.is.null,return_date.lt.${new Date().toISOString().slice(0, 10)}`)
        .gte('reported_at', new Date(Date.now() - 90 * 86400e3).toISOString())
        .order('reported_at', { ascending: false })
        .limit(30),
    ])
    // Look up names for the history rows in a second hop.
    const histRows = (hist as Omit<AdminHistoryRow, 'player_name'>[] | null) ?? []
    const playerIds = Array.from(new Set(histRows.map(h => h.player_id)))
    const { data: profs } = playerIds.length
      ? await supabase.from('profiles').select('id, name, surname').in('id', playerIds)
      : { data: [] as Profile[] }
    const nameByPlayerId: Record<string, string> = {}
    for (const p of (profs as { id: string; name: string; surname: string }[]) ?? []) {
      nameByPlayerId[p.id] = `${p.name} ${p.surname}`.trim()
    }
    setActive((activeRows as ActiveInjuryRow[] | null) ?? [])
    setHistory(histRows.map(h => ({ ...h, player_name: nameByPlayerId[h.player_id] ?? null })))
  }, [])

  useEffect(() => { load() }, [load])

  async function clearOnBehalf(row: ActiveInjuryRow) {
    if (!confirm(`Mark ${row.display_name} as recovered? They'll drop off the injury list.`)) return
    setClearing(row.id)
    await supabase
      .from('injuries')
      .update({ cleared_at: new Date().toISOString(), cleared_by: profile?.id ?? null })
      .eq('id', row.id)
    await load()
    setClearing(null)
  }

  if (active == null || history == null) {
    return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading injuries…</p>
  }

  return (
    <div className="space-y-4">
      {/* Currently out */}
      <div>
        <p className="text-xs uppercase tracking-widest font-semibold mb-2"
          style={{ color: 'var(--tt-red, #DC2626)' }}>
          🩹 Currently out ({active.length})
        </p>
        {active.length === 0 ? (
          <div className="text-center py-6 px-3 rounded-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <p className="text-2xl mb-1">✅</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Full clean bill of health — nobody on the injury list.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {active.map(r => (
              <div key={r.id}
                className="px-3 py-2.5 rounded-xl flex items-center gap-3"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <PlayerAvatar
                  profile={{ id: r.player_id, name: r.player_name, surname: r.player_surname, photo_url: r.player_photo_url } as unknown as Profile}
                  size={32}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: 'var(--color-text)' }}>
                    <span className="font-semibold">{r.display_name}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}> · {r.injury_type}</span>
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Reported {formatDate(r.reported_at.slice(0, 10))} · Back {formatDate(r.return_date)}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => clearOnBehalf(r)}
                  disabled={clearing === r.id}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium flex-shrink-0 disabled:opacity-50"
                  style={{
                    background: 'var(--color-primary)',
                    color: 'var(--color-text)',
                  }}>
                  {clearing === r.id ? '…' : 'Clear'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent history (last 90 days) */}
      <div>
        <p className="text-xs uppercase tracking-widest font-semibold mb-2"
          style={{ color: 'var(--color-text-muted)' }}>
          Recent history · last 90 days
        </p>
        {history.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No recent injury history to show.
          </p>
        ) : (
          <div className="space-y-1"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 8 }}>
            {history.map(h => (
              <div key={h.id}
                className="px-2 py-1.5 flex items-center gap-2 text-[11px]"
                style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                <span style={{ minWidth: 100 }} className="truncate">
                  {h.player_name ?? '—'}
                </span>
                <span className="flex-1 truncate">
                  {h.injury_type} · reported {formatDate(h.reported_at.slice(0, 10))} · due back {formatDate(h.return_date)}
                </span>
                <span style={{ color: h.cleared_at ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                  {h.cleared_at ? 'cleared' : 'expired'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
