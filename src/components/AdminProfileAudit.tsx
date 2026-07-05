import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// Live version of the profile-completeness audit doc (primer 14). Renders
// the same shape — squad-wide tiles + age-spread strip + per-player table
// sorted by gap count — but queried fresh from the DB on every mount, so
// committee members can bookmark the Admin → Audit tab and always see
// current state. No PDF regen loop.
//
// Data source is the same tables the offline generator uses:
//   * profiles (photo_url, dob, age_group, favourite_club,
//                preferred_position_primary/secondary, preferred_foot)
//   * team_players → teams → matches for the "active in last 90 days" filter
//   * push_subscriptions for the 🔔 column

interface Row {
  id: string
  name: string
  surname: string
  player_type: 'subscribed' | 'wtp_priority' | 'wtp'
  has_photo: boolean
  has_dob: boolean
  has_age_group: boolean
  band: string | null
  has_club: boolean
  has_pos1: boolean
  has_pos2: boolean
  has_foot: boolean
  has_push: boolean
  gaps: number
}

const TIER_LABEL: Record<Row['player_type'], string> = {
  subscribed: 'SUB',
  wtp_priority: 'WTP★',
  wtp: 'WTP',
}
const TIER_COLOR: Record<Row['player_type'], string> = {
  subscribed: 'var(--tt-green, #4ADC7A)',
  wtp_priority: 'var(--tt-yellow, #FFD400)',
  wtp: '#9CA897',
}

type ShortBand = 'U20' | '20s' | '30s' | '40s' | '50+'
function shortBand(band: string | null): ShortBand | null {
  if (!band) return null
  const b = band.trim()
  if (b === 'Under 20') return 'U20'
  if (b === '20–29' || b === '20-29') return '20s'
  if (b === '30–39' || b === '30-39') return '30s'
  if (b === '40–49' || b === '40-49' || b === '40+') return '40s'
  if (b === '50+') return '50+'
  return null
}

// Derive band from dob when possible; fall back to age_group text.
function computeBand(dob: string | null, ageGroup: string | null): string | null {
  if (dob) {
    const born = new Date(dob)
    if (!Number.isNaN(born.getTime())) {
      const now = new Date()
      let age = now.getFullYear() - born.getFullYear()
      const m = now.getMonth() - born.getMonth()
      if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--
      if (age < 20) return 'Under 20'
      if (age < 30) return '20-29'
      if (age < 40) return '30-39'
      if (age < 50) return '40-49'
      return '50+'
    }
  }
  return ageGroup
}

interface Totals {
  total: number
  photo: number
  age: number
  dob: number
  club: number
  pos1: number
  pos2: number
  foot: number
  push: number
}

async function loadAudit(): Promise<{ rows: Row[]; totals: Totals }> {
  // "Active" = played in a match in the last 90 days. Match the offline
  // audit's denominator so numbers on the PDF and in the app agree.
  const cutoffIso = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 90)
    return d.toISOString().slice(0, 10)
  })()

  // Step 1: fetch matches in window (id only)
  const { data: matches } = await supabase
    .from('matches')
    .select('id')
    .gte('match_date', cutoffIso)
  const matchIds = ((matches as { id: string }[]) || []).map(m => m.id)
  if (matchIds.length === 0) return { rows: [], totals: emptyTotals() }

  // Step 2: teams for those matches
  const { data: teams } = await supabase
    .from('teams')
    .select('id, match_id')
    .in('match_id', matchIds)
  const teamIds = ((teams as { id: string }[]) || []).map(t => t.id)
  if (teamIds.length === 0) return { rows: [], totals: emptyTotals() }

  // Step 3: distinct player ids on those teams
  const { data: tp } = await supabase
    .from('team_players')
    .select('player_id')
    .in('team_id', teamIds)
  const activeIds = Array.from(new Set(((tp as { player_id: string }[]) || []).map(r => r.player_id)))
  if (activeIds.length === 0) return { rows: [], totals: emptyTotals() }

  // Step 4: profiles + push subscriptions in parallel
  const [{ data: profs }, { data: subs }] = await Promise.all([
    supabase.from('profiles')
      .select('id, name, surname, player_type, photo_url, dob, age_group, favourite_club, preferred_position_primary, preferred_position_secondary, preferred_foot')
      .in('id', activeIds),
    supabase.from('push_subscriptions')
      .select('player_id')
      .in('player_id', activeIds),
  ])
  type P = {
    id: string; name: string; surname: string; player_type: Row['player_type'];
    photo_url: string | null; dob: string | null; age_group: string | null;
    favourite_club: string | null;
    preferred_position_primary: string | null;
    preferred_position_secondary: string | null;
    preferred_foot: string | null;
  }
  const pushSet = new Set(((subs as { player_id: string }[]) || []).map(s => s.player_id))

  const rows: Row[] = ((profs as P[]) || []).map(p => {
    const hasAge = p.dob !== null || p.age_group !== null
    const has = {
      photo: p.photo_url !== null,
      dob: p.dob !== null,
      age_group: p.age_group !== null,
      club: p.favourite_club !== null,
      pos1: p.preferred_position_primary !== null,
      pos2: p.preferred_position_secondary !== null,
      foot: p.preferred_foot !== null,
      push: pushSet.has(p.id),
    }
    const gaps = [!has.photo, !hasAge, !has.club, !has.pos1, !has.pos2, !has.foot, !has.push]
      .filter(Boolean).length
    return {
      id: p.id, name: p.name, surname: p.surname, player_type: p.player_type,
      has_photo: has.photo, has_dob: has.dob, has_age_group: has.age_group,
      band: computeBand(p.dob, p.age_group),
      has_club: has.club, has_pos1: has.pos1, has_pos2: has.pos2,
      has_foot: has.foot, has_push: has.push,
      gaps,
    }
  })

  rows.sort((a, b) => {
    if (b.gaps !== a.gaps) return b.gaps - a.gaps
    return `${a.surname}${a.name}`.localeCompare(`${b.surname}${b.name}`)
  })

  const totals: Totals = {
    total: rows.length,
    photo: rows.filter(r => r.has_photo).length,
    age: rows.filter(r => r.has_dob || r.has_age_group).length,
    dob: rows.filter(r => r.has_dob).length,
    club: rows.filter(r => r.has_club).length,
    pos1: rows.filter(r => r.has_pos1).length,
    pos2: rows.filter(r => r.has_pos2).length,
    foot: rows.filter(r => r.has_foot).length,
    push: rows.filter(r => r.has_push).length,
  }
  return { rows, totals }
}

