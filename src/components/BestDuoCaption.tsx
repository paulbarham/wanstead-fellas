import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Small caption at the bottom of a published team card:
//   🤝 Best duo tonight: Paul + Sheridan (8W-2L this season)
//
// Backed by best_duo_from_players() RPC (mig 085).
// Self-hides silently when no pair meets the min-fixture threshold —
// new teams or teams with mostly unrated players show nothing.

interface DuoResult {
  player_a_id: string
  player_b_id: string
  fixtures: number
  matches: number
  wins: number
  draws: number
  losses: number
  win_rate: number | null
}

interface PartnerLite { id: string; name: string; surname: string | null }

function currentSeasonStartYear(now: Date = new Date()): number {
  const y = now.getFullYear()
  return now.getMonth() >= 3 ? y : y - 1
}

export default function BestDuoCaption({ playerIds }: { playerIds: string[] }) {
  const [duo, setDuo] = useState<DuoResult | null>(null)
  const [partners, setPartners] = useState<Record<string, PartnerLite>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (playerIds.length < 2) { setLoaded(true); return }

    ;(async () => {
      const { data, error } = await supabase.rpc('best_duo_from_players', {
        p_player_ids: playerIds,
        p_season_start_year: currentSeasonStartYear(),
      })
      if (cancelled) return
      if (error) { console.error('best_duo_from_players', error); setLoaded(true); return }
      const row = ((data ?? []) as DuoResult[])[0] ?? null
      setDuo(row)

      if (row) {
        const { data: profs } = await supabase.from('profiles')
          .select('id, name, surname')
          .in('id', [row.player_a_id, row.player_b_id])
        if (cancelled) return
        const map: Record<string, PartnerLite> = {}
        for (const p of (profs ?? []) as PartnerLite[]) map[p.id] = p
        setPartners(map)
      }
      setLoaded(true)
    })()

    return () => { cancelled = true }
  }, [playerIds.join(',')])

  if (!loaded || !duo) return null
  const a = partners[duo.player_a_id]
  const b = partners[duo.player_b_id]
  if (!a || !b) return null

  const firstName = (p: PartnerLite) => p.name.split(' ')[0]
  const record = `${duo.wins}W-${duo.losses}L${duo.draws > 0 ? `-${duo.draws}D` : ''}`

  return (
    <div
      className="flex items-center gap-2 px-4 py-2"
      style={{
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface-2, var(--color-bg))',
        borderBottomLeftRadius: 11,
        borderBottomRightRadius: 11,
      }}
    >
      <span style={{ fontSize: 14 }}>🤝</span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}>
        Best duo
      </span>
      <span className="flex-1 truncate" style={{ fontSize: 12, color: 'var(--color-text)' }}>
        <strong style={{ color: 'var(--tt-cyan)' }}>{firstName(a)} + {firstName(b)}</strong>
      </span>
      <span
        className="tabular-nums"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--tt-green)',
        }}>
        {record}
      </span>
    </div>
  )
}
