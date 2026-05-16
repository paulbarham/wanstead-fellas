import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PlayerAvatar from '../components/PlayerAvatar'
import { FINE_TYPES } from '../types'
import type { Profile, FineType } from '../types'

type Mode = 'all' | 'season'
type ProfileLite = Pick<Profile, 'id' | 'name' | 'surname' | 'photo_url'>

const LABEL_CLASS = 'text-[10px] font-semibold uppercase'
const LABEL_STYLE = { color: 'var(--color-text-muted)', letterSpacing: '0.8px' } as const

function SeasonToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
      {(['season', 'all'] as Mode[]).map(m => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className="px-3 py-1.5 text-xs font-semibold transition-colors"
          style={{
            background: mode === m ? 'var(--color-primary)' : 'var(--color-surface)',
            color: mode === m ? '#FFFFFF' : 'var(--color-text-muted)',
          }}
        >
          {m === 'season' ? 'This Season' : 'All Time'}
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
  unit,
}: {
  rows: { profile: ProfileLite | undefined; value: number; note?: string }[]
  unit: string
}) {
  let lastValue = Number.NaN
  let lastRank = 0
  return (
    <div className="pt-3 space-y-1.5">
      {rows.map((r, i) => {
        const rank = r.value === lastValue ? lastRank : i + 1
        lastValue = r.value
        lastRank = rank
        return (
          <div key={r.profile?.id ?? i} className="flex items-center gap-3 py-1.5">
            <span
              className="font-display text-sm w-6 text-center flex-shrink-0"
              style={{ color: rank <= 3 ? 'var(--color-primary)' : '#9CA897' }}
            >
              {rank}
            </span>
            {r.profile ? <PlayerAvatar profile={r.profile} size={32} /> : <div style={{ width: 32 }} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text)] truncate">
                {r.profile ? `${r.profile.name} ${r.profile.surname}` : 'Unknown player'}
              </p>
              {r.note && <p className="text-[11px]" style={{ color: '#9CA897' }}>{r.note}</p>}
            </div>
            <span className="font-display text-lg text-[var(--color-text)] flex-shrink-0">{r.value}</span>
            <span className="text-[10px] uppercase flex-shrink-0" style={{ color: '#9CA897', letterSpacing: '0.5px' }}>{unit}</span>
          </div>
        )
      })}
    </div>
  )
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

