// Admin tools for the World Cup Sweepstake. With 48 teams, a flat list
// got cramped fast — this version adds a search box and an All / Alive /
// Out filter, groups eliminated teams below alive ones, and shows the
// auto-computed GA (from cup_matches) so admin can see at a glance
// whether the manual override is actually needed for that team.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_OPTIONS = [
  { value: 'alive',              label: 'Alive · still in' },
  { value: 'group_stage_out',    label: 'Out — Group Stage' },
  { value: 'r32_out',            label: 'Out — Round of 32' },
  { value: 'r16_out',            label: 'Out — Round of 16' },
  { value: 'qf_out',             label: 'Out — Quarter Final' },
  { value: 'sf_out',             label: 'Out — Semi Final' },
  { value: 'third_place_lost',   label: 'Out — 3rd-place playoff' },
  { value: 'final_lost',         label: 'Runner-up (lost final)' },
  { value: 'winner',             label: '🏆 Winner' },
] as const

const ALIVE_STATES = new Set(['alive', 'winner'])

interface StatusRow {
  team_name: string
  status: string
  manual_ga: number | null
  manual_reds: number | null
  sweep_name: string
  computed_ga: number   // from cup_matches, for the hint
}

interface CupMatchLite {
  team1: string
  team2: string
  score1: number | null
  score2: number | null
  actual_outcome: string | null
}

const MONO = 'var(--font-mono)'
const TT_YELLOW = 'var(--tt-yellow)'
const TT_CYAN = 'var(--tt-cyan)'
const TT_GREEN = 'var(--tt-green)'
const TT_RED = 'var(--tt-red)'

type Filter = 'all' | 'alive' | 'out'

function computeGa(team: string, matches: CupMatchLite[]): number {
  let ga = 0
  for (const m of matches) {
    if (m.actual_outcome == null) continue
    if (m.team1 === team) ga += m.score2 ?? 0
    else if (m.team2 === team) ga += m.score1 ?? 0
  }
  return ga
}

