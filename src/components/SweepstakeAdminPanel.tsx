// Admin tools for the World Cup Sweepstake. Lets an admin flip each team's
// tournament status (alive → group_stage_out → r16_out → ... → winner) and
// override the goals-against / red-cards tallies. Manual_ga is preferred
// over the value computed from cup_matches when set.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_OPTIONS = [
  { value: 'alive',              label: 'Alive · still in' },
  { value: 'group_stage_out',    label: 'Out — Group Stage' },
  { value: 'r16_out',            label: 'Out — Round of 16' },
  { value: 'qf_out',             label: 'Out — Quarter Final' },
  { value: 'sf_out',             label: 'Out — Semi Final' },
  { value: 'third_place_lost',   label: 'Out — 3rd-place playoff' },
  { value: 'final_lost',         label: 'Runner-up (lost final)' },
  { value: 'winner',             label: '🏆 Winner' },
] as const

interface Row {
  team_name: string
  status: string
  manual_ga: number | null
  manual_reds: number | null
  sweep_name: string
}

const MONO = 'var(--font-mono)'
const TT_YELLOW = 'var(--tt-yellow)'
const TT_CYAN = 'var(--tt-cyan)'

export default function SweepstakeAdminPanel() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('cup_sweepstake_team_status').select('*').order('team_name'),
      supabase.from('cup_sweepstake_entries').select('team_name, sweep_name'),
    ]).then(([s, e]) => {
      if (cancelled) return
      const ownerByTeam = new Map<string, string>()
      for (const r of (e.data as { team_name: string; sweep_name: string }[]) ?? []) {
        ownerByTeam.set(r.team_name, r.sweep_name)
      }
      const enriched = ((s.data as Row[]) ?? []).map(r => ({
        ...r,
        sweep_name: ownerByTeam.get(r.team_name) ?? '—',
      }))
      setRows(enriched)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  async function update(team_name: string, patch: Partial<Row>) {
    setSaveError(null)
    setRows(prev => prev.map(r => r.team_name === team_name ? { ...r, ...patch } : r))
    const { error } = await supabase
      .from('cup_sweepstake_team_status')
      .update(patch)
      .eq('team_name', team_name)
    if (error) setSaveError(`${team_name}: ${error.message}`)
  }

  return (
    <div className="rounded-xl mb-3 overflow-hidden" style={{ border: '1px solid var(--color-border)', fontFamily: MONO }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-3"
        style={{ background: open ? 'var(--color-surface-2)' : 'transparent' }}
      >
        <div className="flex items-center justify-between">
          <span style={{ color: TT_YELLOW, fontSize: 11, letterSpacing: '0.16em', fontWeight: 800 }}>
            🎟 SWEEPSTAKE — TEAM STATUS · GA · REDS
          </span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
        {!open && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Mark teams eliminated · set goals against · set red cards
          </p>
        )}
      </button>

      {open && (
        <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          {saveError && (
            <p className="text-[11px] p-2 rounded"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid var(--color-error-border)' }}>
              ⚠ {saveError}
            </p>
          )}
          {loading && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          )}
          {!loading && rows.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No teams in the sweepstake.</p>
          )}
          {rows.map(r => (
            <div key={r.team_name}
              className="rounded-lg p-2"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 600 }}>{r.team_name}</span>
                <span style={{ color: TT_CYAN, fontSize: 10, letterSpacing: '0.08em' }}>{r.sweep_name.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-[1fr_60px_60px] gap-2">
                <select
                  value={r.status}
                  onChange={e => update(r.team_name, { status: e.target.value })}
                  className="px-2 py-1.5 rounded text-xs"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }}
                >
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                  type="number" min={0} placeholder="GA"
                  value={r.manual_ga ?? ''}
                  onChange={e => update(r.team_name, { manual_ga: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                  className="px-2 py-1.5 rounded text-xs text-center"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }}
                />
                <input
                  type="number" min={0} placeholder="🟥"
                  value={r.manual_reds ?? ''}
                  onChange={e => update(r.team_name, { manual_reds: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                  className="px-2 py-1.5 rounded text-xs text-center"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }}
                />
              </div>
            </div>
          ))}
          <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
            GA blank = falls back to whatever cup_matches has logged for the team.
            Reds blank = shown as 0 until an admin enters a value.
            Changes save instantly per field.
          </p>
        </div>
      )}
    </div>
  )
}
