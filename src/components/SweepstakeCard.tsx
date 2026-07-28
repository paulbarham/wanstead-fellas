// World Cup Sweepstake — Hub card.
//
// Independent of the Cup Predictor; reads from cup_sweepstake_entries +
// cup_sweepstake_team_status (and uses cup_matches for computed GA where
// admin hasn't overridden it). Renders three blocks:
//   • Winner & Runner-up — full ownership grid, eliminated teams greyed out
//     because they can no longer win this prize.
//   • Most Conceded — running GA tally, eliminated teams stay in contention
//     (their tally just freezes) so they're shown with an OUT badge but NOT
//     greyed.
//   • Most Reds — same shape as Most Conceded, empty state until reds are
//     recorded.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

type SweepStatus =
  | 'alive' | 'group_stage_out' | 'r32_out' | 'r16_out' | 'qf_out' | 'sf_out'
  | 'third_place_lost' | 'final_lost' | 'winner'

interface SweepEntry {
  id: string
  profile_id: string | null
  sweep_name: string
  team_name: string
  stake: number
}
interface SweepStatusRow {
  team_name: string
  status: SweepStatus
  manual_ga: number | null
  manual_reds: number | null
}
interface CupMatchLite {
  team1: string
  team2: string
  score1: number | null
  score2: number | null
  actual_outcome: string | null
  reds1: number | null
  reds2: number | null
}

const STATUS_LABEL: Record<SweepStatus, string> = {
  alive: 'IN',
  group_stage_out: 'OUT — GS',
  r32_out: 'OUT — R32',
  r16_out: 'OUT — R16',
  qf_out: 'OUT — QF',
  sf_out: 'OUT — SF',
  third_place_lost: 'OUT — 3rd',
  final_lost: 'RUNNER-UP',
  winner: 'WINNER',
}
// Teams still in contention for Winner/Runner-up. final_lost = the team lost
// the final so they took runner-up, which still resolves the prize but they
// can't win — treat as eliminated for grey-out purposes; we'll surface their
// runner-up tag once the final is over.
const ALIVE_FOR_WINNER: SweepStatus[] = ['alive', 'winner']

// Prize pot breakdown — fixed at sweep entry, not derived from the pot
// because the £120 charity portion is a contract, not "half the takings".
const CHARITY = 120
const PRIZE_WINNER = 60
const PRIZE_RUNNER_UP = 30
const PRIZE_MOST_CONCEDED = 20
const PRIZE_MOST_REDS = 10

const C = {
  yellow: 'var(--tt-yellow)',
  cyan: 'var(--tt-cyan)',
  green: 'var(--tt-green)',
  red: 'var(--tt-red)',
  muted: 'var(--color-text-muted)',
  text: 'var(--color-text)',
  border: 'var(--color-border)',
  mono: 'var(--font-mono)',
}

function computeGaFromMatches(team: string, matches: CupMatchLite[]): number {
  let ga = 0
  for (const m of matches) {
    if (m.actual_outcome == null) continue
    if (m.team1 === team) ga += m.score2 ?? 0
    else if (m.team2 === team) ga += m.score1 ?? 0
  }
  return ga
}

function computeRedsFromMatches(team: string, matches: CupMatchLite[]): number {
  let r = 0
  for (const m of matches) {
    if (m.team1 === team) r += m.reds1 ?? 0
    else if (m.team2 === team) r += m.reds2 ?? 0
  }
  return r
}

// Return every team tied at the top of a numeric tally (ga or reds).
// Ties on count-based prizes split the pot evenly between owners.
function view_topByTally<T extends { ga: number; reds: number }>(
  teams: T[], key: 'ga' | 'reds',
): T[] {
  if (teams.length === 0) return []
  const top = Math.max(...teams.map(t => t[key]))
  if (top === 0) return []
  return teams.filter(t => t[key] === top)
}