export default function SweepstakeAdminPanel() {
  const [rows, setRows] = useState<StatusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('cup_sweepstake_team_status').select('*').order('team_name'),
      supabase.from('cup_sweepstake_entries').select('team_name, sweep_name'),
      supabase.from('cup_matches').select('team1, team2, score1, score2, actual_outcome'),
    ]).then(([s, e, m]) => {
      if (cancelled) return
      const ownerByTeam = new Map<string, string>()
      for (const r of (e.data as { team_name: string; sweep_name: string }[]) ?? []) {
        ownerByTeam.set(r.team_name, r.sweep_name)
      }
      const matches = (m.data as CupMatchLite[]) ?? []
      const enriched = ((s.data as Omit<StatusRow, 'sweep_name' | 'computed_ga'>[]) ?? []).map(r => ({
        ...r,
        sweep_name: ownerByTeam.get(r.team_name) ?? '—',
        computed_ga: computeGa(r.team_name, matches),
      }))
      setRows(enriched)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  async function update(team_name: string, patch: Partial<StatusRow>) {
    setSaveError(null)
    setRows(prev => prev.map(r => r.team_name === team_name ? { ...r, ...patch } : r))
    const { error } = await supabase
      .from('cup_sweepstake_team_status')
      .update(patch)
      .eq('team_name', team_name)
    if (error) setSaveError(`${team_name}: ${error.message}`)
  }

  // Filter + group: alive teams first (alphabetical), eliminated after,
  // matching the search query (team name or owner) if any.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matchesQ = (r: StatusRow) =>
      !q || r.team_name.toLowerCase().includes(q) || r.sweep_name.toLowerCase().includes(q)
    const matchesF = (r: StatusRow) =>
      filter === 'all' || (filter === 'alive' && ALIVE_STATES.has(r.status)) || (filter === 'out' && !ALIVE_STATES.has(r.status))
    const filtered = rows.filter(r => matchesQ(r) && matchesF(r))
    const alive = filtered.filter(r => ALIVE_STATES.has(r.status))
    const out = filtered.filter(r => !ALIVE_STATES.has(r.status))
    return { alive, out, total: filtered.length }
  }, [rows, query, filter])

  const aliveCount = rows.filter(r => ALIVE_STATES.has(r.status)).length
  const outCount = rows.length - aliveCount

  return (
    <div className="rounded-xl mb-3 overflow-hidden" style={{ border: '1px solid var(--color-border)', fontFamily: MONO }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-3"
        style={{ background: open ? 'var(--color-surface-2)' : 'transparent' }}
      >
        <div className="flex items-center justify-between">
          <span style={{ color: TT_YELLOW, fontSize: 11, letterSpacing: '0.16em', fontWeight: 800 }}>
            🎟 SWEEPSTAKE — STATUS · GA · REDS
          </span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
        {!open && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {aliveCount} alive · {outCount} out · tap to edit
          </p>
        )}
      </button>

      {open && (
        <div className="p-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          {saveError && (
            <p className="text-[11px] mb-2 p-2 rounded"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid var(--color-error-border)' }}>
              ⚠ {saveError}
            </p>
          )}

          {/* Search + filter */}
          <div className="space-y-2 mb-3">
            <input
              type="text"
              placeholder="Search team or owner…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }}
            />
            <div className="flex gap-1">
              {(['all', 'alive', 'out'] as Filter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="flex-1 px-2 py-1.5 rounded text-[11px] font-semibold"
                  style={{
                    background: filter === f ? TT_YELLOW : 'transparent',
                    color: filter === f ? '#000' : 'var(--color-text-muted)',
                    border: filter === f ? '1px solid ' + TT_YELLOW : '1px solid var(--color-border)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {f === 'all' ? `All · ${rows.length}` : f === 'alive' ? `Alive · ${aliveCount}` : `Out · ${outCount}`}
                </button>
              ))}
            </div>
          </div>

          {loading && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}

          {!loading && visible.total === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
              No teams match.
            </p>
          )}

          {visible.alive.length > 0 && (
            <>
              <p className="text-[10px] mt-2 mb-1.5" style={{ color: TT_GREEN, letterSpacing: '0.12em', fontWeight: 700 }}>
                ▶ ALIVE · {visible.alive.length}
              </p>
              <div className="space-y-1.5">
                {visible.alive.map(r => <Row key={r.team_name} row={r} onPatch={update} />)}
              </div>
            </>
          )}

          {visible.out.length > 0 && (
            <>
              <p className="text-[10px] mt-3 mb-1.5" style={{ color: TT_RED, letterSpacing: '0.12em', fontWeight: 700 }}>
                ▶ ELIMINATED · {visible.out.length}
              </p>
              <div className="space-y-1.5">
                {visible.out.map(r => <Row key={r.team_name} row={r} onPatch={update} />)}
              </div>
            </>
          )}

          <p className="text-[10px] mt-3" style={{ color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
            GA blank → auto-computed from cup_matches (shown next to the box).
            Reds blank → 0. Each field saves the moment you change it.
          </p>
        </div>
      )}
    </div>
  )
}

function Row({ row, onPatch }: { row: StatusRow; onPatch: (team: string, patch: Partial<StatusRow>) => void }) {
  const alive = ALIVE_STATES.has(row.status)
  const gaPlaceholder = row.computed_ga > 0 ? `auto: ${row.computed_ga}` : 'GA'
  return (
    <div
      className="rounded-lg p-2.5"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        opacity: alive ? 1 : 0.85,
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <span style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 700 }}>
          {row.team_name}
        </span>
        <span style={{ color: TT_CYAN, fontSize: 10, letterSpacing: '0.08em' }}>
          {row.sweep_name.toUpperCase()}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_64px_56px] gap-2">
        <select
          value={row.status}
          onChange={e => onPatch(row.team_name, { status: e.target.value })}
          className="px-2 py-2 rounded text-xs"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          type="number" min={0} placeholder={gaPlaceholder}
          value={row.manual_ga ?? ''}
          onChange={e => onPatch(row.team_name, { manual_ga: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
          className="px-2 py-2 rounded text-sm text-center"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }}
          aria-label={`Manual GA for ${row.team_name}`}
        />
        <input
          type="number" min={0} placeholder="🟥"
          value={row.manual_reds ?? ''}
          onChange={e => onPatch(row.team_name, { manual_reds: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
          className="px-2 py-2 rounded text-sm text-center"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }}
          aria-label={`Manual reds for ${row.team_name}`}
        />
      </div>
    </div>
  )
}