export default function StatsPage() {
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({})
  const [scorers, setScorers] = useState<{ player_id: string; total_goals: number; goals_this_season: number | null }[]>([])
  const [appearances, setAppearances] = useState<{ player_id: string; appearances: number; appearances_this_season: number | null }[]>([])
  const [fines, setFines] = useState<FineRow[]>([])
  const [motm, setMotm] = useState<AwardRow[]>([])
  const [dotd, setDotd] = useState<AwardRow[]>([])

  const [scorerMode, setScorerMode] = useState<Mode>('season')
  const [appsMode, setAppsMode] = useState<Mode>('season')
  const [finesMode, setFinesMode] = useState<Mode>('season')
  const [finesType, setFinesType] = useState<FineType | 'all'>('all')
  const [motmMode, setMotmMode] = useState<Mode>('season')
  const [dotdMode, setDotdMode] = useState<Mode>('season')

  useEffect(() => {
    async function load() {
      const [ps, ts, ap, fn, aw, ms] = await Promise.all([
        supabase.from('profiles').select('id, name, surname, photo_url'),
        supabase.from('top_scorers').select('player_id, total_goals, goals_this_season'),
        supabase.from('appearances').select('player_id, appearances, appearances_this_season'),
        supabase.from('fines').select('player_id, type, amount, paid, match_date'),
        supabase.from('award_results').select('player_id, award_type, is_admin_override, match_id'),
        supabase.from('matches').select('id, match_date'),
      ])
      const matchDate: Record<string, string | null> = {}
      for (const m of (ms.data as { id: string; match_date: string | null }[]) || []) matchDate[m.id] = m.match_date
      const pMap: Record<string, ProfileLite> = {}
      for (const p of (ps.data as ProfileLite[]) || []) pMap[p.id] = p
      setProfiles(pMap)
      setScorers((ts.data as typeof scorers) || [])
      setAppearances((ap.data as typeof appearances) || [])
      setFines((fn.data as FineRow[]) || [])
      const awards = (aw.data as { player_id: string; award_type: string; is_admin_override: boolean; match_id: string }[]) || []
      const norm = (t: string): AwardRow[] =>
        awards
          .filter(a => a.award_type === t)
          .map(a => ({ player_id: a.player_id, is_admin_override: a.is_admin_override, match_date: matchDate[a.match_id] ?? null }))
      setMotm(norm('motm'))
      setDotd(norm('dotd'))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="px-4 py-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  }

  // NOTE: "This Season" currently mirrors "All Time" — season filtering is
  // intentionally a no-op until a season boundary is defined. The toggle is
  // kept so real season splits can be switched back on later.

  // Top scorers
  const scorerRows = scorers
    .map(s => ({
      profile: profiles[s.player_id],
      value: s.total_goals,
    }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value)

  // Appearances
  const appsRows = appearances
    .map(a => ({
      profile: profiles[a.player_id],
      value: a.appearances,
    }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value)

  // Fines
  const finesFiltered = fines.filter(f => {
    if (finesType !== 'all' && f.type !== finesType) return false
    return true
  })
  const fineAgg: Record<string, { paid: number; unpaid: number }> = {}
  for (const f of finesFiltered) {
    const a = (fineAgg[f.player_id] ??= { paid: 0, unpaid: 0 })
    if (f.paid) a.paid += Number(f.amount)
    else a.unpaid += Number(f.amount)
  }
  const fineRows = Object.entries(fineAgg)
    .map(([pid, v]) => ({ profile: profiles[pid], ...v, total: v.paid + v.unpaid }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total)

  // Awards
  function awardRows(rows: AwardRow[]) {
    const agg: Record<string, { count: number; override: boolean }> = {}
    for (const r of rows) {
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
  const motmRows = awardRows(motm)
  const dotdRows = awardRows(dotd)

  return (
    <div className="px-4 py-5">
      <p className={LABEL_CLASS + ' mb-1'} style={LABEL_STYLE}>Stats</p>
      <h1 className="font-display text-[var(--color-text)] tracking-wide mb-5" style={{ fontSize: '28px' }}>STATS</h1>

      {/* Top Scorers */}
      <Panel title="Top Scorers" icon="⚽" defaultOpen>
        <div className="flex justify-end pt-3 -mb-1">
          <SeasonToggle mode={scorerMode} setMode={setScorerMode} />
        </div>
        {scorerRows.length === 0 ? (
          <EmptyState text="No goals recorded yet." />
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
          <SeasonToggle mode={finesMode} setMode={setFinesMode} />
        </div>
        {fineRows.length === 0 ? (
          <EmptyState text="No fines recorded for this period." />
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
          <SeasonToggle mode={motmMode} setMode={setMotmMode} />
        </div>
        {motmRows.length === 0 ? (
          <EmptyState text="No awards yet — voting starts next match." />
        ) : (
          <RankedList rows={motmRows} unit="awards" />
        )}
      </Panel>

      {/* DOTD */}
      <Panel title="Dick of the Day" icon="🤡">
        <div className="flex justify-end pt-3 -mb-1">
          <SeasonToggle mode={dotdMode} setMode={setDotdMode} />
        </div>
        {dotdRows.length === 0 ? (
          <EmptyState text="No awards yet — voting starts next match." />
        ) : (
          <RankedList rows={dotdRows} unit="awards" />
        )}
      </Panel>

      {/* Appearances */}
      <Panel title="Appearances" icon="📋">
        <div className="flex justify-end pt-3 -mb-1">
          <SeasonToggle mode={appsMode} setMode={setAppsMode} />
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