function emptyTotals(): Totals {
  return { total: 0, photo: 0, age: 0, dob: 0, club: 0, pos1: 0, pos2: 0, foot: 0, push: 0 }
}

function pct(n: number, d: number): number { return d === 0 ? 0 : Math.round(100 * n / d) }

function tileTone(p: number): 'high' | 'mid' | 'low' {
  if (p >= 66) return 'high'
  if (p >= 33) return 'mid'
  return 'low'
}
const TILE_COLORS: Record<'high' | 'mid' | 'low', string> = {
  high: 'var(--tt-green, #4ADC7A)',
  mid: 'var(--tt-yellow, #FFD400)',
  low: 'var(--tt-red, #FF5555)',
}

export default function AdminProfileAudit() {
  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<Totals>(emptyTotals())
  const [loading, setLoading] = useState(true)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  async function refresh() {
    setLoading(true)
    const { rows, totals } = await loadAudit()
    setRows(rows)
    setTotals(totals)
    setLoading(false)
    setRefreshedAt(new Date())
  }

  useEffect(() => { refresh() }, [])

  const bandCounts = useMemo(() => {
    const order: ShortBand[] = ['U20', '20s', '30s', '40s', '50+']
    const counts: Record<ShortBand, number> = { U20: 0, '20s': 0, '30s': 0, '40s': 0, '50+': 0 }
    let unknown = 0
    for (const r of rows) {
      const b = shortBand(r.band)
      if (b) counts[b]++
      else unknown++
    }
    return { order, counts, unknown }
  }, [rows])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Live — refreshes on tab open or when you tap ↻.
          {refreshedAt && ` Last pulled ${refreshedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`}
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
        >
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {([
          ['⚙️', 'POS-1', totals.pos1],
          ['📸', 'PHOTO', totals.photo],
          ['🎂', 'AGE', totals.age, `DOB ${pct(totals.dob, totals.total)}%`],
          ['🏆', 'CLUB', totals.club],
          ['🛡️', 'POS-2', totals.pos2],
          ['🦶', 'FOOT', totals.foot],
          ['🔔', 'PUSH', totals.push],
        ] as Array<[string, string, number, string?]>).map(([icon, lbl, val, sub]) => {
          const p = pct(val, totals.total)
          const tone = tileTone(p)
          return (
            <div key={lbl}
              className="rounded-lg p-2 text-center"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 16, lineHeight: 1 }}>{icon}</div>
              <div className="mt-1" style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 7.5, letterSpacing: '0.08em',
                color: 'var(--color-text-muted)',
              }}>{lbl}</div>
              <div className="font-display" style={{ fontSize: 13, color: TILE_COLORS[tone], marginTop: 1 }}>
                {val}/{totals.total}
              </div>
              <div style={{ fontSize: 8, color: 'var(--color-text-muted)' }}>
                {p}%{sub ? ` · ${sub}` : ''}
              </div>
            </div>
          )
        })}
      </div>

      {/* Age spread strip */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: 'var(--color-text-muted)' }}>
          Age spread
        </p>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
          {bandCounts.order.map(code => (
            <div key={code}
              className="rounded-md py-1.5 text-center"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="font-display" style={{ fontSize: 12, color: 'var(--tt-yellow)' }}>{code}</div>
              <div className="font-display" style={{ fontSize: 14, color: 'var(--color-text)' }}>{bandCounts.counts[code]}</div>
            </div>
          ))}
          <div className="rounded-md py-1.5 text-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--tt-red)' }}>
            <div className="font-display" style={{ fontSize: 12, color: 'var(--tt-red)' }}>?</div>
            <div className="font-display" style={{ fontSize: 14, color: 'var(--color-text)' }}>{bandCounts.unknown}</div>
          </div>
        </div>
      </div>

      {/* Per-player table */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        <table className="w-full" style={{ fontSize: 10 }}>
          <thead>
            <tr style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}>
              <th className="text-left px-2 py-1.5 font-semibold" style={{ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Player</th>
              <th className="text-center px-1 py-1.5 font-semibold" style={{ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tier</th>
              <th className="text-center px-1 py-1.5" style={{ fontSize: 12 }}>📸</th>
              <th className="text-center px-1 py-1.5" style={{ fontSize: 12 }}>🎂</th>
              <th className="text-center px-1 py-1.5" style={{ fontSize: 12 }}>🏆</th>
              <th className="text-center px-1 py-1.5" style={{ fontSize: 12 }}>⚙️</th>
              <th className="text-center px-1 py-1.5" style={{ fontSize: 12 }}>🛡️</th>
              <th className="text-center px-1 py-1.5" style={{ fontSize: 12 }}>🦶</th>
              <th className="text-center px-1 py-1.5" style={{ fontSize: 12 }}>🔔</th>
              <th className="text-center px-1 py-1.5 font-semibold" style={{ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Gaps</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <RowRender key={r.id} r={r} zebra={i % 2 === 1} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowRender({ r, zebra }: { r: Row; zebra: boolean }) {
  const bg = zebra ? 'var(--color-surface-2)' : 'transparent'
  return (
    <tr style={{ background: bg, borderTop: '1px solid var(--color-border)' }}>
      <td className="px-2 py-1" style={{ color: 'var(--color-text)', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {r.name} {r.surname}
      </td>
      <td className="text-center px-1 py-1" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 8, color: TIER_COLOR[r.player_type], fontWeight: 700 }}>
        {TIER_LABEL[r.player_type]}
      </td>
      <Mark ok={r.has_photo} />
      <AgeMark r={r} />
      <Mark ok={r.has_club} />
      <Mark ok={r.has_pos1} />
      <Mark ok={r.has_pos2} />
      <Mark ok={r.has_foot} />
      <Mark ok={r.has_push} />
      <td className="text-center px-1 py-1">
        <GapPill n={r.gaps} />
      </td>
    </tr>
  )
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <td className="text-center px-1 py-1"
      style={{
        color: ok ? 'var(--tt-green)' : 'var(--tt-red)',
        background: ok ? 'rgba(74,220,122,0.10)' : 'rgba(255,85,85,0.10)',
        fontWeight: 700,
      }}>
      {ok ? '✓' : '✗'}
    </td>
  )
}

function AgeMark({ r }: { r: Row }) {
  const short = shortBand(r.band)
  if (r.has_dob && short) {
    return (
      <td className="text-center px-1 py-1"
        style={{
          color: 'var(--tt-green)',
          background: 'rgba(74,220,122,0.12)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
        }}>{short}</td>
    )
  }
  if (short) {
    return (
      <td className="text-center px-1 py-1"
        style={{
          color: 'var(--tt-cyan)',
          background: 'rgba(74,217,255,0.10)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
        }}>{short}</td>
    )
  }
  return <Mark ok={false} />
}

function GapPill({ n }: { n: number }) {
  const [color, bg] = n === 0
    ? ['var(--tt-green)', 'rgba(74,220,122,0.18)']
    : n <= 2
      ? ['var(--tt-cyan)', 'rgba(74,217,255,0.18)']
      : n <= 4
        ? ['var(--tt-yellow)', 'rgba(255,212,0,0.18)']
        : ['var(--tt-red)', 'rgba(255,85,85,0.18)']
  return (
    <span style={{
      display: 'inline-block', minWidth: 20, padding: '1px 6px',
      borderRadius: 999, background: bg, color, border: `1px solid ${color}`,
      fontFamily: 'var(--font-mono, monospace)', fontSize: 9, fontWeight: 800,
    }}>
      {n}
    </span>
  )
}
