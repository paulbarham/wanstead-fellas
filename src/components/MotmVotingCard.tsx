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
  // Per-award save error so failed votes can never silently disappear — see
  // June 2026 incident where a vote chip flashed selected but the upsert
  // failed and reverted with no feedback.
  const [voteError, setVoteError] = useState<Record<AwardType, string | null>>({} as Record<AwardType, string | null>)
  // Single-pass ballot helpers: live name filter + that night's goalscorers,
  // sorted to the top with a ⚽ tag so MOTM candidates surface without scrolling.
  const [filter, setFilter] = useState('')
  const [scorers, setScorers] = useState<Record<string, number>>({})

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

      // Goalscorers for this match drive the goal tag + scorer-first ordering on
      // the ballot. Own goals don't count as a MOTM signal.
      const { data: goalRows } = await supabase
        .from('goals').select('player_id, goals_count, own_goal').eq('match_id', w.match_id)
      const sc: Record<string, number> = {}
      for (const g of (goalRows as { player_id: string | null; goals_count: number; own_goal: boolean }[]) || []) {
        if (!g.player_id || g.own_goal) continue
        sc[g.player_id] = (sc[g.player_id] ?? 0) + (g.goals_count ?? 0)
      }
      setScorers(sc)

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
    setVoteError(e => ({ ...e, [award]: null }))
    const { error } = await supabase.from('votes').upsert(
      { match_id: matchId, award_type: award, voter_id: profile.id, nominee_id: nomineeId, updated_at: new Date().toISOString() },
      { onConflict: 'match_id,award_type,voter_id' },
    )
    if (error) {
      setMyVotes(m => ({ ...m, [award]: prev }))
      setVoteError(e => ({ ...e, [award]: error.message || 'Save failed' }))
      return
    }
    // Read it back so the chip only stays selected once Postgres has it.
    const { data: confirmed, error: readErr } = await supabase
      .from('votes')
      .select('nominee_id')
      .eq('match_id', matchId)
      .eq('award_type', award)
      .eq('voter_id', profile.id)
      .maybeSingle()
    if (readErr || !confirmed || (confirmed as { nominee_id: string }).nominee_id !== nomineeId) {
      setMyVotes(m => ({ ...m, [award]: prev }))
      setVoteError(e => ({ ...e, [award]: 'Vote didn\'t save — tap again to retry' }))
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

  // ── Open: single-pass ballot ────────────────────────────────────────────────
  // One row per player with a 🏆 (MOTM) and 🤡 (DOTD) button, so both awards are
  // cast in a single scroll. Goalscorers float to the top; a search box tames the
  // long roster.
  if (isOpen) {
    const motmPick = myVotes.motm
    const dotdPick = myVotes.dotd
    const votedAll = !!motmPick && !!dotdPick
    const closesLabel = new Date(window.closes_at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    const q = filter.trim().toLowerCase()
    const ranked = [...eligible].sort((a, b) => {
      const ga = scorers[a.id] ?? 0, gb = scorers[b.id] ?? 0
      if (gb !== ga) return gb - ga
      return `${a.surname}${a.name}`.localeCompare(`${b.surname}${b.name}`)
    })
    const shown = q ? ranked.filter(p => `${p.name} ${p.surname}`.toLowerCase().includes(q)) : ranked
    const errors = [voteError.motm, voteError.dotd].filter(Boolean)

    const renderPick = (award: AwardType, player: ProfileLite, selected: boolean, emoji: string) => (
      <button
        key={award}
        onClick={() => castVote(award, player.id)}
        aria-label={`${award === 'motm' ? 'Man of the Match' : 'Dick of the Day'}: ${player.name} ${player.surname}`}
        aria-pressed={selected}
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base transition-transform"
        style={{
          background: selected ? 'var(--color-primary)' : 'var(--color-surface)',
          border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
          opacity: selected ? 1 : 0.45,
          transform: selected ? 'scale(1.05)' : 'none',
        }}
      >
        {emoji}
      </button>
    )

    return (
      <div className="rounded-2xl overflow-hidden mb-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-primary)' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--color-primary)' }}>
          <span className="font-display tracking-wide text-white" style={{ fontSize: 18 }}>
            {votedAll ? 'YOUR VOTES' : 'CAST YOUR VOTES'}
          </span>
          <span className="flex items-center gap-1.5">
            {([['motm', '🏆', !!motmPick], ['dotd', '🤡', !!dotdPick]] as const).map(([key, icon, done]) => (
              <span key={key} className="text-[11px] font-bold px-2 py-1 rounded-full"
                style={{ background: done ? '#FFFFFF' : 'rgba(255,255,255,0.22)', color: done ? 'var(--color-primary)' : '#FFFFFF', letterSpacing: '0.5px' }}>
                {icon} {done ? '✓' : '–'}
              </span>
            ))}
          </span>
        </div>

        <div className="px-4 py-2 text-xs flex items-center justify-between"
          style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
          <span>{participation.voted}/{participation.eligible} voted · closes {closesLabel}</span>
          <span className="text-[10px] uppercase font-semibold" style={{ color: 'var(--color-primary)', letterSpacing: '0.5px' }}>
            🏆 MOTM · 🤡 DOTD
          </span>
        </div>

        {eligible.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: '#9CA897' }}>
            No roster found for this match.
          </div>
        ) : (
          <>
            {errors.length > 0 && (
              <div className="px-4 pt-3 space-y-1">
                {errors.map((e, i) => (
                  <p key={i} className="text-[11px] px-2 py-1.5 rounded"
                    style={{ background: 'var(--color-error-bg, rgba(239,68,68,0.12))', color: 'var(--color-error-text, #dc2626)' }}>
                    ⚠ {e}
                  </p>
                ))}
              </div>
            )}

            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder={`Search ${eligible.length} players…`}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              />
            </div>

            <div>
              {shown.map(p => {
                const goals = scorers[p.id] ?? 0
                return (
                  <div key={p.id} className="px-4 py-2.5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <PlayerAvatar profile={p} size={32} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{p.name} {p.surname}</span>
                      {goals > 0 && (
                        <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}>
                          ⚽ {goals}
                        </span>
                      )}
                    </div>
                    {renderPick('motm', p, motmPick === p.id, '🏆')}
                    {renderPick('dotd', p, dotdPick === p.id, '🤡')}
                  </div>
                )
              })}
              {shown.length === 0 && (
                <div className="px-4 py-6 text-center text-sm" style={{ color: '#9CA897' }}>
                  No players match “{filter}”.
                </div>
              )}
            </div>

            <div className="px-4 py-3 text-[11px]" style={{ color: '#9CA897' }}>
              Tap 🏆 for Man of the Match and 🤡 for Dick of the Day. Change anytime until voting closes.
            </div>
          </>
        )}
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
