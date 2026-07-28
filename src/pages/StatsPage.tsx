import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PlayerAvatar from '../components/PlayerAvatar'
import CeefaxHeader from '../components/CeefaxHeader'
import { useAuth } from '../hooks/useAuth'
import { FINE_TYPES, PREFERRED_POSITIONS } from '../types'
import type { Profile, FineType, PreferredPosition } from '../types'

type Mode = 'all' | 'month'
type PosFilter = PreferredPosition | 'all'
type ProfileLite = Pick<Profile, 'id' | 'name' | 'surname' | 'photo_url' | 'preferred_position_primary'>

// Current calendar month, e.g. "2026-05". "This Month" shows only matches
// whose date falls in this month; at month rollover it naturally resets and
// everything stays available under "All Time".
const NOW = new Date()
const CUR_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
const inMode = (mode: Mode, date: string | null | undefined) =>
  mode === 'all' || (!!date && date.slice(0, 7) === CUR_MONTH)


function PeriodToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
      {(['month', 'all'] as Mode[]).map(m => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className="px-3 py-1.5 text-xs font-semibold transition-colors"
          style={{
            background: mode === m ? 'var(--color-primary)' : 'var(--color-surface)',
            color: mode === m ? '#FFFFFF' : 'var(--color-text-muted)',
          }}
        >
          {m === 'month' ? 'This Month' : 'All Time'}
        </button>
      ))}
    </div>
  )
}