export default function SweepstakeCard() {
  const { profile } = useAuth()
  const [entries, setEntries] = useState<SweepEntry[]>([])
  const [statuses, setStatuses] = useState<SweepStatusRow[]>([])
  const [matches, setMatches] = useState<CupMatchLite[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expandAll, setExpandAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('cup_sweepstake_entries').select('*'),
      supabase.from('cup_sweepstake_team_status').select('*'),
      supabase.from('cup_matches').select('team1, team2, score1, score2, actual_outcome, reds1, reds2'),
    ]).then(([e, s, m]) => {
      if (cancelled) return
      setEntries((e.data as SweepEntry[]) ?? [])
      setStatuses((s.data as SweepStatusRow[]) ?? [])
      setMatches((m.data as CupMatchLite[]) ?? [])
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  const view = useMemo(() => {
    const statusByTeam = new Map<string, SweepStatusRow>()
    for (const s of statuses) statusByTeam.set(s.team_name, s)

    // Per-team derived stats
    type TeamView = {
      team_name: string
      sweep_name: string
      profile_id: string | null
      status: SweepStatus
      ga: number
      reds: number
      alive_for_winner: boolean
    }
    const teams: TeamView[] = entries.map(e => {
      const st = statusByTeam.get(e.team_name)
      const status = st?.status ?? 'alive'
      const ga = st?.manual_ga ?? computeGaFromMatches(e.team_name, matches)
      const reds = st?.manual_reds ?? computeRedsFromMatches(e.team_name, matches)
      return {
        team_name: e.team_name,
        sweep_name: e.sweep_name,
        profile_id: e.profile_id,
        status,
        ga,
        reds,
        alive_for_winner: ALIVE_FOR_WINNER.includes(status),
      }
    })

    // Group by owner for Winner/Runner-up section
    type OwnerView = {
      sweep_name: string
      profile_id: string | null
      teams: TeamView[]
      alive_count: number
    }
    const byOwner = new Map<string, OwnerView>()
    for (const t of teams) {
      const row = byOwner.get(t.sweep_name) ?? {
        sweep_name: t.sweep_name,
        profile_id: t.profile_id,
        teams: [],
        alive_count: 0,
      }
      row.teams.push(t)
      if (t.alive_for_winner) row.alive_count++
      byOwner.set(t.sweep_name, row)
    }
    const owners = Array.from(byOwner.values()).sort((a, b) => {
      if (b.alive_count !== a.alive_count) return b.alive_count - a.alive_count
      return a.sweep_name.localeCompare(b.sweep_name)
    })
    // Push alive teams to the left within each owner row.
    for (const o of owners) {
      o.teams.sort((a, b) => Number(b.alive_for_winner) - Number(a.alive_for_winner)
        || a.team_name.localeCompare(b.team_name))
    }

    // Tally rankings (don't grey eliminated)
    const tallySorted = (key: 'ga' | 'reds') =>
      [...teams].sort((a, b) => (b[key] - a[key]) || a.team_name.localeCompare(b.team_name))
    const ga_ranking = tallySorted('ga').filter(t => t.ga > 0)
    const reds_ranking = tallySorted('reds').filter(t => t.reds > 0)

    const total_teams = entries.length
    const pot = entries.reduce((s, e) => s + e.stake, 0)
    const settled = matches.filter(m => m.actual_outcome != null).length
    const alive_teams = teams.filter(t => t.alive_for_winner).length

    // Post-tournament crowning — computed once winner status exists.
    // Each prize can tie; ties split the pot evenly. Sorted rank shared
    // across the two Winner/Runner-up prizes so a single tie in the
    // final wouldn't skip runner-up (didn't happen for WC 2026 but the
    // logic should handle it for future tournaments).
    const winners = teams.filter(t => t.status === 'winner')
    const runnersUp = teams.filter(t => t.status === 'final_lost')
    const topGa = view_topByTally(teams, 'ga')
    const topReds = view_topByTally(teams, 'reds')
    const crowned = winners.length > 0
    const prizes = crowned ? {
      winner: { teams: winners,        stake: PRIZE_WINNER },
      runner: { teams: runnersUp,      stake: PRIZE_RUNNER_UP },
      ga:     { teams: topGa,          stake: PRIZE_MOST_CONCEDED },
      reds:   { teams: topReds,        stake: PRIZE_MOST_REDS },
    } : null

    return { teams, owners, ga_ranking, reds_ranking, total_teams, pot, settled, alive_teams, prizes, crowned }
  }, [entries, statuses, matches])

  if (!loaded) return null
  if (entries.length === 0) return null

  const myTeams = profile?.id ? view.teams.filter(t => t.profile_id === profile.id) : []
  const displayedOwners = expandAll ? view.owners : view.owners.slice(0, 9)
  const hiddenCount = view.owners.length - displayedOwners.length
  const knockoutsStarted = view.alive_teams < view.total_teams

  const blockStyle: React.CSSProperties = {
    padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
  }
  const hdrStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6,
  }
  const nameLabel: React.CSSProperties = {
    fontFamily: C.mono, color: C.yellow, fontSize: 11,
    letterSpacing: '0.18em', fontWeight: 800, textTransform: 'uppercase',
  }
  const stakeLabel: React.CSSProperties = {
    fontFamily: C.mono, color: C.yellow, fontSize: 11, fontWeight: 700,
  }
  const whyText: React.CSSProperties = {
    fontSize: 11, color: C.muted, lineHeight: 1.4, marginBottom: 10,
  }

  return (
    <div className="rounded-2xl" style={{
      border: `1px solid ${C.border}`,
      background: 'linear-gradient(160deg, var(--color-surface) 0%, var(--color-surface-2) 100%)',
      backgroundClip: 'padding-box',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 4px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: C.mono, color: C.yellow, fontSize: 10, letterSpacing: '0.18em', fontWeight: 800 }}>
          🎟 WORLD CUP SWEEPSTAKE
        </span>
        <span style={{ fontFamily: C.mono, color: C.muted, fontSize: 9, letterSpacing: '0.12em' }}>P920 · POT</span>
      </div>
      <div style={{ padding: '0 16px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: C.yellow, lineHeight: 1 }}>
          £{view.pot}
          <span style={{ color: C.text, fontSize: 14, marginLeft: 4, opacity: 0.7, fontFamily: C.mono }}>POT</span>
        </span>
        <span style={{ fontFamily: C.mono, color: C.muted, fontSize: 11, letterSpacing: '0.08em', textAlign: 'right' }}>
          {view.owners.length} FELLAS · {view.total_teams} TEAMS<br />
          <b style={{ color: C.green }}>£{CHARITY} TO CHARITY</b>
        </span>
      </div>
      <p style={{
        padding: '6px 16px 12px', fontFamily: C.mono, color: C.muted,
        fontSize: 10, letterSpacing: '0.12em',
        borderBottom: `1px solid ${C.border}`,
      }}>£{PRIZE_WINNER} WINNER · £{PRIZE_RUNNER_UP} RUNNER-UP · £{PRIZE_MOST_CONCEDED} MOST CONCEDED · £{PRIZE_MOST_REDS} MOST REDS</p>

      {/* Prize winners — shown once the tournament crowns a winner
          (WC 2026: post-final on 19 Jul). Sits above the in-progress
          progress bar because at that point the story IS the winners,
          not "9 teams still alive". Handles ties on the count-based
          prizes by splitting the pot evenly between owners. */}
      {view.crowned && view.prizes && (
        <div style={blockStyle}>
          <div style={hdrStyle}>
            <span><span style={{ fontSize: 16 }}>🏆</span> <span style={nameLabel}>Prize Winners · Crowned</span></span>
            <span style={{ fontFamily: C.mono, color: C.green, fontSize: 10, letterSpacing: '0.12em', fontWeight: 800 }}>FINAL</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PrizeRow emoji="👑" label="Winner"        prize={view.prizes.winner} me={profile?.id ?? null} tone="gold" />
            <PrizeRow emoji="🥈" label="Runner-up"     prize={view.prizes.runner} me={profile?.id ?? null} tone="silver" />
            <PrizeRow emoji="🥅" label="Most Conceded" prize={view.prizes.ga}     me={profile?.id ?? null} tone="cyan" statKey="ga" statUnit="conceded" />
            <PrizeRow emoji="🟥" label="Most Reds"     prize={view.prizes.reds}   me={profile?.id ?? null} tone="red" statKey="reds" statUnit="reds" />
          </div>
        </div>
      )}

      {/* Progress */}
      <div style={blockStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: C.mono, color: C.muted, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          <span style={{ color: C.cyan, fontWeight: 700 }}>
            ▶ {view.crowned ? 'TOURNAMENT COMPLETE' : (knockoutsStarted ? 'KNOCKOUTS' : 'GROUP STAGE')}
          </span>
          <span>{view.alive_teams} / {view.total_teams} TEAMS ALIVE</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-2)', overflow: 'hidden', marginTop: 6 }}>
          <div style={{
            height: '100%',
            width: `${Math.round((1 - view.alive_teams / Math.max(1, view.total_teams)) * 100)}%`,
            background: `linear-gradient(90deg, ${C.green}, ${C.yellow})`,
          }} />
        </div>
      </div>

      {/* Winner & Runner-up */}
      <div style={blockStyle}>
        <div style={hdrStyle}>
          <span><span style={{ fontSize: 16 }}>🏆</span> <span style={nameLabel}>Winner &amp; Runner-up</span></span>
          <span style={stakeLabel}>£60 / £30</span>
        </div>
        <p style={whyText}>
          Resolves at the final. Sorted by <em style={{ color: C.cyan, fontStyle: 'normal', fontFamily: C.mono, fontSize: 10, letterSpacing: '0.06em' }}>teams still alive</em>.
          Eliminated teams greyed — out of this prize.
        </p>
        {displayedOwners.map((o, i) => {
          const isMe = !!profile?.id && o.profile_id === profile.id
          return (
            <div key={o.sweep_name} style={{
              padding: '10px 8px',
              borderTop: i === 0 ? `1px solid ${C.border}` : `1px dashed ${C.border}`,
              background: isMe ? 'rgba(74,217,255,0.06)' : 'transparent',
              borderRadius: isMe ? 8 : 0,
              marginLeft: isMe ? -8 : 0,
              marginRight: isMe ? -8 : 0,
            }}>
              {/* Row 1: rank + name + alive count */}
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 8, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
                  <span style={{ fontFamily: C.mono, color: C.muted, fontSize: 11 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{
                    fontFamily: C.mono, fontSize: 14, fontWeight: 700,
                    color: isMe ? C.cyan : C.text,
                  }}>
                    {o.sweep_name}{isMe ? ' (you)' : ''}
                  </span>
                </div>
                <span style={{
                  fontFamily: C.mono, color: C.yellow, fontWeight: 700, fontSize: 13,
                  whiteSpace: 'nowrap',
                }}>
                  {o.alive_count}
                  <span style={{ color: C.muted, fontWeight: 500, fontSize: 11, marginLeft: 4 }}>
                    {o.alive_count === 1 ? 'team alive' : 'alive'}
                  </span>
                </span>
              </div>
              {/* Row 2: team chips — full width, breathable */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {o.teams.map(t => {
                  const out = !t.alive_for_winner
                  return (
                    <span key={t.team_name} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontFamily: C.mono, fontSize: 11,
                      background: out ? 'rgba(143,175,145,0.05)' : 'rgba(74,220,122,0.10)',
                      border: `1px solid ${out ? 'rgba(143,175,145,0.18)' : 'rgba(74,220,122,0.32)'}`,
                      color: out ? C.muted : C.text,
                      borderRadius: 6, padding: '3px 8px',
                      opacity: out ? 0.55 : 1,
                      textDecoration: out ? 'line-through' : 'none',
                    }}>
                      {t.team_name}
                      {out && (
                        <span style={{
                          fontSize: 8, letterSpacing: '0.06em', color: C.red,
                          padding: '1px 4px', background: 'rgba(255,85,85,0.10)',
                          borderRadius: 3, textDecoration: 'none',
                        }}>
                          {STATUS_LABEL[t.status]}
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
        {hiddenCount > 0 && (
          <button onClick={() => setExpandAll(true)}
            style={{
              display: 'block', width: '100%', padding: '8px 0', marginTop: 8,
              background: 'transparent', border: 'none',
              fontFamily: C.mono, color: C.yellow, fontSize: 10,
              letterSpacing: '0.14em', fontWeight: 800, textAlign: 'center', cursor: 'pointer',
            }}>
            ▶ SHOW ALL {view.owners.length} FELLAS (+{hiddenCount} MORE)
          </button>
        )}
      </div>

      {/* Most Conceded */}
      <div style={blockStyle}>
        <div style={hdrStyle}>
          <span><span style={{ fontSize: 16 }}>🥅</span> <span style={nameLabel}>Most Conceded</span></span>
          <span style={stakeLabel}>£20</span>
        </div>
        <p style={whyText}>
          Total GA across the whole tournament. <em style={{ color: C.cyan, fontStyle: 'normal', fontFamily: C.mono, fontSize: 10, letterSpacing: '0.06em' }}>Eliminated teams still in contention</em> — tally freezes when they go out.
        </p>
        {view.ga_ranking.length === 0 ? (
          <p style={{ fontFamily: C.mono, color: C.muted, fontSize: 11, textAlign: 'center', padding: '10px 0 2px' }}>
            No goals conceded yet · all teams on 0
          </p>
        ) : (
          view.ga_ranking.slice(0, 5).map((t, i) => <TallyRow key={t.team_name} rk={i + 1} team={t} stat={t.ga} unit="GA" />)
        )}
      </div>

      {/* Most Reds */}
      <div style={blockStyle}>
        <div style={hdrStyle}>
          <span><span style={{ fontSize: 16 }}>🟥</span> <span style={nameLabel}>Most Reds</span></span>
          <span style={stakeLabel}>£10</span>
        </div>
        <p style={whyText}>
          Total reds across the whole tournament. <em style={{ color: C.cyan, fontStyle: 'normal', fontFamily: C.mono, fontSize: 10, letterSpacing: '0.06em' }}>Both free-tier feeds paywall WC 2026 card data</em> — admin enters per-team totals in Cup Admin.
        </p>
        {view.reds_ranking.length === 0 ? (
          <p style={{ fontFamily: C.mono, color: C.muted, fontSize: 11, textAlign: 'center', padding: '10px 0 2px' }}>
            No reds yet · all teams on 0
          </p>
        ) : (
          view.reds_ranking.slice(0, 5).map((t, i) => <TallyRow key={t.team_name} rk={i + 1} team={t} stat={t.reds} unit="R" />)
        )}
      </div>

      {/* Your Teams */}
      {myTeams.length > 0 && (
        <div style={{ margin: '12px 16px', padding: '10px 12px', borderRadius: 12,
          background: 'rgba(74,217,255,0.06)', border: '1px solid rgba(74,217,255,0.24)' }}>
          <p style={{ fontFamily: C.mono, color: C.cyan, fontSize: 9, letterSpacing: '0.18em', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>
            ▶ Your teams
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {myTeams.map(t => (
              <span key={t.team_name} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: C.mono, fontSize: 12,
                background: 'rgba(255,255,255,0.05)',
                border: t.alive_for_winner ? '1px solid rgba(74,220,122,0.4)' : '1px solid rgba(143,175,145,0.18)',
                color: t.alive_for_winner ? C.text : C.muted,
                borderRadius: 999, padding: '4px 10px',
                opacity: t.alive_for_winner ? 1 : 0.55,
                textDecoration: t.alive_for_winner ? 'none' : 'line-through',
              }}>
                {t.team_name}
                <span style={{
                  fontSize: 9, letterSpacing: '0.1em',
                  color: t.alive_for_winner ? C.green : C.red,
                  padding: '1px 5px',
                  background: t.alive_for_winner ? 'rgba(74,220,122,0.08)' : 'rgba(255,85,85,0.08)',
                  borderRadius: 4,
                }}>
                  {STATUS_LABEL[t.status]}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '10px 16px 14px', borderTop: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: C.mono, color: C.muted, fontSize: 10, letterSpacing: '0.1em' }}>
          {view.settled} group game{view.settled === 1 ? '' : 's'} settled
        </span>
        <span style={{ fontFamily: C.mono, color: C.muted, fontSize: 10, letterSpacing: '0.1em' }}>
          Admin: update status / reds in Cup Admin
        </span>
      </div>
    </div>
  )
}

// One row in the "Prize Winners" crowned block. Handles ties by
// splitting the stake evenly + rendering all tied owners inline.
function PrizeRow({ emoji, label, prize, me, tone, statKey, statUnit }: {
  emoji: string
  label: string
  prize: { teams: Array<{ team_name: string; sweep_name: string; profile_id: string | null; ga: number; reds: number }>; stake: number }
  me: string | null
  tone: 'gold' | 'silver' | 'cyan' | 'red'
  statKey?: 'ga' | 'reds'
  statUnit?: string
}) {
  const toneColor = tone === 'gold' ? C.yellow
    : tone === 'silver' ? '#CCCCCC'
    : tone === 'cyan' ? C.cyan
    : C.red
  const share = prize.teams.length > 0 ? prize.stake / prize.teams.length : prize.stake
  const shareStr = Number.isInteger(share) ? `£${share}` : `£${share.toFixed(2)}`
  const tied = prize.teams.length > 1
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 10,
      padding: '8px 10px', borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${toneColor}33`,
    }}>
      <div style={{ fontSize: 20, lineHeight: 1, alignSelf: 'center' }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: C.mono, fontSize: 9, letterSpacing: '0.14em',
            fontWeight: 800, textTransform: 'uppercase', color: toneColor,
          }}>
            {label}
          </span>
          {tied && (
            <span style={{
              fontFamily: C.mono, fontSize: 8, letterSpacing: '0.12em',
              color: C.muted, textTransform: 'uppercase',
              padding: '1px 5px', borderRadius: 3,
              border: `1px solid ${C.border}`,
            }}>
              tied · split
            </span>
          )}
        </div>
        {prize.teams.length === 0 ? (
          <div style={{ fontFamily: C.mono, color: C.muted, fontSize: 11, marginTop: 3 }}>
            No winner recorded.
          </div>
        ) : (
          <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {prize.teams.map(t => {
              const isMe = !!me && t.profile_id === me
              return (
                <div key={t.team_name} style={{
                  display: 'flex', alignItems: 'baseline', gap: 6,
                  fontFamily: C.mono, fontSize: 12,
                  color: isMe ? C.cyan : C.text,
                  fontWeight: isMe ? 700 : 500,
                }}>
                  <span>{t.team_name}</span>
                  <span style={{ color: C.muted, fontSize: 10 }}>·</span>
                  <span style={{ color: isMe ? C.cyan : C.green }}>
                    {t.sweep_name}{isMe ? ' (you)' : ''}
                  </span>
                  {statKey && (
                    <span style={{ color: C.muted, fontSize: 10, marginLeft: 'auto' }}>
                      {t[statKey]}{statUnit ? ` ${statUnit}` : ''}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div style={{
        alignSelf: 'center', textAlign: 'right',
        fontFamily: C.mono, minWidth: 56,
      }}>
        <div style={{ color: toneColor, fontSize: 15, fontWeight: 800, lineHeight: 1 }}>
          {shareStr}
        </div>
        {tied && (
          <div style={{ fontSize: 8, color: C.muted, letterSpacing: '0.08em', marginTop: 2 }}>
            of £{prize.stake}
          </div>
        )}
      </div>
    </div>
  )
}

function TallyRow({ rk, team, stat, unit }: {
  rk: number
  team: { team_name: string; sweep_name: string; status: SweepStatus }
  stat: number
  unit: string
}) {
  const out = !ALIVE_FOR_WINNER.includes(team.status)
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 8,
      alignItems: 'baseline', padding: '6px 0',
      borderTop: rk === 1 ? `1px solid ${C.border}` : `1px dashed ${C.border}`,
    }}>
      <span style={{ fontFamily: C.mono, color: C.muted, fontSize: 10 }}>{String(rk).padStart(2, '0')}</span>
      <span style={{ fontSize: 13, color: C.text }}>
        {team.team_name}
        <span style={{ color: C.cyan, fontFamily: C.mono, fontSize: 10, marginLeft: 6, letterSpacing: '0.06em' }}>
          {team.sweep_name.toUpperCase()}
        </span>
        {out && (
          <span style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: '0.06em',
            color: C.red, marginLeft: 6, padding: '1px 4px',
            background: 'rgba(255,85,85,0.08)', borderRadius: 3 }}>
            {STATUS_LABEL[team.status]}
          </span>
        )}
      </span>
      <span style={{ fontFamily: C.mono, color: C.yellow, fontWeight: 700, fontSize: 13 }}>
        {stat}<span style={{ color: C.muted, fontWeight: 500, fontSize: 10, marginLeft: 2 }}>{unit}</span>
      </span>
    </div>
  )
}
