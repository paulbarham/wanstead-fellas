import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import PlayerAvatar from './PlayerAvatar'
import type { Profile, AwardType, AwardResult, VotingWindow } from '../types'

type ProfileLite = Pick<Profile, 'id' | 'name' | 'surname' | 'photo_url'>

const AWARDS: { type: AwardType; label: string; icon: string }[] = [
  { type: 'motm', label: 'Man of the Match', icon: '🏆' },
  { type: 'dotd', label: 'Dick of the Day', icon: '🤡' },
]

const LOW_TURNOUT = 5

interface BreakdownRow {
  award_type: AwardType
  voter_name: string
  nominee_name: string
}

export default function MotmVotingCard() {
  const { profile } = useAuth()
  const isAdmin = profile?.is_admin ?? false

  const [loading, setLoading] = useState(true)
  const [window, setWindow] = useState<VotingWindow | null>(null)
  const [eligible, setEligible] = useState<ProfileLite[]>([])
  const [myVotes, setMyVotes] = useState<Record<AwardType, string>>({} as Record<AwardType, string>)
  const [participation, setParticipation] = useState<{ voted: number; eligible: number }>({ voted: 0, eligible: 0 })
  const [results, setResults] = useState<AwardResult[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, ProfileLite>>({})
  const [dotdStreak, setDotdStreak] = useState<ProfileLite | null>(null)
  const [breakdown, setBreakdown] = useState<BreakdownRow[] | null>(null)
  const [overrideFor, setOverrideFor] = useState<AwardType | null>(null)

  const now = Date.now()
  const matchId = window?.match_id ?? null
  const opensAt = window ? new Date(window.opens_at).getTime() : 0
  const closesAt = window ? new Date(window.closes_at).getTime() : 0
  const isOpen = !!window && now >= opensAt && now <= closesAt
  const isClosed = !!window && now > closesAt

  const loadParticipation = useCallback(async (mId: string) => {
    const { data } = await supabase.rpc('voting_participation', { p_match_id: mId })
    const row = Array.isArray(data) ? data[0] : data
    if (row) setParticipation({ voted: row.voted ?? 0, eligible: row.eligible ?? 0 })
  }, [])

  const loadResults = useCallback(async (mId: string, published: boolean) => {
    if (!published) {
      // Backstop: cron normally publishes, but trigger compute on first view.
      await supabase.rpc('compute_award_results')
    }
    const { data } = await supabase.from('award_results').select('*').eq('match_id', mId)
    setResults((data as AwardResult[]) || [])
  }, [])

  useEffect(() => {
    async function load() {
      const { data: vw } = await supabase
        .from('voting_windows')
        .select('*')
        .order('closes_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const w = vw as VotingWindow | null
      setWindow(w)
      if (!w) { setLoading(false); return }

      const nowMs = Date.now()
      const opens = new Date(w.opens_at).getTime()
      const closes = new Date(w.closes_at).getTime()
      if (nowMs < opens) { setLoading(false); return }

      // Eligible players = rostered for that match.
      const { data: teamRows } = await supabase.from('teams').select('id').eq('match_id', w.match_id)
      const teamIds = ((teamRows as { id: string }[]) || []).map(t => t.id)
      let elig: ProfileLite[] = []
      if (teamIds.length > 0) {
        const { data: tp } = await supabase.from('team_players').select('player_id').in('team_id', teamIds)
        const playerIds = [...new Set(((tp as { player_id: string }[]) || []).map(r => r.player_id))]
        if (playerIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles').select('id, name, surname, photo_url').in('id', playerIds)
          elig = ((profs as ProfileLite[]) || []).sort((a, b) =>
            `${a.surname}${a.name}`.localeCompare(`${b.surname}${b.name}`))
        }
      }
      setEligible(elig)
      const pMap: Record<string, ProfileLite> = {}
      for (const p of elig) pMap[p.id] = p

      if (nowMs <= closes) {
        // Open: load my own votes (RLS returns only mine) + participation.
        const { data: mv } = await supabase
          .from('votes').select('award_type, nominee_id').eq('match_id', w.match_id)
        const mine = {} as Record<AwardType, string>
        for (const v of (mv as { award_type: AwardType; nominee_id: string }[]) || []) {
          mine[v.award_type] = v.nominee_id
        }
        setMyVotes(mine)
        await loadParticipation(w.match_id)
      } else {
        await loadResults(w.match_id, w.results_published)
      }

      // Profile names for any result players not in the eligible map.
      const { data: extraProfs } = await supabase
        .from('profiles').select('id, name, surname, photo_url')
      for (const p of (extraProfs as ProfileLite[]) || []) pMap[p.id] = p
      setProfileMap(pMap)

      // Admin-only: DOTD 3-in-a-row soft flag.
      if ((profile?.is_admin ?? false)) {
        const [{ data: dotd }, { data: ms }] = await Promise.all([
          supabase.from('award_results').select('player_id, match_id').eq('award_type', 'dotd'),
          supabase.from('matches').select('id, match_date'),
        ])
        const mDate: Record<string, string> = {}
        for (const m of (ms as { id: string; match_date: string | null }[]) || []) mDate[m.id] = m.match_date ?? ''
        const rows = (dotd as { player_id: string; match_id: string }[]) || []
        const byMatch = new Map<string, { date: string; players: Set<string> }>()
        for (const r of rows) {
          const e = byMatch.get(r.match_id) ?? { date: mDate[r.match_id] ?? '', players: new Set<string>() }
          e.players.add(r.player_id)
          byMatch.set(r.match_id, e)
        }
        const recent = [...byMatch.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
        if (recent.length === 3 &&
            recent.every(m => m.players.size === 1) &&
            new Set(recent.map(m => [...m.players][0])).size === 1) {
          setDotdStreak(pMap[[...recent[0].players][0]] ?? null)
        }
      }

      setLoading(false)
    }
    load()
  }, [loadParticipation, loadResults, profile?.is_admin])

  async function castVote(award: AwardType, nomineeId: string) {
    if (!profile || !matchId) return
    const prev = myVotes[award]
    setMyVotes(m => ({ ...m, [award]: nomineeId }))
    const { error } = await supabase.from('votes').upsert(
      { match_id: matchId, award_type: award, voter_id: profile.id, nominee_id: nomineeId, updated_at: new Date().toISOString() },
      { onConflict: 'match_id,award_type,voter_id' },
    )
    if (error) {
      setMyVotes(m => ({ ...m, [award]: prev }))
      return
    }
    loadParticipation(matchId)
  }

  async function applyOverride(award: AwardType, playerId: string) {
    if (!matchId) return
    const total = results.filter(r => r.award_type === award).reduce((s, r) => Math.max(s, r.total_votes), 0)
    await supabase.from('award_results').delete().eq('match_id', matchId).eq('award_type', award)
    await supabase.from('award_results').insert({
      match_id: matchId, award_type: award, player_id: playerId,
      vote_count: 0, total_votes: total, is_shared: false, is_admin_override: true,
    })
    await supabase.from('voting_windows').update({ results_published: true }).eq('match_id', matchId)
    setOverrideFor(null)
    await loadResults(matchId, true)
  }

  async function loadBreakdown() {
    if (!matchId) return
    const { data } = await supabase.rpc('admin_vote_breakdown', { p_match_id: matchId })
    setBreakdown((data as BreakdownRow[]) || [])
  }

  if (loading || !window) return null
  if (now < opensAt) return null

  // ── Open: ballot ──────────────────────────────────────────────────────────
  if (isOpen) {
    const hasVoted = Object.keys(myVotes).length > 0
    return (
      <div className="rounded-2xl overflow-hidden mb-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-primary)' }}>
        <div className="px-4 py-3 flex items-center justify-between"
          style={{ background: 'var(--color-primary)' }}>
          <span className="font-display tracking-wide text-white" style={{ fontSize: 18 }}>CAST YOUR VOTES</span>
          {hasVoted && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ background: '#FFFFFF', color: 'var(--color-primary)', letterSpacing: '0.5px' }}>
              ✓ VOTED
            </span>
          )}
        </div>

        <div className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
          {participation.voted} of {participation.eligible} players have voted · closes {new Date(window.closes_at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>

        {eligible.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: '#9CA897' }}>
            No roster found for this match.
          </div>
        ) : AWARDS.map(({ type, label, icon }) => (
          <div key={type} className="px-4 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-primary)' }}>
              {icon} {label}
            </p>
            <div className="flex flex-wrap gap-2">
              {eligible.map(p => {
                const selected = myVotes[type] === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => castVote(type, p.id)}
                    className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    style={{
                      background: selected ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: selected ? '#FFFFFF' : 'var(--color-text)',
                      border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    }}
                  >
                    <PlayerAvatar profile={p} size={22} />
                    {p.name} {p.surname}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <div className="px-4 py-3 text-[11px]" style={{ color: '#9CA897' }}>
          You can change your picks any time until voting closes.
        </div>
      </div>
    )
  }

  // ── Closed: results ───────────────────────────────────────────────────────
  if (isClosed) {
    return (
      <div className="rounded-2xl overflow-hidden mb-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.8px' }}>
            Match Awards
          </span>
        </div>

        {results.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: '#9CA897' }}>
            Results being calculated — check back shortly.
          </div>
        ) : AWARDS.map(({ type, label, icon }) => {
          const rows = results.filter(r => r.award_type === type)
          if (rows.length === 0) return null
          const isOverride = rows.some(r => r.is_admin_override)
          const shared = rows.length > 1 || rows.some(r => r.is_shared)
          const total = rows.reduce((s, r) => Math.max(s, r.total_votes), 0)
          return (
            <div key={type} className="px-4 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
                  {icon} {label}{shared && <span style={{ color: '#9CA897' }}> · shared</span>}
                </p>
                {isOverride && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
                    ADMIN CALL
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {rows.map(r => {
                  const p = profileMap[r.player_id]
                  return (
                    <div key={r.id} className="flex items-center gap-3">
                      {p ? <PlayerAvatar profile={p} size={36} /> : <div style={{ width: 36 }} />}
                      <span className="flex-1 text-sm font-semibold text-[var(--color-text)]">
                        {p ? `${p.name} ${p.surname}` : 'Unknown player'}
                      </span>
                      {!r.is_admin_override && (
                        <span className="text-xs" style={{ color: '#9CA897' }}>{r.vote_count} votes</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {!isOverride && total > 0 && total <= LOW_TURNOUT && (
                <p className="text-[11px] mt-2" style={{ color: '#9CA897' }}>Awarded on {total} vote{total !== 1 ? 's' : ''}.</p>
              )}
              {isAdmin && (
                <button
                  onClick={() => setOverrideFor(overrideFor === type ? null : type)}
                  className="mt-3 text-[11px] px-3 py-1.5 rounded-lg font-semibold"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                >
                  {overrideFor === type ? 'Cancel' : 'Override result'}
                </button>
              )}
              {isAdmin && overrideFor === type && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {eligible.map(p => (
                    <button
                      key={p.id}
                      onClick={() => applyOverride(type, p.id)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    >
                      {p.name} {p.surname}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {isAdmin && dotdStreak && (
          <div className="px-4 py-3 text-xs" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
            ⚠ {dotdStreak.name} {dotdStreak.surname} has won DOTD 3 weeks running — sanity check.
          </div>
        )}

        {isAdmin && (
          <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <button
              onClick={() => (breakdown ? setBreakdown(null) : loadBreakdown())}
              className="text-[11px] px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              {breakdown ? 'Hide vote breakdown' : 'Admin: who voted for whom'}
            </button>
            {breakdown && (
              <div className="mt-3">
                {breakdown.length === 0 ? (
                  <p className="text-[11px]" style={{ color: '#9CA897' }}>No votes cast.</p>
                ) : (
                  (() => {
                    const byVoter = new Map<string, { voter: string; motm: string; dotd: string }>()
                    for (const b of breakdown) {
                      const row = byVoter.get(b.voter_name) ?? { voter: b.voter_name, motm: '—', dotd: '—' }
                      if (b.award_type === 'motm') row.motm = b.nominee_name
                      else if (b.award_type === 'dotd') row.dotd = b.nominee_name
                      byVoter.set(b.voter_name, row)
                    }
                    const rows = Array.from(byVoter.values()).sort((a, b) =>
                      a.voter.localeCompare(b.voter, undefined, { sensitivity: 'base' })
                    )
                    return (
                      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr style={{ color: '#9CA897', background: 'var(--color-surface)' }}>
                              <th className="px-2 py-1.5 text-left font-semibold uppercase" style={{ letterSpacing: '0.6px' }}>Voter</th>
                              <th className="px-2 py-1.5 text-left font-semibold uppercase" style={{ letterSpacing: '0.6px' }}>MOTM</th>
                              <th className="px-2 py-1.5 text-left font-semibold uppercase" style={{ letterSpacing: '0.6px' }}>DOTD</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={r.voter} style={{ borderTop: '1px solid var(--color-border)', background: i % 2 === 0 ? 'transparent' : 'var(--color-surface)' }}>
                                <td className="px-2 py-1.5 font-medium" style={{ color: 'var(--color-text)' }}>{r.voter}</td>
                                <td className="px-2 py-1.5" style={{ color: r.motm === '—' ? '#9CA897' : 'var(--color-text)' }}>{r.motm}</td>
                                <td className="px-2 py-1.5" style={{ color: r.dotd === '—' ? '#9CA897' : 'var(--color-text)' }}>{r.dotd}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return null
}
