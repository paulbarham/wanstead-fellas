import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import CeefaxHeader from '../components/CeefaxHeader'
import {
  type CupMatch, type CupPrediction,
  isLocked, isTournamentActive, stageLabel, stagePageId,
  GROUP_OUTCOMES, KO_OUTCOMES, knockoutMode, knockoutSide, knockoutModeLabel,
  pickLabel,
} from '../lib/cup'

type Tab = 'hub' | 'leaderboard' | 'picks'

interface LeaderRow {
  player_id: string
  name: string
  surname: string
  points: number
  settled: number
  correct: number
}

const TT_YELLOW = 'var(--tt-yellow)'
const TT_CYAN = 'var(--tt-cyan)'
const TT_GREEN = 'var(--tt-green)'
const TT_MAGENTA = 'var(--tt-magenta)'
const TT_RED = 'var(--tt-red)'
const MONO = 'var(--font-mono)'

export default function CupPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('hub')
  const [matches, setMatches] = useState<CupMatch[]>([])
  const [myPicks, setMyPicks] = useState<Record<string, CupPrediction>>({})
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [matchRes, picksRes, lbRes] = await Promise.all([
      supabase.from('cup_matches').select('*').order('kickoff'),
      profile?.id
        ? supabase.from('cup_predictions').select('*').eq('player_id', profile.id)
        : Promise.resolve({ data: [] as CupPrediction[] }),
      supabase.from('cup_predictions').select('player_id, points_awarded, profiles!inner(name, surname)'),
    ])
    setMatches((matchRes.data as CupMatch[]) ?? [])
    const picksMap: Record<string, CupPrediction> = {}
    for (const p of (picksRes.data as CupPrediction[]) ?? []) picksMap[p.match_id] = p
    setMyPicks(picksMap)

    type LbRaw = { player_id: string; points_awarded: number | null; profiles: { name: string; surname: string } }
    const agg = new Map<string, LeaderRow>()
    for (const r of ((lbRes.data as unknown as LbRaw[]) ?? [])) {
      const row = agg.get(r.player_id) ?? {
        player_id: r.player_id,
        name: r.profiles.name,
        surname: r.profiles.surname,
        points: 0, settled: 0, correct: 0,
      }
      if (r.points_awarded != null) {
        row.settled += 1
        row.points += r.points_awarded
        if (r.points_awarded > 0) row.correct += 1
      }
      agg.set(r.player_id, row)
    }
    const lb = Array.from(agg.values())
      .sort((a, b) => b.points - a.points
        || (b.correct / Math.max(1, b.settled)) - (a.correct / Math.max(1, a.settled))
        || a.name.localeCompare(b.name))
    setLeaderboard(lb)
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const myRank = useMemo(() => {
    if (!profile?.id) return null
    const idx = leaderboard.findIndex(r => r.player_id === profile.id)
    return idx >= 0 ? { rank: idx + 1, row: leaderboard[idx] } : null
  }, [leaderboard, profile?.id])

  async function setPick(matchId: string, pick: string) {
    if (!profile?.id) return
    const existing = myPicks[matchId]
    if (existing) {
      const { data, error } = await supabase
        .from('cup_predictions')
        .update({ pick }).eq('id', existing.id).select().single()
      if (!error && data) setMyPicks(prev => ({ ...prev, [matchId]: data as CupPrediction }))
    } else {
      const { data, error } = await supabase
        .from('cup_predictions')
        .insert({ match_id: matchId, player_id: profile.id, pick })
        .select().single()
      if (!error && data) setMyPicks(prev => ({ ...prev, [matchId]: data as CupPrediction }))
    }
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <CeefaxHeader
        pageId="P901 · WORLD CUP"
        title="CUP"
        meta={isTournamentActive() ? 'TOURNAMENT LIVE · MAKE YOUR PICKS' : 'TOURNAMENT ARCHIVE'}
        trailing={profile?.is_admin ? (
          <button
            onClick={() => navigate('/cup/admin')}
            className="text-xs font-medium px-2 py-1 rounded-lg"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            ⚙ Admin
          </button>
        ) : undefined}
      />

      <CupTabs tab={tab} setTab={setTab} myRank={myRank} totalPlayers={leaderboard.length} />

      {loading && <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>Loading…</p>}

      {!loading && tab === 'hub' && (
        <CupHub
          matches={matches}
          myPicks={myPicks}
          leaderboard={leaderboard}
          myRank={myRank}
          onPick={setPick}
          onTab={setTab}
        />
      )}
      {!loading && tab === 'leaderboard' && (
        <CupLeaderboard leaderboard={leaderboard} meId={profile?.id} />
      )}
      {!loading && tab === 'picks' && (
        <CupMyPicks matches={matches} myPicks={myPicks} onPick={setPick} />
      )}
    </div>
  )
}

