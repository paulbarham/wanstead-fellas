import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getClub } from '../lib/clubs'
import ClubBadge from './ClubBadge'
import SectionHeader from './SectionHeader'

// "This weekend's MoW" callout — for embedding in the match report body.
// Fetches the next-up MoW fixture (same two-pass logic as MowGame:
// current-or-past this Monday, else earliest upcoming). Only renders if
// the fixture's kickoff is in the future so old match reports don't
// carry a stale "coming up" chip through the season.

const COMP_LABEL: Record<string, string> = {
  PL: 'Premier League',
  ELC: 'Championship',
  EL1: 'League One',
  EL2: 'League Two',
}

interface PoolFixture {
  competition: string
  home_club: string
  away_club: string
  kickoff_at: string
  home_score: number | null
  away_score: number | null
}

export default function MowCallout() {
  const [pool, setPool] = useState<PoolFixture | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const today = new Date()
      const utc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      const dow = utc.getUTCDay() || 7
      utc.setUTCDate(utc.getUTCDate() - (dow - 1))
      const thisMondayIso = utc.toISOString().slice(0, 10)

      const { data: currentOrPast } = await supabase
        .from('mow_fixtures')
        .select('pool_fixture_id')
        .lte('week_start', thisMondayIso)
        .order('week_start', { ascending: false })
        .limit(1).maybeSingle()

      let mow = currentOrPast as { pool_fixture_id: string } | null
      if (!mow) {
        const { data: upcoming } = await supabase
          .from('mow_fixtures')
          .select('pool_fixture_id')
          .gt('week_start', thisMondayIso)
          .order('week_start', { ascending: true })
          .limit(1).maybeSingle()
        mow = upcoming as { pool_fixture_id: string } | null
      }
      if (!mow) { if (!cancelled) setLoading(false); return }

      const { data: p } = await supabase
        .from('mow_pool_fixtures')
        .select('competition, home_club, away_club, kickoff_at, home_score, away_score')
        .eq('id', mow.pool_fixture_id).maybeSingle()
      if (cancelled) return
      setPool(p as PoolFixture | null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading || !pool) return null
  // Only surface upcoming or in-progress fixtures — a played MoW belongs
  // in the season leaderboard, not clogging up the current match report.
  if (pool.home_score != null && pool.away_score != null) return null
  if (new Date(pool.kickoff_at).getTime() < Date.now() - 3 * 60 * 60 * 1000) return null

  const homeClub = getClub(pool.home_club)
  const awayClub = getClub(pool.away_club)
  const kickoff = new Date(pool.kickoff_at)
  const koLabel = kickoff.toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Europe/London',
  })
  const compLabel = COMP_LABEL[pool.competition] ?? pool.competition

  return (
    <section className="pt-5 mt-5" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="mb-3">
        <SectionHeader label="🎯 This weekend's Match of the Week" />
      </div>
      <div className="rounded-xl px-4 py-3"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          backgroundClip: 'padding-box',
        }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <ClubBadge slug={pool.home_club} size={36} />
            <span className="text-xs text-center leading-tight break-words px-1" style={{ color: 'var(--color-text)', fontWeight: 600 }}>
              {homeClub?.display_name ?? pool.home_club}
            </span>
          </div>
          <div className="flex flex-col items-center px-2" style={{ minWidth: 82 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--color-text-muted)' }}>vs</div>
            <div className="text-[10px] mt-1 whitespace-nowrap" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              {koLabel}
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <ClubBadge slug={pool.away_club} size={36} />
            <span className="text-xs text-center leading-tight break-words px-1" style={{ color: 'var(--color-text)', fontWeight: 600 }}>
              {awayClub?.display_name ?? pool.away_club}
            </span>
          </div>
        </div>
        <p className="text-[11px] mt-3 text-center" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          {compLabel} · Predictor tab → Match of the Week to lock in your pick
        </p>
      </div>
    </section>
  )
}