// Position filter applies globally to every leaderboard on the page. When set,
// each panel only shows players whose primary preferred_position matches —
// "Top 3 strikers · defenders · GKs separately" promised in guide v4.
function PositionFilter({ value, setValue }: { value: PosFilter; setValue: (v: PosFilter) => void }) {
  const opts: { v: PosFilter; label: string; icon?: string }[] = [
    { v: 'all', label: 'All' },
    ...PREFERRED_POSITIONS.map(p => ({ v: p.value as PosFilter, label: p.label, icon: p.icon })),
  ]
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {opts.map(opt => {
        const active = value === opt.v
        return (
          <button
            key={opt.v}
            onClick={() => setValue(opt.v)}
            className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1"
            style={{
              background: active ? 'var(--color-primary)' : 'var(--color-surface)',
              color: active ? '#FFFFFF' : 'var(--color-text-muted)',
              border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
            }}
          >
            {opt.icon && <span style={{ fontSize: 12, lineHeight: 1 }}>{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function Panel({
  title,
  icon,
  defaultOpen = false,
  preview,
  children,
}: {
  title: string
  icon: string
  defaultOpen?: boolean
  // Always-visible block under the head — used for podium previews so the
  // leaderboard reads at a glance without tapping to expand.
  preview?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl mb-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', backgroundClip: 'padding-box' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-2.5"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-base leading-none">{icon}</span>
          <span className="font-semibold text-sm text-[var(--color-text)]">{title}</span>
        </span>
        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {preview && <div className="px-4 pb-2.5">{preview}</div>}
      {open && <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--color-border)' }}>{children}</div>}
    </div>
  )
}

// Top-3 podium that lives under each panel head so the leaderboard is visible
// at a glance. If all top rows tie at the same value (e.g. 4 players on 1
// MOTM each), collapses to a compact "N-way tie" treatment instead of three
// identical bars.
type PodiumRow = { profile: ProfileLite | undefined; value: number; display?: string; note?: string }
function PodiumPreview({ rows, unit, emptyText }: { rows: PodiumRow[]; unit?: string; emptyText?: string }) {
  if (rows.length === 0) {
    return <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{emptyText ?? 'No data yet.'}</div>
  }
  const top = rows[0].value
  const tied = rows.filter(r => r.value === top)
  // 3+ all tied at top → compact treatment.
  if (tied.length >= 3) {
    const names = tied.slice(0, 4).map(r => r.profile ? `${r.profile.name} ${r.profile.surname}` : '—').join(' · ')
    return (
      <div>
        <div className="flex items-center gap-2 py-1" style={{ fontFamily: 'var(--font-mono)' }}>
          <span style={medalStyle('1')}>=</span>
          <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{tied.length}-way tie at the top</span>
          <span className="text-sm font-bold" style={{ color: 'var(--tt-yellow)' }}>
            {rows[0].display ?? rows[0].value}{unit && <span className="ml-1 font-medium" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{unit}</span>}
          </span>
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{names}</div>
      </div>
    )
  }
  const top3 = rows.slice(0, 3)
  // Only surface the #1 row's note (streak flame etc) — showing all three
  // notes on the compact preview would eat too much vertical space, and
  // the expanded RankedList shows them all anyway. Streak was invisible
  // in the collapsed view before this — hence "the streak stat disappeared"
  // complaint even though it's been in the data all along.
  const topNote = top3[0]?.note
  return (
    <div className="flex flex-col gap-1">
      {top3.map((r, i) => {
        // Tie-rank by position: if same value as previous row, share rank.
        const rank = i === 0 ? 1 : (r.value === top3[i - 1].value ? rankOf(top3, i) : i + 1)
        const tier = rank === 1 ? '1' : rank === 2 ? '2' : '3'
        return (
          <div key={r.profile?.id ?? i} className="flex items-center gap-2 py-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
            <span style={medalStyle(tier)}>{rank}</span>
            <span className="flex-1 min-w-0 text-sm truncate" style={{ color: 'var(--color-text)', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontWeight: rank === 1 ? 700 : 500 }}>
              {r.profile ? `${r.profile.name} ${r.profile.surname}` : 'Unknown'}
            </span>
            <span className="text-sm font-bold" style={{ color: rank === 1 ? 'var(--tt-yellow)' : 'var(--tt-cyan)' }}>
              {r.display ?? r.value}
              {unit && <span className="ml-1 font-medium" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{unit}</span>}
            </span>
          </div>
        )
      })}
      {topNote && (
        <div className="pl-6 -mt-0.5" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
          {topNote}
        </div>
      )}
    </div>
  )
}

function rankOf(rows: PodiumRow[], i: number): number {
  let r = 1
  for (let j = 0; j < i; j++) if (rows[j].value !== rows[i].value) r = j + 2
  return r
}

function medalStyle(tier: '1' | '2' | '3'): React.CSSProperties {
  const bg = tier === '1' ? 'var(--tt-yellow)' : tier === '2' ? '#C8D2C2' : '#D69A4A'
  return {
    width: 18, height: 18, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 800, color: '#0F1710',
    background: bg, flexShrink: 0,
  }
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-4 mb-1.5 px-1" style={{ color: 'var(--tt-cyan)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em' }}>
      <span className="uppercase">{label}</span>
      <span className="flex-1" style={{ height: 1, background: 'var(--color-border)' }} />
    </div>
  )
}

function HeroCard({ tier, label, icon, player, value, unit }: {
  tier: 'gold' | 'silver' | 'bronze' | 'green'
  label: string
  icon: string
  player: string
  value: string
  unit: string
}) {
  const accent = tier === 'gold' ? 'var(--tt-yellow)'
    : tier === 'silver' ? 'var(--tt-cyan)'
    : tier === 'bronze' ? 'var(--tt-magenta)'
    : 'var(--tt-green)'
  const bgGrad = tier === 'gold'
    ? 'linear-gradient(160deg, rgba(255,212,0,0.08), var(--color-surface) 70%)'
    : tier === 'silver'
      ? 'linear-gradient(160deg, rgba(74,217,255,0.07), var(--color-surface) 70%)'
      : tier === 'bronze'
        ? 'linear-gradient(160deg, rgba(255,102,204,0.06), var(--color-surface) 70%)'
        : 'linear-gradient(160deg, rgba(74,220,122,0.08), var(--color-surface) 70%)'
  return (
    <div
      className="flex-shrink-0 rounded-2xl px-3 py-2.5"
      style={{ width: 195, background: bgGrad, border: `1px solid ${accent}55` }}
    >
      <div className="flex items-center gap-1" style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="truncate mt-0.5" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{player}</div>
      <div className="mt-0.5" style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, color: accent }}>
        {value}<span className="ml-1 font-medium" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{unit}</span>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 text-center text-sm" style={{ color: '#9CA897' }}>
      {text}
    </div>
  )
}

function RankedList({
  rows,
  unit,
}: {
  rows: { profile: ProfileLite | undefined; value: number; note?: string; display?: string }[]
  unit?: string
}) {
  let lastValue = Number.NaN
  let lastRank = 0
  return (
    <div className="pt-2 rounded-lg" style={{ border: '1px solid var(--color-border)', backgroundClip: 'padding-box' }}>
      {rows.map((r, i) => {
        const rank = r.value === lastValue ? lastRank : i + 1
        lastValue = r.value
        lastRank = rank
        const isTop = rank === 1
        return (
          <div
            key={r.profile?.id ?? i}
            className="flex items-center gap-3 px-3 py-2"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
              background: isTop ? 'var(--color-warning-bg)' : 'transparent',
            }}
          >
            <span
              style={{
                color: isTop ? 'var(--tt-yellow)' : 'var(--color-text-muted)',
                fontSize: 11,
                fontWeight: isTop ? 700 : 400,
                width: 22,
              }}
            >
              {String(rank).padStart(2, '0')}
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate" style={{ color: isTop ? 'var(--tt-yellow)' : 'var(--color-text)', fontWeight: isTop ? 700 : 400 }}>
                {r.profile ? `${r.profile.name} ${r.profile.surname}` : 'Unknown player'}
              </p>
              {r.note && <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{r.note}</p>}
            </div>
            <span
              style={{
                fontWeight: 700,
                color: isTop ? 'var(--tt-yellow)' : 'var(--tt-cyan)',
              }}
            >
              {r.display ?? r.value}
              {unit && <span className="ml-1 font-medium" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{unit}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface GoalRow {
  player_id: string
  goals_count: number
  own_goal: boolean
  match_date: string | null
}

interface FineRow {
  player_id: string
  type: FineType
  amount: number
  paid: boolean
  match_date: string | null
}

interface AwardRow {
  player_id: string
  is_admin_override: boolean
  match_date: string | null
}

interface AppRow {
  player_id: string
  match_id: string
  match_date: string | null
  team_id: string
}

interface FitnessStatRow {
  profile_id: string
  distance_m: number | string | null
  match_date: string | null
  recorded_start: string | null
}

interface FixtureRow {
  match_id: string
  team1_id: string
  team2_id: string
  score1: number | null
  score2: number | null
  shootout_winner: number | null
}

export default function StatsPage() {
  const { profile: currentProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({})
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [apps, setApps] = useState<AppRow[]>([])
  const [fines, setFines] = useState<FineRow[]>([])
  const [motm, setMotm] = useState<AwardRow[]>([])
  const [dotd, setDotd] = useState<AwardRow[]>([])
  const [fitness, setFitness] = useState<FitnessStatRow[]>([])
  // Used to compute who was on the winning team each match.
  const [fixtures, setFixtures] = useState<FixtureRow[]>([])

  // Single page-level period filter — replaces eight per-panel toggles so
  // the whole page reads as "this month" or "all time" coherently.
  const [globalMode, setGlobalMode] = useState<Mode>('all')
  // Position filter — applies to every leaderboard. Default 'all'. Players
  // with no position set are excluded when a specific position is selected
  // (incentive to pick one).
  const [posFilter, setPosFilter] = useState<PosFilter>('all')
  const [finesType, setFinesType] = useState<FineType | 'all'>('all')

  useEffect(() => {
    async function load() {
      const [ps, gl, fn, aw, ms, tm, tp, ft, fx] = await Promise.all([
        supabase.from('profiles').select('id, name, surname, photo_url, preferred_position_primary'),
        supabase.from('goals').select('player_id, goals_count, own_goal, match_id'),
        supabase.from('fines').select('player_id, type, amount, paid, match_date'),
        supabase.from('award_results').select('player_id, award_type, is_admin_override, match_id'),
        supabase.from('matches').select('id, match_date'),
        supabase.from('teams').select('id, match_id'),
        supabase.from('team_players').select('team_id, player_id'),
        supabase.from('fitness_sessions').select('profile_id, distance_m, match_date, recorded_start'),
        supabase.from('fixtures').select('match_id, team1_id, team2_id, score1, score2, shootout_winner'),
      ])
      const matchDate: Record<string, string | null> = {}
      for (const m of (ms.data as { id: string; match_date: string | null }[]) || []) matchDate[m.id] = m.match_date
      const teamMatch: Record<string, string> = {}
      for (const t of (tm.data as { id: string; match_id: string }[]) || []) teamMatch[t.id] = t.match_id

      const pMap: Record<string, ProfileLite> = {}
      for (const p of (ps.data as ProfileLite[]) || []) pMap[p.id] = p
      setProfiles(pMap)

      setGoals(((gl.data as { player_id: string; goals_count: number; own_goal: boolean; match_id: string }[]) || [])
        .map(g => ({ player_id: g.player_id, goals_count: g.goals_count, own_goal: g.own_goal, match_date: matchDate[g.match_id] ?? null })))

      setFines((fn.data as FineRow[]) || [])

      const awards = (aw.data as { player_id: string; award_type: string; is_admin_override: boolean; match_id: string }[]) || []
      const norm = (t: string): AwardRow[] =>
        awards.filter(a => a.award_type === t)
          .map(a => ({ player_id: a.player_id, is_admin_override: a.is_admin_override, match_date: matchDate[a.match_id] ?? null }))
      setMotm(norm('motm'))
      setDotd(norm('dotd'))

      setApps(((tp.data as { team_id: string; player_id: string }[]) || [])
        .map(r => ({
          player_id: r.player_id,
          match_id: teamMatch[r.team_id],
          match_date: matchDate[teamMatch[r.team_id]] ?? null,
          team_id: r.team_id,
        }))
        .filter(r => r.match_id))

      setFitness((ft.data as FitnessStatRow[]) || [])
      setFixtures((fx.data as FixtureRow[]) || [])

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  }

  const periodNote = (mode: Mode, noun: string) =>
    mode === 'month' ? `No ${noun} this month.` : `No ${noun} recorded yet.`

  // Tiebreak when totals are equal — alphabetical by first then surname so
  // a player order is stable across reloads.
  const byNameAsc = (a: ProfileLite | undefined, b: ProfileLite | undefined) =>
    `${a?.name ?? ''} ${a?.surname ?? ''}`.localeCompare(`${b?.name ?? ''} ${b?.surname ?? ''}`)

  // Filter leaderboard rows by the global position filter. Players with no
  // primary position set get excluded when a specific position is selected.
  function byPos<T extends { profile: ProfileLite | undefined }>(rows: T[]): T[] {
    if (posFilter === 'all') return rows
    return rows.filter(r => r.profile?.preferred_position_primary === posFilter)
  }
  const posLabel = posFilter === 'all'
    ? ''
    : PREFERRED_POSITIONS.find(p => p.value === posFilter)?.label ?? ''

  // Top scorers — sum goals_count (own goals excluded) for the period.
  const scorerAgg: Record<string, number> = {}
  for (const g of goals) {
    if (g.own_goal) continue
    if (!inMode(globalMode, g.match_date)) continue
    scorerAgg[g.player_id] = (scorerAgg[g.player_id] ?? 0) + g.goals_count
  }
  const scorerRows = Object.entries(scorerAgg)
    .map(([pid, v]) => ({ profile: profiles[pid], value: v }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value || byNameAsc(a.profile, b.profile))

  // Appearances — distinct matches a player was rostered for in the period.
  const appAgg: Record<string, Set<string>> = {}
  for (const a of apps) {
    if (!inMode(globalMode, a.match_date)) continue
    ;(appAgg[a.player_id] ??= new Set()).add(a.match_id)
  }
  const appsRows = Object.entries(appAgg)
    .map(([pid, set]) => ({ profile: profiles[pid], value: set.size }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value || byNameAsc(a.profile, b.profile))

  // Fines
  const fineAgg: Record<string, { paid: number; unpaid: number }> = {}
  for (const f of fines) {
    if (finesType !== 'all' && f.type !== finesType) continue
    if (!inMode(globalMode, f.match_date)) continue
    const a = (fineAgg[f.player_id] ??= { paid: 0, unpaid: 0 })
    if (f.paid) a.paid += Number(f.amount)
    else a.unpaid += Number(f.amount)
  }
  const fineRows = Object.entries(fineAgg)
    .map(([pid, v]) => ({ profile: profiles[pid], ...v, total: v.paid + v.unpaid }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total || byNameAsc(a.profile, b.profile))

  // Awards
  function awardRows(rows: AwardRow[], mode: Mode) {
    const agg: Record<string, { count: number; override: boolean }> = {}
    for (const r of rows) {
      if (!inMode(mode, r.match_date)) continue
      const a = (agg[r.player_id] ??= { count: 0, override: false })
      a.count += 1
      if (r.is_admin_override) a.override = true
    }
    return Object.entries(agg)
      .map(([pid, v]) => ({
        profile: profiles[pid],
        value: v.count,
        note: v.override ? 'incl. admin call' : undefined,
      }))
      .sort((a, b) => b.value - a.value || byNameAsc(a.profile, b.profile))
  }
  const motmRows = awardRows(motm, globalMode)
  const dotdRows = awardRows(dotd, globalMode)

  // Distance per game — average metres covered per tracked match, so a player
  // with many logged sessions isn't unfairly ahead of an occasional tracker.
  const distAgg: Record<string, { sum: number; games: number }> = {}
  for (const r of fitness) {
    const d = typeof r.distance_m === 'string' ? parseFloat(r.distance_m) : r.distance_m
    if (d == null || !Number.isFinite(d) || d <= 0) continue
    if (!inMode(globalMode, r.match_date ?? r.recorded_start)) continue
    const a = (distAgg[r.profile_id] ??= { sum: 0, games: 0 })
    a.sum += d
    a.games += 1
  }
  const distRows = Object.entries(distAgg)
    .map(([pid, v]) => {
      const avg = v.sum / v.games
      return {
        profile: profiles[pid],
        value: Math.round(avg),
        display: `${(avg / 1000).toFixed(2)} km`,
        note: `${v.games} game${v.games === 1 ? '' : 's'} tracked`,
      }
    })
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value || byNameAsc(a.profile, b.profile))

  // Total distance — same fitness rows, summed instead of averaged. Honest
  // volume metric ("who's covered the most ground") that complements the
  // Distance/Game per-match average.
  const totalDistAgg: Record<string, { sum: number; games: number }> = {}
  for (const r of fitness) {
    const d = typeof r.distance_m === 'string' ? parseFloat(r.distance_m) : r.distance_m
    if (d == null || !Number.isFinite(d) || d <= 0) continue
    if (!inMode(globalMode, r.match_date ?? r.recorded_start)) continue
    const a = (totalDistAgg[r.profile_id] ??= { sum: 0, games: 0 })
    a.sum += d
    a.games += 1
  }
  const totalDistRows = Object.entries(totalDistAgg)
    .map(([pid, v]) => ({
      profile: profiles[pid],
      value: Math.round(v.sum),
      display: `${(v.sum / 1000).toFixed(2)} km`,
      note: `${v.games} game${v.games === 1 ? '' : 's'} tracked`,
    }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value || byNameAsc(a.profile, b.profile))

  // ── Winning team (wins + current streak) ────────────────────────────────
  // Per match, derive the winning team from the fixtures: build a mini league
  // table (3-1-0 points, GD then GF tiebreak) and pick the top team. A pure
  // tie at the top (e.g. a 2-team 1-1 draw, or a deadlocked 4-team group)
  // resolves as "no winner" so neither side gets credit.
  const fixturesByMatch: Record<string, FixtureRow[]> = {}
  for (const f of fixtures) (fixturesByMatch[f.match_id] ??= []).push(f)

  const winnerByMatch: Record<string, string | null> = {}
  for (const [matchId, fxs] of Object.entries(fixturesByMatch)) {
    const stats = new Map<string, { pts: number; gd: number; gf: number }>()
    const bump = (id: string, gf: number, ga: number, pts: number) => {
      const r = stats.get(id) ?? { pts: 0, gd: 0, gf: 0 }
      r.pts += pts; r.gd += gf - ga; r.gf += gf
      stats.set(id, r)
    }
    for (const f of fxs) {
      if (f.score1 == null && f.score2 == null) continue
      const s1 = f.score1 ?? 0, s2 = f.score2 ?? 0
      if (s1 > s2) { bump(f.team1_id, s1, s2, 3); bump(f.team2_id, s2, s1, 0) }
      else if (s1 < s2) { bump(f.team1_id, s1, s2, 0); bump(f.team2_id, s2, s1, 3) }
      else {
        // Draw: 1 pt each, plus the penalty-shootout bonus point (migration 035),
        // so the shootout winner can edge the mini-table and be crowned champion.
        bump(f.team1_id, s1, s2, f.shootout_winner === 1 ? 2 : 1)
        bump(f.team2_id, s2, s1, f.shootout_winner === 2 ? 2 : 1)
      }
    }
    const sorted = [...stats.entries()].sort(([, a], [, b]) =>
      b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
    // Empty sorted = no scored fixtures — the match has fixtures generated
    // (usually because teams were just published for an upcoming Thursday)
    // but nobody's kicked a ball yet. Leaving winnerByMatch[matchId]
    // UNDEFINED (rather than null) is deliberate — streakFor treats
    // undefined as "match not played yet, skip" and null as "played but
    // tied at the top, break the streak". Bug this fixes: a player
    // rostered for the coming Thursday would see their current-week
    // streak snap to 0 the moment teams got published, because the
    // unscored 23-Jul match sorted DESC to the top of their apps and
    // was being read as a draw.
    if (sorted.length === 0) continue
    const [topId, top] = sorted[0]
    if (sorted.length >= 2) {
      const [, second] = sorted[1]
      // Tie at the top on all sort keys → no clean winner.
      if (second.pts === top.pts && second.gd === top.gd && second.gf === top.gf) {
        winnerByMatch[matchId] = null
        continue
      }
    }
    winnerByMatch[matchId] = topId
  }

  // Per-player win count for the period; streak is always all-time on
  // chronological history (missed matches skipped — only games you played in
  // count toward the streak; losing a match you played in breaks it).
  const winsAgg: Record<string, number> = {}
  for (const a of apps) {
    if (!inMode(globalMode, a.match_date)) continue
    if (winnerByMatch[a.match_id] === a.team_id) {
      winsAgg[a.player_id] = (winsAgg[a.player_id] ?? 0) + 1
    }
  }

  // Build chronological-desc app history per player to derive current streak.
  const appsByPlayer: Record<string, AppRow[]> = {}
  for (const a of apps) (appsByPlayer[a.player_id] ??= []).push(a)
  for (const list of Object.values(appsByPlayer)) {
    list.sort((x, y) => (y.match_date ?? '').localeCompare(x.match_date ?? ''))
  }
  function streakFor(playerId: string): number {
    let n = 0
    for (const a of appsByPlayer[playerId] ?? []) {
      const winner = winnerByMatch[a.match_id]
      if (winner === undefined) continue            // match has no fixtures yet
      if (winner === null) return n                  // played a draw / tie → break
      if (winner === a.team_id) n++                 // played and won → extend
      else return n                                  // played and lost → break
    }
    return n
  }

  const winsRows = Object.entries(winsAgg)
    .map(([pid, v]) => {
      const s = streakFor(pid)
      return {
        profile: profiles[pid],
        value: v,
        note: s > 1 ? `🔥 ${s} in a row` : s === 1 ? 'On a streak of 1' : 'Last result wasn\'t a win',
      }
    })
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value || byNameAsc(a.profile, b.profile))

  // ── The Wall (goals conceded by your team on the night) ─────────────────
  // For each completed match (every fixture has both scores), sum each team's
  // total GA across the round-robin. A player's "GA night" is their team's
  // total — lower is better. Min nights filter stops a one-off appearance
  // gaming the leaderboard.
  const gaByTeamMatch: Record<string, Record<string, number>> = {}
  for (const [matchId, fxs] of Object.entries(fixturesByMatch)) {
    if (!fxs.every(f => f.score1 != null && f.score2 != null)) continue
    const teamGa: Record<string, number> = {}
    for (const f of fxs) {
      teamGa[f.team1_id] = (teamGa[f.team1_id] ?? 0) + (f.score2 ?? 0)
      teamGa[f.team2_id] = (teamGa[f.team2_id] ?? 0) + (f.score1 ?? 0)
    }
    gaByTeamMatch[matchId] = teamGa
  }

  const wallAgg: Record<string, { ga: number; nights: number; cs: number; best: number }> = {}
  for (const a of apps) {
    if (!inMode(globalMode, a.match_date)) continue
    const teamGa = gaByTeamMatch[a.match_id]?.[a.team_id]
    if (teamGa == null) continue
    const r = (wallAgg[a.player_id] ??= { ga: 0, nights: 0, cs: 0, best: Number.POSITIVE_INFINITY })
    r.ga += teamGa
    r.nights += 1
    if (teamGa === 0) r.cs += 1
    if (teamGa < r.best) r.best = teamGa
  }

  const wallMinNights = globalMode === 'month' ? 2 : 3
  const wallRows = Object.entries(wallAgg)
    .filter(([, v]) => v.nights >= wallMinNights)
    .map(([pid, v]) => {
      const avg = v.ga / v.nights
      return {
        profile: profiles[pid],
        // *100 so equal averages tie-rank as a single int comparison.
        value: Math.round(avg * 100),
        display: avg.toFixed(2),
        note: `${v.nights} nights · ${v.cs} clean sheet${v.cs === 1 ? '' : 's'} · best ${v.best}`,
      }
    })
    .sort((a, b) => a.value - b.value || byNameAsc(a.profile, b.profile))

  // Hero stats for the signed-in user (only shown when they qualify under
  // the current period filter).
  const wallSelf = currentProfile ? wallAgg[currentProfile.id] : null
  const wallSelfAvg = wallSelf && wallSelf.nights > 0 ? wallSelf.ga / wallSelf.nights : null

  // Hero strip — headline awards. Filtered by both the period toggle (via the
  // *Rows) and the position chip (via byPos), so the three cards stay in sync
  // with whatever the player has selected.
  const heroTopScorer = byPos(scorerRows)[0]
  const heroWall = byPos(wallRows)[0]
  const heroWins = byPos(winsRows)[0]

  // 4th hero — Top GK by clean sheets (avg GA as tiebreak). Specialists who'd
  // otherwise never show on a goals/MOTM leaderboard get celebrated here.
  // Only shown when posFilter === 'all' (when filter is GK, the standard
  // three cards above already filter to GKs).
  const gkRows = Object.entries(wallAgg)
    .filter(([pid]) => profiles[pid]?.preferred_position_primary === 'GK')
    .map(([pid, v]) => ({
      profile: profiles[pid],
      cs: v.cs,
      avg: v.nights > 0 ? v.ga / v.nights : Number.POSITIVE_INFINITY,
      nights: v.nights,
    }))
    .filter(r => r.nights >= 1 && r.profile)
    .sort((a, b) => b.cs - a.cs || a.avg - b.avg)
  const heroGk = gkRows[0]

  // Fines podium needs a {value, display} shape since fineRows tracks paid/unpaid.
  const finePodiumRows: PodiumRow[] = fineRows.map(r => ({
    profile: r.profile,
    value: r.total,
    display: `£${r.total.toFixed(2)}`,
  }))

  const meInitials = currentProfile ? `${currentProfile.name?.[0] ?? ''}${currentProfile.surname?.[0] ?? ''}`.toUpperCase() : ''

  // Apply the position filter once for each leaderboard so render is clean.
  // When posFilter === 'all', byPos is a no-op.
  const scorerRowsF = byPos(scorerRows)
  const motmRowsF = byPos(motmRows)
  const dotdRowsF = byPos(dotdRows)
  const winsRowsF = byPos(winsRows)
  const wallRowsF = byPos(wallRows)
  const appsRowsF = byPos(appsRows)
  const distRowsF = byPos(distRows)
  const totalDistRowsF = byPos(totalDistRows)
  const fineRowsF = byPos(fineRows)
  const finePodiumRowsF = byPos(finePodiumRows)

  return (
    <div className="px-4 py-5">
      <CeefaxHeader pageId="P501 · LEAGUE STATS" title="STATS" meta="SEASON 25/26" />

      {/* My Stats pill + global period toggle. Replaces the eight per-panel
          toggles — whole page reads as one period coherently. */}
      <div className="flex items-center gap-2 mt-3 mb-3">
        {currentProfile && (
          <Link
            to="/profile"
            className="flex-1 flex items-center gap-2 rounded-full px-3 py-2"
            style={{
              background: 'rgba(74, 217, 122, 0.1)',
              border: '1px solid var(--color-primary)',
              color: 'var(--color-primary)',
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            <span
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: 'linear-gradient(135deg, #4ADC7A, #166534)',
                color: '#fff', fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {meInitials || '–'}
            </span>
            <span>My Stats</span>
            <span className="ml-auto" style={{ fontSize: 14 }}>›</span>
          </Link>
        )}
        <PeriodToggle mode={globalMode} setMode={setGlobalMode} />
      </div>

      {/* Position filter — chip strip below the period toggle. Affects every
          leaderboard on the page, hero strip included. */}
      <div className="mb-3">
        <PositionFilter value={posFilter} setValue={setPosFilter} />
      </div>

      {/* Hero strip — headline awards. Horizontally scrollable so more can
          slot in later. */}
      <div className="flex gap-2 overflow-x-auto mb-3 -mx-4 px-4 pb-1">
        {heroTopScorer?.profile && (
          <HeroCard
            tier="gold"
            label={posLabel ? `Top Scorer · ${posLabel}` : 'Top Scorer'}
            icon="⚽"
            player={`${heroTopScorer.profile.name} ${heroTopScorer.profile.surname}`}
            value={String(heroTopScorer.value)}
            unit="goals"
          />
        )}
        {heroWall?.profile && (
          <HeroCard
            tier="silver"
            label={posLabel ? `Wall King · ${posLabel}` : 'Wall King'}
            icon="🧱"
            player={`${heroWall.profile.name} ${heroWall.profile.surname}`}
            value={String(heroWall.display ?? heroWall.value)}
            unit="GA/night"
          />
        )}
        {heroWins?.profile && (
          <HeroCard
            tier="bronze"
            label={posLabel ? `Most Wins · ${posLabel}` : 'Most Wins'}
            icon="🥇"
            player={`${heroWins.profile.name} ${heroWins.profile.surname}`}
            value={String(heroWins.value)}
            unit="wins"
          />
        )}
        {posFilter === 'all' && heroGk?.profile && (
          <HeroCard
            tier="green"
            label="Top GK"
            icon="🧤"
            player={`${heroGk.profile.name} ${heroGk.profile.surname}`}
            value={String(heroGk.cs)}
            unit={heroGk.cs === 1 ? 'clean sheet' : 'clean sheets'}
          />
        )}
      </div>

      {/* ATTACK ----------------------------------------------------------- */}
      <SectionHeader label="Attack" />
      <Panel
        title="Top Scorers"
        icon="⚽"
        defaultOpen
        preview={<PodiumPreview rows={scorerRowsF} unit="goals" emptyText={periodNote(globalMode, 'goals')} />}
      >
        {scorerRowsF.length === 0
          ? <EmptyState text={periodNote(globalMode, 'goals')} />
          : <RankedList rows={scorerRowsF} unit="goals" />}
      </Panel>

      {/* AWARDS ----------------------------------------------------------- */}
      <SectionHeader label="Awards" />
      <Panel
        title="Man of the Match"
        icon="🏆"
        preview={<PodiumPreview rows={motmRowsF} unit="awards" emptyText="No MOTM awards yet — voting kicks off next match." />}
      >
        {motmRowsF.length === 0
          ? <EmptyState text={globalMode === 'month' ? 'No awards this month.' : 'No awards yet — voting starts next match.'} />
          : <RankedList rows={motmRowsF} unit="awards" />}
      </Panel>
      <Panel
        title="Winning Team"
        icon="🥇"
        preview={<PodiumPreview rows={winsRowsF} unit="wins" emptyText="No wins recorded yet." />}
      >
        {winsRowsF.length === 0
          ? <EmptyState text={globalMode === 'month' ? 'No wins this month.' : 'No winning-team data yet — needs completed matches with scores.'} />
          : <RankedList rows={winsRowsF} unit="wins" />}
      </Panel>

      {/* DEFENCE ---------------------------------------------------------- */}
      <SectionHeader label="Defence" />
      <Panel
        title="The Wall · Goals Conceded"
        icon="🧱"
        preview={<PodiumPreview rows={wallRowsF} emptyText="Need more completed matches to qualify." />}
      >
        {wallSelfAvg != null && wallSelf && (
          <div className="flex gap-2.5 pt-3">
            <div
              className="flex-1 rounded-xl px-3 py-2.5"
              style={{ background: 'rgba(74, 217, 255, 0.06)', border: '1px solid var(--color-border)' }}
            >
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your Avg GA
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--tt-green)', marginTop: 2 }}>
                {wallSelfAvg.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                per night · {wallSelf.nights} played
              </div>
            </div>
            <div
              className="flex-1 rounded-xl px-3 py-2.5"
              style={{ background: 'rgba(74, 217, 255, 0.06)', border: '1px solid var(--color-border)' }}
            >
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Clean Sheets
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--tt-yellow)', marginTop: 2 }}>
                {wallSelf.cs}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                nights with 0 conceded
              </div>
            </div>
          </div>
        )}
        {wallRowsF.length === 0
          ? <EmptyState text={globalMode === 'month' ? 'Not enough completed matches this month yet.' : 'No defensive data yet — needs completed matches with scores.'} />
          : <RankedList rows={wallRowsF} unit="GA/night" />}
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 10, padding: '0 2px' }}>
          Goals shipped by your team across the night's fixtures. Minimum {wallMinNights} nights played to qualify.
        </div>
      </Panel>

      {/* PARTICIPATION --------------------------------------------------- */}
      <SectionHeader label="Participation" />
      <Panel
        title="Appearances"
        icon="📋"
        preview={<PodiumPreview rows={appsRowsF} unit="apps" emptyText="No appearance data yet." />}
      >
        {appsRowsF.length === 0
          ? <EmptyState text="No appearance data yet — tracked from upcoming matches onward." />
          : <RankedList rows={appsRowsF} unit="apps" />}
      </Panel>
      <Panel
        title="Distance / Game"
        icon="🏃"
        preview={<PodiumPreview rows={distRowsF} emptyText="First to log a session sets the bar." />}
      >
        {distRowsF.length === 0
          ? <EmptyState text={globalMode === 'month' ? 'No tracked sessions this month.' : 'No fitness sessions tracked yet — add match fitness from your player card.'} />
          : <RankedList rows={distRowsF} unit="km" />}
      </Panel>
      <Panel
        title="Total Distance"
        icon="🗺️"
        preview={<PodiumPreview rows={totalDistRowsF} emptyText="No fitness sessions tracked yet." />}
      >
        {totalDistRowsF.length === 0
          ? <EmptyState text={globalMode === 'month' ? 'No tracked sessions this month.' : 'No fitness sessions tracked yet — add match fitness from your player card.'} />
          : <RankedList rows={totalDistRowsF} unit="km" />}
      </Panel>

      {/* SHAME ------------------------------------------------------------ */}
      <SectionHeader label="Shame" />
      <Panel
        title="Dick of the Day"
        icon="🤡"
        preview={<PodiumPreview rows={dotdRowsF} unit="awards" emptyText="No DOTDs yet — vote opens next match." />}
      >
        {dotdRowsF.length === 0
          ? <EmptyState text={globalMode === 'month' ? 'No awards this month.' : 'No awards yet — voting starts next match.'} />
          : <RankedList rows={dotdRowsF} unit="awards" />}
      </Panel>
      <Panel
        title="Fines"
        icon="💷"
        preview={<PodiumPreview rows={finePodiumRowsF} emptyText={periodNote(globalMode, 'fines')} />}
      >
        <div className="flex items-center justify-between pt-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1 -ml-0.5">
            {(['all', ...FINE_TYPES.map(f => f.value)] as (FineType | 'all')[]).map(t => {
              const label = t === 'all' ? 'All' : FINE_TYPES.find(f => f.value === t)?.label ?? t
              return (
                <button
                  key={t}
                  onClick={() => setFinesType(t)}
                  className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium"
                  style={{
                    background: finesType === t ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: finesType === t ? '#FFFFFF' : 'var(--color-text-muted)',
                    border: `1px solid ${finesType === t ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        {fineRowsF.length === 0 ? (
          <EmptyState text={periodNote(globalMode, 'fines')} />
        ) : (
          <div className="pt-3 space-y-1.5">
            {fineRowsF.map((r, i) => (
              <div key={r.profile?.id ?? i} className="flex items-center gap-3 py-1.5">
                {r.profile ? <PlayerAvatar profile={r.profile} size={32} /> : <div style={{ width: 32 }} />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">
                    {r.profile ? `${r.profile.name} ${r.profile.surname}` : 'Unknown player'}
                  </p>
                  <p className="text-[11px]" style={{ color: '#9CA897' }}>
                    <span style={{ color: r.unpaid > 0 ? 'var(--color-error-text)' : '#9CA897' }}>
                      £{r.unpaid.toFixed(2)} unpaid
                    </span>
                    {' · '}£{r.paid.toFixed(2)} paid
                  </p>
                </div>
                <span className="font-display text-lg text-[var(--color-text)] flex-shrink-0">£{r.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