function CupTabs({
  tab, setTab, myRank, totalPlayers,
}: {
  tab: Tab; setTab: (t: Tab) => void
  myRank: { rank: number; row: LeaderRow } | null; totalPlayers: number
}) {
  const items: { id: Tab; label: string }[] = [
    { id: 'hub', label: 'Hub' },
    { id: 'leaderboard', label: 'League' },
    { id: 'picks', label: 'My Picks' },
  ]
  return (
    <div className="flex items-center justify-between gap-3 mb-4 mt-1">
      <div className="flex gap-1" style={{ fontFamily: MONO }}>
        {items.map(it => (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            className="px-3 py-1.5 text-xs font-semibold rounded-md"
            style={{
              background: tab === it.id ? TT_YELLOW : 'transparent',
              color: tab === it.id ? '#000' : 'var(--color-text-muted)',
              border: tab === it.id ? '1px solid ' + TT_YELLOW : '1px solid var(--color-border)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
      {myRank && (
        <div className="text-right" style={{ fontFamily: MONO }}>
          <p style={{ color: TT_YELLOW, fontSize: 14, fontWeight: 700 }}>
            {String(myRank.rank).padStart(2, '0')}<span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginLeft: 4 }}>/ {totalPlayers}</span>
          </p>
          <p style={{ color: TT_CYAN, fontSize: 10, letterSpacing: '0.1em' }}>{myRank.row.points} PTS</p>
        </div>
      )}
    </div>
  )
}

// ─── Hub view ────────────────────────────────────────────────────────────
function CupHub({
  matches, myPicks, leaderboard, myRank, onPick, onTab,
}: {
  matches: CupMatch[]
  myPicks: Record<string, CupPrediction>
  leaderboard: LeaderRow[]
  myRank: { rank: number; row: LeaderRow } | null
  onPick: (matchId: string, pick: string) => Promise<void>
  onTab: (t: Tab) => void
}) {
  const now = Date.now()
  // Today's + upcoming: anything that hasn't been settled and kicks off
  // in the next ~24h, capped at 6 matches so the hub doesn't sprawl.
  const upcoming = matches.filter(m => {
    const ko = new Date(m.kickoff).getTime()
    return m.actual_outcome == null && ko > now - 90 * 60_000
  }).slice(0, 6)

  const recent = matches.filter(m => m.actual_outcome != null).slice(-5).reverse()

  return (
    <>
      {myRank && (
        <div
          className="rounded-xl p-4 mb-4 flex items-center justify-between"
          style={{
            border: '1px solid var(--color-border)',
            background: 'linear-gradient(90deg, rgba(201,162,39,0.10) 0%, transparent 100%)',
            fontFamily: MONO,
          }}
        >
          <div>
            <p style={{ color: TT_YELLOW, fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
              {String(myRank.rank).padStart(2, '0')}
            </p>
            <p style={{ color: TT_GREEN, fontSize: 10, letterSpacing: '0.1em', marginTop: 4 }}>
              YOUR RANK · OF {leaderboard.length}
            </p>
          </div>
          <div className="text-right">
            <p style={{ color: TT_CYAN, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{myRank.row.points}</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 10, letterSpacing: '0.1em', marginTop: 4 }}>POINTS</p>
          </div>
        </div>
      )}

      <SectionLabel color={TT_CYAN}>▶ Upcoming Fixtures</SectionLabel>
      {upcoming.length === 0 ? (
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>
          Nothing scheduled in the next 24h. Check back when the fixtures land.
        </p>
      ) : (
        upcoming.map(m => (
          <MatchPredictCard key={m.id} match={m} myPick={myPicks[m.id]} onPick={onPick} />
        ))
      )}

      <SectionLabel color={TT_YELLOW}>▶ Top of the League</SectionLabel>
      {leaderboard.length === 0 ? (
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>
          No picks made yet. First fella in gets the early lead.
        </p>
      ) : (
        <LeaderTable rows={leaderboard.slice(0, 5)} meRank={myRank?.rank} />
      )}
      <button
        onClick={() => onTab('leaderboard')}
        className="w-full mt-2 py-2 rounded-lg text-xs font-semibold"
        style={{ border: '1px dashed var(--color-border)', color: 'var(--color-text-muted)', fontFamily: MONO, letterSpacing: '0.08em', background: 'transparent' }}
      >
        ▶ FULL LEAGUE TABLE
      </button>

      {recent.length > 0 && (
        <>
          <SectionLabel color={TT_GREEN}>▶ Recently Settled</SectionLabel>
          {recent.map(m => (
            <SettledMatchRow key={m.id} match={m} myPick={myPicks[m.id]} />
          ))}
        </>
      )}
    </>
  )
}

// ─── Leaderboard view ────────────────────────────────────────────────────
function CupLeaderboard({ leaderboard, meId }: { leaderboard: LeaderRow[]; meId?: string }) {
  if (leaderboard.length === 0) {
    return (
      <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>
        Nobody's made a settled pick yet. Be the first to top the table.
      </p>
    )
  }
  return (
    <>
      <LeaderTable rows={leaderboard} meRank={null} highlightMeId={meId} />
      <p className="text-[10px] mt-3 leading-relaxed" style={{ color: 'var(--color-text-muted)', fontFamily: MONO, letterSpacing: '0.08em' }}>
        % = HIT RATE · CORRECT / SETTLED<br />
        TIEBREAK: HIGHEST HIT RATE WINS
      </p>
    </>
  )
}

// ─── My picks view ──────────────────────────────────────────────────────
function CupMyPicks({
  matches, myPicks, onPick,
}: {
  matches: CupMatch[]
  myPicks: Record<string, CupPrediction>
  onPick: (matchId: string, pick: string) => Promise<void>
}) {
  const settled = matches.filter(m => m.actual_outcome != null)
  const pending = matches.filter(m => m.actual_outcome == null)
  const myPending = pending.filter(m => myPicks[m.id])
  const upcomingNoPick = pending.filter(m => !myPicks[m.id] && !isLocked(m))
  const settledMine = settled.filter(m => myPicks[m.id])

  const correct = settledMine.filter(m => myPicks[m.id].points_awarded === 1).length
  const wrong = settledMine.length - correct
  const hitRate = settledMine.length > 0 ? Math.round((correct / settledMine.length) * 100) : null

  return (
    <>
      <div
        className="rounded-xl p-4 mb-4 flex items-center justify-between"
        style={{ border: '1px solid var(--color-border)', fontFamily: MONO }}
      >
        <div>
          <p style={{ color: TT_YELLOW, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{hitRate != null ? `${hitRate}%` : '—'}</p>
          <p style={{ color: TT_GREEN, fontSize: 10, letterSpacing: '0.1em', marginTop: 4 }}>HIT RATE</p>
        </div>
        <div className="text-right">
          <p style={{ color: TT_CYAN, fontSize: 12, letterSpacing: '0.06em' }}>
            <span style={{ color: TT_GREEN }}>{correct}</span> RIGHT · <span style={{ color: TT_RED }}>{wrong}</span> WRONG
          </p>
        </div>
      </div>

      {upcomingNoPick.length > 0 && (
        <>
          <SectionLabel color={TT_MAGENTA}>▶ Awaiting Your Pick</SectionLabel>
          {upcomingNoPick.slice(0, 4).map(m => (
            <MatchPredictCard key={m.id} match={m} myPick={undefined} onPick={onPick} />
          ))}
        </>
      )}

      {myPending.length > 0 && (
        <>
          <SectionLabel color={TT_CYAN}>▶ Pending</SectionLabel>
          {myPending.map(m => <PendingPickRow key={m.id} match={m} pick={myPicks[m.id]} onPick={onPick} />)}
        </>
      )}

      {settledMine.length > 0 && (
        <>
          <SectionLabel color={TT_GREEN}>▶ Settled</SectionLabel>
          {settledMine.map(m => <SettledMatchRow key={m.id} match={m} myPick={myPicks[m.id]} />)}
        </>
      )}
    </>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────
function SectionLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <p
      className="text-xs mt-5 mb-2"
      style={{ fontFamily: MONO, color, letterSpacing: '0.16em', textTransform: 'uppercase' }}
    >
      {children}
    </p>
  )
}

function MatchPredictCard({
  match, myPick, onPick,
}: {
  match: CupMatch
  myPick: CupPrediction | undefined
  onPick: (matchId: string, pick: string) => Promise<void>
}) {
  const locked = isLocked(match)
  const koDate = new Date(match.kickoff)
  const dateStr = koDate.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()
  return (
    <div className="rounded-xl p-4 mb-3" style={{ border: '1px solid var(--color-border)', fontFamily: MONO }}>
      <div className="flex items-center justify-between mb-3" style={{ fontSize: 10, letterSpacing: '0.1em' }}>
        <span style={{ color: TT_CYAN }}>{stagePageId(match.stage)} · {stageLabel(match.stage)}</span>
        <span style={{ color: locked ? TT_RED : 'var(--color-text-muted)' }}>{dateStr}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2" style={{ fontSize: 15, color: 'var(--color-text)', fontWeight: 600 }}>
        <span className="text-right leading-tight">{match.team1}</span>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>vs</span>
        <span className="leading-tight">{match.team2}</span>
      </div>
      {locked
        ? <LockedState match={match} myPick={myPick} />
        : match.is_knockout
          ? <KOOptions match={match} myPick={myPick} onPick={onPick} />
          : <GroupOptions match={match} myPick={myPick} onPick={onPick} />}
    </div>
  )
}

function GroupOptions({ match, myPick, onPick }: { match: CupMatch; myPick?: CupPrediction; onPick: (id: string, pick: string) => Promise<void> }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {GROUP_OUTCOMES.map(o => {
        const selected = myPick?.pick === o
        const label = o === 'team1' ? match.team1 : o === 'team2' ? match.team2 : 'DRAW'
        return (
          <button
            key={o}
            onClick={() => onPick(match.id, o)}
            className="rounded-md py-3 px-2 text-center leading-tight"
            style={{
              border: selected ? '1px solid ' + TT_YELLOW : '1px solid var(--color-border)',
              background: selected ? 'rgba(201,162,39,0.10)' : 'transparent',
              color: selected ? TT_YELLOW : 'var(--color-text)',
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.03em',
              minHeight: 48,
              wordBreak: 'break-word',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function KOOptions({ match, myPick, onPick }: { match: CupMatch; myPick?: CupPrediction; onPick: (id: string, pick: string) => Promise<void> }) {
  const side1 = KO_OUTCOMES.filter(o => knockoutSide(o) === 1)
  const side2 = KO_OUTCOMES.filter(o => knockoutSide(o) === 2)
  const shortMode = (m: '90' | 'et' | 'pen') => m === '90' ? "90'" : m === 'et' ? 'ET' : 'PENS'
  return (
    <div className="space-y-2 mt-3">
      {[
        { team: match.team1, opts: side1 },
        { team: match.team2, opts: side2 },
      ].map(({ team, opts }) => (
        <div key={team} className="rounded-md overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <p className="px-3 py-2" style={{ background: 'var(--color-surface-2)', color: TT_CYAN, fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em' }}>
            ▶ {team.toUpperCase()} WIN
          </p>
          <div className="grid grid-cols-3">
            {opts.map((o, i) => {
              const selected = myPick?.pick === o
              const mode = knockoutMode(o)
              return (
                <button
                  key={o}
                  onClick={() => onPick(match.id, o)}
                  className="py-3 px-1 text-center"
                  style={{
                    background: selected ? 'rgba(201,162,39,0.10)' : 'transparent',
                    color: selected ? TT_YELLOW : 'var(--color-text)',
                    borderLeft: i === 0 ? 'none' : '1px solid var(--color-border)',
                    fontFamily: MONO,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    minHeight: 44,
                  }}
                >
                  {shortMode(mode)}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function LockedState({ match, myPick }: { match: CupMatch; myPick?: CupPrediction }) {
  return (
    <p className="text-xs mt-2 px-2 py-2 rounded" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', fontFamily: MONO, letterSpacing: '0.04em' }}>
      🔒 Locked.&nbsp;
      {myPick
        ? <>YOUR PICK: <span style={{ color: TT_YELLOW, fontWeight: 700 }}>{pickLabel(myPick.pick, match)}</span></>
        : <span style={{ color: TT_RED, fontWeight: 700 }}>NO PICK SUBMITTED</span>}
    </p>
  )
}

function PendingPickRow({ match, pick, onPick }: { match: CupMatch; pick: CupPrediction; onPick: (id: string, pick: string) => Promise<void> }) {
  const locked = isLocked(match)
  return (
    <div className="rounded-xl p-3 mb-2" style={{ border: '1px solid var(--color-border)', fontFamily: MONO }}>
      <div className="flex items-center justify-between mb-1.5" style={{ fontSize: 10, letterSpacing: '0.1em', color: TT_CYAN }}>
        <span>{stagePageId(match.stage)} · {stageLabel(match.stage)}</span>
        <span style={{ color: 'var(--color-text-muted)' }}>{new Date(match.kickoff).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()}</span>
      </div>
      <div className="flex items-center justify-between gap-3" style={{ fontSize: 13, color: 'var(--color-text)' }}>
        <span className="truncate">{match.team1} vs {match.team2}</span>
        <span style={{ color: TT_YELLOW, fontWeight: 700 }}>{pickLabel(pick.pick, match)}</span>
      </div>
      {!locked && (
        <button
          onClick={() => onPick(match.id, '__noop__')}
          className="text-[10px] mt-2"
          style={{ color: 'var(--color-text-muted)', fontFamily: MONO, letterSpacing: '0.08em', background: 'transparent', border: 'none' }}
          disabled
          title="Tap the predict card on Hub to change"
        >
          ▶ TAP HUB CARD TO CHANGE
        </button>
      )}
    </div>
  )
}

function SettledMatchRow({ match, myPick }: { match: CupMatch; myPick?: CupPrediction }) {
  const correct = myPick?.points_awarded === 1
  return (
    <div className="rounded-xl p-3 mb-2" style={{ border: '1px solid var(--color-border)', fontFamily: MONO }}>
      <div className="flex items-center justify-between mb-1.5" style={{ fontSize: 10, letterSpacing: '0.1em', color: TT_CYAN }}>
        <span>{stagePageId(match.stage)} · {stageLabel(match.stage)}</span>
        <span style={{ color: 'var(--color-text-muted)' }}>FT</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3" style={{ fontSize: 13, color: 'var(--color-text)' }}>
        <span className="text-right truncate">{match.team1}</span>
        <span style={{ color: TT_YELLOW, fontWeight: 700, fontSize: 14 }}>
          {match.score1 ?? '–'}–{match.score2 ?? '–'}
        </span>
        <span className="truncate">{match.team2}</span>
      </div>
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        {myPick
          ? <>PICK: <span style={{ color: correct ? TT_GREEN : TT_RED, fontWeight: 700 }}>{pickLabel(myPick.pick, match)} {correct ? '✓ +1' : '✕'}</span></>
          : <span style={{ color: 'var(--color-text-muted)' }}>NO PICK SUBMITTED</span>}
      </p>
    </div>
  )
}

function LeaderTable({ rows, meRank, highlightMeId }: { rows: LeaderRow[]; meRank: number | null | undefined; highlightMeId?: string }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)', fontFamily: MONO }}>
      <div className="grid grid-cols-[32px_1fr_46px_46px] gap-2 px-3 py-1.5" style={{ background: 'var(--color-surface-2)', color: TT_CYAN, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        <span>#</span><span>NAME</span><span style={{ textAlign: 'right' }}>%</span><span style={{ textAlign: 'right', color: TT_YELLOW }}>PTS</span>
      </div>
      {rows.map((r, i) => {
        const rank = i + 1
        const isTop = rank === 1
        const isMe = highlightMeId === r.player_id || (meRank != null && rank === meRank)
        const pct = r.settled > 0 ? Math.round((r.correct / r.settled) * 100) : 0
        return (
          <div
            key={r.player_id}
            className="grid grid-cols-[32px_1fr_46px_46px] gap-2 px-3 py-2 items-center"
            style={{
              borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
              background: isTop ? 'rgba(201,162,39,0.10)' : isMe ? 'rgba(14,116,144,0.10)' : 'transparent',
              fontSize: 13,
            }}
          >
            <span style={{ color: isTop ? TT_YELLOW : 'var(--color-text-muted)', fontSize: 11, fontWeight: isTop ? 700 : 400 }}>
              {String(rank).padStart(2, '0')}
            </span>
            <span className="truncate" style={{ color: isTop ? TT_YELLOW : isMe ? TT_CYAN : 'var(--color-text)', fontWeight: isTop || isMe ? 700 : 400 }}>
              {r.name} {r.surname}
            </span>
            <span style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontSize: 11 }}>{pct}%</span>
            <span style={{ textAlign: 'right', color: isTop ? TT_YELLOW : TT_CYAN, fontWeight: 700 }}>{r.points}</span>
          </div>
        )
      })}
    </div>
  )
}
