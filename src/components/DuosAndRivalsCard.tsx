import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import PlayerAvatar from './PlayerAvatar'
import type { Profile } from '../types'

// Head-to-head stats card for the Profile page — top duos + top rivals.
// Backed by v_player_pair_stats + player_pair_stats_for() RPC (mig 084).
//
// Season-scoped by default (Apr → Mar) with an All-Time toggle.
// Min-fixtures floor stops one-off noise; 5 for season, 10 for all-time.

interface PairRow {
  partner_id: string
  same_team: boolean
  season_start_year: number
  fixtures_played: number
  matches_played: number
  wins: number
  draws: number
  losses: number
}

interface AggregatedPair {
  partner_id: string
  same_team: boolean
  fixtures: number
  matches: number
  wins: number
  draws: number
  losses: number
  winRate: number
}

const MIN_FIXTURES_SEASON = 5
const MIN_FIXTURES_ALLTIME = 10

function currentSeasonStartYear(now: Date = new Date()): number {
  const y = now.getFullYear()
  return now.getMonth() >= 3 ? y : y - 1
}

function seasonLabel(startYear: number): string {
  const endShort = String((startYear + 1) % 100).padStart(2, '0')
  return `${startYear}-${endShort}`
}

export default function DuosAndRivalsCard({ playerId }: { playerId: string }) {
  const [rows, setRows] = useState<PairRow[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({})
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'season' | 'alltime'>('season')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('player_pair_stats_for', {
      p_player_id: playerId,
      p_season_start_year: null, // fetch all seasons; filter in memory
    })
    if (error) {
      console.error('rivalry stats', error)
      setRows([])
      setLoading(false)
      return
    }
    const list = (data ?? []) as PairRow[]
    setRows(list)

    // Fetch partner profiles in one batch.
    const partnerIds = Array.from(new Set(list.map(r => r.partner_id)))
    if (partnerIds.length > 0) {
      const { data: profs } = await supabase.from('profiles')
        .select('id, name, surname, photo_url, favourite_club')
        .in('id', partnerIds)
      const map: Record<string, Profile> = {}
      for (const p of (profs ?? []) as Profile[]) map[p.id] = p
      setProfilesById(map)
    }
    setLoading(false)
  }, [playerId])

  useEffect(() => { load() }, [load])

  const currentSeason = currentSeasonStartYear()

  // Aggregate: for season-scope filter to current season; for alltime sum across seasons.
  const aggregated = useMemo<AggregatedPair[]>(() => {
    const key = (r: PairRow) => `${r.partner_id}|${r.same_team ? '1' : '0'}`
    const acc = new Map<string, AggregatedPair>()
    for (const r of rows) {
      if (scope === 'season' && r.season_start_year !== currentSeason) continue
      const k = key(r)
      const cur = acc.get(k) ?? {
        partner_id: r.partner_id,
        same_team: r.same_team,
        fixtures: 0, matches: 0, wins: 0, draws: 0, losses: 0, winRate: 0,
      }
      cur.fixtures += r.fixtures_played
      cur.matches  += r.matches_played
      cur.wins     += r.wins
      cur.draws    += r.draws
      cur.losses   += r.losses
      acc.set(k, cur)
    }
    for (const v of acc.values()) v.winRate = v.fixtures > 0 ? v.wins / v.fixtures : 0
    return Array.from(acc.values())
  }, [rows, scope, currentSeason])

  const minFixtures = scope === 'season' ? MIN_FIXTURES_SEASON : MIN_FIXTURES_ALLTIME

  const topDuos = useMemo(() =>
    aggregated
      .filter(a => a.same_team && a.fixtures >= minFixtures)
      .sort((a, b) => b.winRate - a.winRate || b.fixtures - a.fixtures)
      .slice(0, 3)
  , [aggregated, minFixtures])

  const topRivals = useMemo(() =>
    aggregated
      .filter(a => !a.same_team && a.fixtures >= minFixtures)
      .sort((a, b) => b.fixtures - a.fixtures || (b.wins + b.losses) - (a.wins + a.losses))
      .slice(0, 3)
  , [aggregated, minFixtures])

  // Only render the card at all when there's SOMETHING to show — new
  // players get no card until they've played enough games.
  if (loading) return null
  if (topDuos.length === 0 && topRivals.length === 0) return null

  return (
    <div className="mb-6 rounded-2xl"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        backgroundClip: 'padding-box',
      }}>
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div>
          <p className="text-xs uppercase tracking-widest font-semibold"
            style={{ color: 'var(--tt-cyan, var(--color-primary))' }}>
            🤝 Duos &amp; rivals
          </p>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {scope === 'season' ? `Season ${seasonLabel(currentSeason)} · min ${MIN_FIXTURES_SEASON} fixtures` : `All time · min ${MIN_FIXTURES_ALLTIME} fixtures`}
          </p>
        </div>
        <div className="flex gap-1">
          {(['season', 'alltime'] as const).map(s => (
            <button key={s} onClick={() => setScope(s)}
              className="text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wider transition-colors"
              style={{
                background: scope === s ? 'var(--color-primary)' : 'transparent',
                color: scope === s ? 'var(--color-surface)' : 'var(--color-text-muted)',
                border: `1px solid ${scope === s ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}>
              {s === 'season' ? 'Season' : 'All time'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 space-y-4">
        <PairList
          title="🤝 Top duos"
          subtitle="Best win rate on your team"
          list={topDuos}
          profilesById={profilesById}
          metric="winrate"
        />
        <PairList
          title="⚔️ Biggest rivals"
          subtitle="Faced most on the opposition"
          list={topRivals}
          profilesById={profilesById}
          metric="record"
        />
      </div>
    </div>
  )
}

function PairList({ title, subtitle, list, profilesById, metric }: {
  title: string
  subtitle: string
  list: AggregatedPair[]
  profilesById: Record<string, Profile>
  metric: 'winrate' | 'record'
}) {
  if (list.length === 0) {
    return (
      <div>
        <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>{title}</p>
        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>
        <p className="text-[11px] mt-1 italic" style={{ color: 'var(--color-text-muted)' }}>
          Not enough games together yet.
        </p>
      </div>
    )
  }
  return (
    <div>
      <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>{title}</p>
      <p className="text-[10px] mb-2" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>
      <ul className="space-y-1.5">
        {list.map((p, i) => {
          const partner = profilesById[p.partner_id]
          const partnerName = partner ? `${partner.name} ${partner.surname ?? ''}`.trim() : 'Unknown'
          return (
            <li key={p.partner_id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg"
              style={{ background: 'var(--color-surface-2, var(--color-bg))' }}>
              <span className="flex-shrink-0 w-4 text-[10px] font-bold text-center"
                style={{ color: 'var(--color-text-muted)' }}>
                {i + 1}
              </span>
              {partner ? <PlayerAvatar profile={partner} size={28} /> : <div style={{ width: 28, height: 28 }} />}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                  {partnerName}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {p.matches} game{p.matches === 1 ? '' : 's'} · {p.fixtures} fixture{p.fixtures === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                {metric === 'winrate' ? (
                  <>
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--tt-green)' }}>
                      {Math.round(p.winRate * 100)}%
                    </p>
                    <p className="text-[9px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      {p.wins}W-{p.draws}D-{p.losses}L
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>
                      {p.wins}-{p.losses}
                    </p>
                    <p className="text-[9px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      W-L · {p.draws}D
                    </p>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
