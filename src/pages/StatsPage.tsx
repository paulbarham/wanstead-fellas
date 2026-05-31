import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PlayerAvatar from '../components/PlayerAvatar'
import CeefaxHeader from '../components/CeefaxHeader'
import { FINE_TYPES } from '../types'
import type { Profile, FineType } from '../types'

type Mode = 'all' | 'month'
type ProfileLite = Pick<Profile, 'id' | 'name' | 'surname' | 'photo_url'>

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

function Panel({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-base leading-none">{icon}</span>
          <span className="font-semibold text-sm text-[var(--color-text)]">{title}</span>
        </span>
        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--color-border)' }}>{children}</div>}
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
}: {
  rows: { profile: ProfileLite | undefined; value: number; note?: string }[]
  unit?: string
}) {
  let lastValue = Number.NaN
  let lastRank = 0
  return (
    <div className="pt-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
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
              {r.value}
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
}

export default function StatsPage() {
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({})
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [apps, setApps] = useState<AppRow[]>([])
  const [fines, setFines] = useState<FineRow[]>([])
  const [motm, setMotm] = useState<AwardRow[]>([])
  const [dotd, setDotd] = useState<AwardRow[]>([])

  const [scorerMode, setScorerMode] = useState<Mode>('month')
  const [appsMode, setAppsMode] = useState<Mode>('month')
  const [finesMode, setFinesMode] = useState<Mode>('month')
  const [finesType, setFinesType] = useState<FineType | 'all'>('all')
  const [motmMode, setMotmMode] = useState<Mode>('month')
  const [dotdMode, setDotdMode] = useState<Mode>('month')

  useEffect(() => {
    async function load() {
      const [ps, gl, fn, aw, ms, tm, tp] = await Promise.all([
        supabase.from('profiles').select('id, name, surname, photo_url'),
        supabase.from('goals').select('player_id, goals_count, own_goal, match_id'),
        supabase.from('fines').select('player_id, type, amount, paid, match_date'),
        supabase.from('award_results').select('player_id, award_type, is_admin_override, match_id'),
        supabase.from('matches').select('id, match_date'),
        supabase.from('teams').select('id, match_id'),
        supabase.from('team_players').select('team_id, player_id'),
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
        .map(r => ({ player_id: r.player_id, match_id: teamMatch[r.team_id], match_date: matchDate[teamMatch[r.team_id]] ?? null }))
        .filter(r => r.match_id))

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  }

  const periodNote = (mode: Mode, noun: string) =>
    mode === 'month' ? `No ${noun} this month.` : `No ${noun} recorded yet.`

  // Top scorers — sum goals_count (own goals excluded) for the period.
  const scorerAgg: Record<string, number> = {}
  for (const g of goals) {
    if (g.own_goal) continue
    if (!inMode(scorerMode, g.match_date)) continue
    scorerAgg[g.player_id] = (scorerAgg[g.player_id] ?? 0) + g.goals_count
  }
  const scorerRows = Object.entries(scorerAgg)
    .map(([pid, v]) => ({ profile: profiles[pid], value: v }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value)

  // Appearances — distinct matches a player was rostered for in the period.
  const appAgg: Record<string, Set<string>> = {}
  for (const a of apps) {
    if (!inMode(appsMode, a.match_date)) continue
    ;(appAgg[a.player_id] ??= new Set()).add(a.match_id)
  }
  const appsRows = Object.entries(appAgg)
    .map(([pid, set]) => ({ profile: profiles[pid], value: set.size }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value)

  // Fines
  const fineAgg: Record<string, { paid: number; unpaid: number }> = {}
  for (const f of fines) {
    if (finesType !== 'all' && f.type !== finesType) continue
    if (!inMode(finesMode, f.match_date)) continue
    const a = (fineAgg[f.player_id] ??= { paid: 0, unpaid: 0 })
    if (f.paid) a.paid += Number(f.amount)
    else a.unpaid += Number(f.amount)
  }
  const fineRows = Object.entries(fineAgg)
    .map(([pid, v]) => ({ profile: profiles[pid], ...v, total: v.paid + v.unpaid }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total)

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
      .sort((a, b) => b.value - a.value)
  }
  const motmRows = awardRows(motm, motmMode)
  const dotdRows = awardRows(dotd, dotdMode)

  return (
    <div className="px-4 py-5">
      <CeefaxHeader pageId="P501 · LEAGUE STATS" title="STATS" meta="SEASON 25/26" />

      {/* Top Scorers */}
      <Panel title="Top Scorers" icon="⚽" defaultOpen>
        <div className="flex justify-end pt-3 -mb-1">
          <PeriodToggle mode={scorerMode} setMode={setScorerMode} />
        </div>
        {scorerRows.length === 0 ? (
          <EmptyState text={periodNote(scorerMode, 'goals')} />
        ) : (
          <RankedList rows={scorerRows} unit="goals" />
        )}
      </Panel>

      {/* Fines */}
      <Panel title="Fines" icon="💷">
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
          <PeriodToggle mode={finesMode} setMode={setFinesMode} />
        </div>
        {fineRows.length === 0 ? (
          <EmptyState text={periodNote(finesMode, 'fines')} />
        ) : (
          <div className="pt-3 space-y-1.5">
            {fineRows.map((r, i) => (
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

      {/* MOTM */}
      <Panel title="Man of the Match" icon="🏆">
        <div className="flex justify-end pt-3 -mb-1">
          <PeriodToggle mode={motmMode} setMode={setMotmMode} />
        </div>
        {motmRows.length === 0 ? (
          <EmptyState text={motmMode === 'month' ? 'No awards this month.' : 'No awards yet — voting starts next match.'} />
        ) : (
          <RankedList rows={motmRows} unit="awards" />
        )}
      </Panel>

      {/* DOTD */}
      <Panel title="Dick of the Day" icon="🤡">
        <div className="flex justify-end pt-3 -mb-1">
          <PeriodToggle mode={dotdMode} setMode={setDotdMode} />
        </div>
        {dotdRows.length === 0 ? (
          <EmptyState text={dotdMode === 'month' ? 'No awards this month.' : 'No awards yet — voting starts next match.'} />
        ) : (
          <RankedList rows={dotdRows} unit="awards" />
        )}
      </Panel>

      {/* Appearances */}
      <Panel title="Appearances" icon="📋">
        <div className="flex justify-end pt-3 -mb-1">
          <PeriodToggle mode={appsMode} setMode={setAppsMode} />
        </div>
        {appsRows.length === 0 ? (
          <EmptyState text="No appearance data yet — tracked from upcoming matches onward." />
        ) : (
          <RankedList rows={appsRows} unit="apps" />
        )}
      </Panel>
    </div>
  )
}
