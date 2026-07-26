import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getClub } from '../lib/clubs'
import ClubBadge from './ClubBadge'

// Match of the Week — v1 UI. Reads mow_fixtures (this week's pick), the
// underlying mow_pool_fixtures row (for teams + kickoff + final score),
// and mow_predictions (my pick + everyone's for the leaderboard).
//
// State machine:
//   loading      → skeleton
//   pre_pick     → no fixture published yet this week ("drops Monday morning")
//   open         → fixture published, kickoff in future, score picker live
//   locked       → past kickoff, no result → "awaiting result"
//   settled      → result in → shows final score, my points, weekly board

const TT_YELLOW = 'var(--tt-yellow)'
const TT_CYAN = 'var(--tt-cyan)'
const TT_GREEN = 'var(--tt-green)'
const TT_MAGENTA = 'var(--tt-magenta)'
const TT_RED = 'var(--tt-red)'
const MONO = 'var(--font-mono)'

interface PoolFixture {
  id: string
  competition: string
  home_club: string
  away_club: string
  kickoff_at: string
  home_score: number | null
  away_score: number | null
}
interface MowFixture {
  id: string
  week_start: string
  pool_fixture_id: string
  pick_note: string | null
  published_at: string
}
interface MowPrediction {
  id: string
  mow_fixture_id: string
  player_id: string
  home_score: number
  away_score: number
  points_awarded: number | null
}
interface WeeklyRow {
  player_id: string
  display_name: string
  home_score: number
  away_score: number
  points_awarded: number | null
}
interface SeasonRow {
  player_id: string
  display_name: string
  picks_settled: number
  total_pts: number
  exact_count: number
  result_only_count: number
  wrong_count: number
}

const COMP_LABEL: Record<string, string> = {
  PL: 'Premier League',
  ELC: 'Championship',
  EL1: 'League One',
  EL2: 'League Two',
}

export default function MowGame() {
  const { profile } = useAuth()
  const [mow, setMow]   = useState<MowFixture | null>(null)
  const [pool, setPool] = useState<PoolFixture | null>(null)
  const [myPick, setMyPick] = useState<MowPrediction | null>(null)
  const [weekly, setWeekly] = useState<WeeklyRow[]>([])
  const [season, setSeason] = useState<SeasonRow[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    // The latest MoW row IS this week's fixture (there's at most one per
    // week_start). Ordering by week_start desc gets the newest.
    const { data: mowRow } = await supabase
      .from('mow_fixtures')
      .select('id, week_start, pool_fixture_id, pick_note, published_at')
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()
    const m = mowRow as MowFixture | null
    setMow(m)
    if (!m) { setLoading(false); return }

    const [{ data: poolRow }, { data: pickRow }, { data: lbRows }, { data: seasonRows }] = await Promise.all([
      supabase.from('mow_pool_fixtures')
        .select('id, competition, home_club, away_club, kickoff_at, home_score, away_score')
        .eq('id', m.pool_fixture_id).maybeSingle(),
      profile?.id
        ? supabase.from('mow_predictions')
            .select('id, mow_fixture_id, player_id, home_score, away_score, points_awarded')
            .eq('mow_fixture_id', m.id).eq('player_id', profile.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('v_mow_weekly_leaderboard')
        .select('player_id, display_name, home_score, away_score, points_awarded'),
      supabase.from('v_mow_season_leaderboard')
        .select('player_id, display_name, picks_settled, total_pts, exact_count, result_only_count, wrong_count'),
    ])
    setPool(poolRow as PoolFixture | null)
    setMyPick(pickRow as MowPrediction | null)
    setWeekly((lbRows as WeeklyRow[]) ?? [])
    setSeason((seasonRows as SeasonRow[]) ?? [])
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { refresh() }, [refresh])

  const phase = useMemo<'loading'|'pre_pick'|'open'|'locked'|'settled'>(() => {
    if (loading) return 'loading'
    if (!mow || !pool) return 'pre_pick'
    if (pool.home_score != null && pool.away_score != null) return 'settled'
    if (new Date(pool.kickoff_at).getTime() <= Date.now()) return 'locked'
    return 'open'
  }, [loading, mow, pool])

  if (phase === 'loading') {
    return <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>Loading…</p>
  }
  if (phase === 'pre_pick') {
    return <PreviewCard />
  }

  const homeClub = getClub(pool!.home_club)
  const awayClub = getClub(pool!.away_club)

  return (
    <div className="mt-2 flex flex-col gap-3">
      <FixtureHeader
        pool={pool!}
        homeName={homeClub?.display_name ?? pool!.home_club}
        awayName={awayClub?.display_name ?? pool!.away_club}
        phase={phase}
      />

      {phase === 'open' && profile?.id && (
        <PickForm
          mowFixtureId={mow!.id}
          playerId={profile.id}
          existing={myPick}
          onSaved={(p) => setMyPick(p)}
        />
      )}

      {phase === 'locked' && (
        <LockedCard myPick={myPick} />
      )}

      {phase === 'settled' && (
        <SettledCard pool={pool!} myPick={myPick} />
      )}

      <WeeklyLeaderboard rows={weekly} meId={profile?.id} phase={phase} />

      {season.length > 0 && <SeasonLeaderboard rows={season} meId={profile?.id} />}
    </div>
  )
}

// ── Header (fixture + kickoff + comp label) ────────────────────────────────
function FixtureHeader({ pool, homeName, awayName, phase }: {
  pool: PoolFixture; homeName: string; awayName: string
  phase: 'open'|'locked'|'settled'
}) {
  const kickoff = new Date(pool.kickoff_at)
  const isSettled = phase === 'settled'
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2, var(--color-bg))', fontFamily: MONO }}>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: TT_CYAN, fontWeight: 700 }}>
          🎯 Match of the Week
        </span>
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {COMP_LABEL[pool.competition] ?? pool.competition}
        </span>
      </div>

      <div className="px-3 py-4 flex items-center justify-between gap-2">
        <TeamCell name={homeName} slug={pool.home_club} align="right" />
        <div className="flex flex-col items-center px-2" style={{ minWidth: 72 }}>
          {isSettled ? (
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: TT_YELLOW, letterSpacing: '0.05em' }}>
              {pool.home_score}–{pool.away_score}
            </div>
          ) : (
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: 'var(--color-text-muted)' }}>vs</div>
          )}
          <div className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>
            {formatKickoff(kickoff, isSettled)}
          </div>
        </div>
        <TeamCell name={awayName} slug={pool.away_club} align="left" />
      </div>
    </div>
  )
}

function TeamCell({ name, slug, align }: { name: string; slug: string; align: 'left'|'right' }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <ClubBadge slug={slug} size={44} />
      <span className="text-xs text-center leading-tight" style={{
        color: 'var(--color-text)',
        fontWeight: 600,
        textAlign: align === 'right' ? 'right' : 'left',
        minHeight: 28,
      }}>{name}</span>
    </div>
  )
}

function formatKickoff(d: Date, isSettled: boolean): string {
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return isSettled ? `FT · ${day}` : `${day} · ${time}`
}

// ── Score picker ───────────────────────────────────────────────────────────
function PickForm({ mowFixtureId, playerId, existing, onSaved }: {
  mowFixtureId: string; playerId: string
  existing: MowPrediction | null
  onSaved: (p: MowPrediction) => void
}) {
  // null = untouched (renders as dash). Once the fella taps + / -, we
  // initialise to the sensible starting value. Avoids the "1-1 looks
  // pre-submitted" confusion flagged 26 Jul.
  const [home, setHome] = useState<number | null>(existing?.home_score ?? null)
  const [away, setAway] = useState<number | null>(existing?.away_score ?? null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (existing) { setHome(existing.home_score); setAway(existing.away_score) }
  }, [existing?.id])

  const clamp = (n: number) => Math.max(0, Math.min(10, n))
  const bumpHome = (delta: number) => setHome(v => clamp((v ?? 0) + delta))
  const bumpAway = (delta: number) => setAway(v => clamp((v ?? 0) + delta))

  async function save() {
    if (home == null || away == null) return
    setSaving(true); setErr(null)
    const row = { mow_fixture_id: mowFixtureId, player_id: playerId, home_score: home, away_score: away }
    const { data, error } = await supabase.from('mow_predictions')
      .upsert(row, { onConflict: 'mow_fixture_id,player_id' })
      .select('id, mow_fixture_id, player_id, home_score, away_score, points_awarded')
      .single()
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved(data as MowPrediction)
  }

  const complete = home != null && away != null
  const dirty = !existing || (complete && (existing.home_score !== home || existing.away_score !== away))
  const canSubmit = complete && dirty

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2, var(--color-bg))', fontFamily: MONO }}>
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: TT_YELLOW }}>
          {existing ? '✓ Your pick — tap to change' : '✎ Predict the score'}
        </span>
      </div>
      <div className="px-3 py-3 flex items-center justify-around gap-3">
        <Stepper value={home} onChange={bumpHome} label="HOME" />
        <div style={{ fontFamily: MONO, fontSize: 22, color: 'var(--color-text-muted)' }}>–</div>
        <Stepper value={away} onChange={bumpAway} label="AWAY" />
      </div>
      <div className="px-3 pb-3 text-[10px] text-center" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>
        Scoring: <span style={{ color: TT_YELLOW, fontWeight: 700 }}>5</span> exact ·
        <span style={{ color: TT_CYAN, fontWeight: 700 }}> 3</span> right result ·
        <span style={{ color: 'var(--color-text-muted)' }}> 0</span> wrong
      </div>
      {err && (
        <div className="px-3 pb-2 text-[11px]" style={{ color: TT_RED }}>{err}</div>
      )}
      <div className="px-3 pb-3">
        <button
          onClick={save}
          disabled={saving || !canSubmit}
          className="w-full py-2.5 rounded-lg font-semibold text-sm"
          style={{
            background: canSubmit ? 'var(--color-primary)' : 'var(--color-surface-2, var(--color-bg))',
            color: canSubmit ? '#FFFFFF' : 'var(--color-text-muted)',
            border: '1px solid ' + (canSubmit ? 'var(--color-primary)' : 'var(--color-border)'),
            opacity: saving ? 0.6 : 1,
            transition: 'all 0.15s',
          }}
        >
          {saving
            ? 'Saving…'
            : !complete
              ? 'Set both scores to submit'
              : existing
                ? (dirty ? 'Update pick' : 'Pick saved')
                : 'Submit pick'}
        </button>
      </div>
    </div>
  )
}

function Stepper({ value, onChange, label }: {
  value: number | null
  onChange: (delta: number) => void
  label: string
}) {
  const touched = value != null
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)', fontFamily: MONO, letterSpacing: '0.1em' }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <StepBtn onClick={() => onChange(-1)} disabled={touched && value! <= 0} label="−" />
        <span style={{
          fontFamily: MONO, fontSize: 32, fontWeight: 700,
          color: touched ? TT_YELLOW : 'var(--color-text-muted)',
          minWidth: 40, textAlign: 'center', lineHeight: 1,
          opacity: touched ? 1 : 0.5,
        }}>
          {touched ? value : '–'}
        </span>
        <StepBtn onClick={() => onChange(+1)} disabled={touched && value! >= 10} label="+" />
      </div>
    </div>
  )
}
function StepBtn({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded-full active:opacity-60 transition-opacity"
      style={{
        width: 34, height: 34,
        background: disabled ? 'var(--color-surface-2, var(--color-bg))' : 'var(--color-surface)',
        color: disabled ? 'var(--color-text-muted)' : 'var(--color-text)',
        border: '1px solid var(--color-border)',
        fontSize: 20, fontWeight: 700, lineHeight: 1,
      }}
      aria-label={label === '+' ? 'Add one' : 'Subtract one'}
    >
      {label}
    </button>
  )
}

// ── Locked (past kickoff, no result yet) ───────────────────────────────────
function LockedCard({ myPick }: { myPick: MowPrediction | null }) {
  return (
    <div className="rounded-2xl px-3 py-3 text-center"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: TT_MAGENTA, fontFamily: MONO }}>
        🔒 Locked — awaiting result
      </p>
      {myPick ? (
        <p className="text-sm mt-1.5" style={{ color: 'var(--color-text)' }}>
          Your pick: <strong style={{ color: TT_YELLOW, fontFamily: MONO }}>
            {myPick.home_score}–{myPick.away_score}
          </strong>
        </p>
      ) : (
        <p className="text-sm mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
          No pick submitted this week.
        </p>
      )}
    </div>
  )
}

// ── Settled (final score in, points computed) ──────────────────────────────
function SettledCard({ pool, myPick }: { pool: PoolFixture; myPick: MowPrediction | null }) {
  const pts = myPick?.points_awarded ?? 0
  const tone = pts === 5 ? TT_YELLOW : pts === 3 ? TT_CYAN : TT_RED
  const label = pts === 5 ? 'EXACT SCORE!' : pts === 3 ? 'RIGHT RESULT' : 'MISSED'
  return (
    <div className="rounded-2xl px-3 py-3 text-center"
      style={{ background: 'var(--color-surface)', border: `1px solid var(--color-border)` }}>
      {myPick ? (
        <>
          <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: tone, fontFamily: MONO }}>
            {label} · +{pts} pts
          </p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--color-text)' }}>
            Your pick: <strong style={{ color: TT_CYAN, fontFamily: MONO }}>
              {myPick.home_score}–{myPick.away_score}
            </strong>
            {' · '}
            Actual: <strong style={{ color: TT_YELLOW, fontFamily: MONO }}>
              {pool.home_score}–{pool.away_score}
            </strong>
          </p>
        </>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No pick submitted — final: <strong style={{ color: TT_YELLOW, fontFamily: MONO }}>
            {pool.home_score}–{pool.away_score}
          </strong>
        </p>
      )}
    </div>
  )
}

// ── This-week leaderboard ──────────────────────────────────────────────────
function WeeklyLeaderboard({ rows, meId, phase }: {
  rows: WeeklyRow[]; meId: string | undefined
  phase: 'open'|'locked'|'settled'
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl px-3 py-3 text-center"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>
          {phase === 'open' ? 'Be the first fella in with a pick.' : 'No picks were submitted this week.'}
        </p>
      </div>
    )
  }
  // Order:
  //   Settled → by points desc (already sorted by the view)
  //   Open/Locked → by name (points don't exist yet, hide the column)
  const showPoints = phase === 'settled'
  const sorted = showPoints ? rows : [...rows].sort((a, b) => a.display_name.localeCompare(b.display_name))

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2, var(--color-bg))', fontFamily: MONO }}>
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: TT_CYAN }}>
          {showPoints ? 'This week — settled' : `${rows.length} picks in`}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {showPoints ? 'PTS' : ''}
        </span>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {sorted.map((r, i) => {
          const isMe = r.player_id === meId
          const pts = r.points_awarded
          const tone = pts === 5 ? TT_YELLOW : pts === 3 ? TT_CYAN : pts === 0 ? 'var(--color-text-muted)' : 'var(--color-text-muted)'
          return (
            <div key={r.player_id}
              className="grid gap-2 px-3 py-1.5 items-center"
              style={{
                gridTemplateColumns: showPoints ? '1fr auto auto' : '1fr auto',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                background: isMe ? 'rgba(14,116,144,0.10)' : 'transparent',
                fontSize: 13,
              }}
            >
              <span className="truncate" style={{
                color: isMe ? TT_CYAN : 'var(--color-text)', fontWeight: isMe ? 700 : 400,
              }}>{r.display_name}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-muted)' }}>
                {r.home_score}–{r.away_score}
              </span>
              {showPoints && (
                <span style={{ fontFamily: MONO, fontSize: 12, color: tone, fontWeight: 700, minWidth: 24, textAlign: 'right' }}>
                  {pts != null ? `+${pts}` : '—'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Season leaderboard ─────────────────────────────────────────────────────
function SeasonLeaderboard({ rows, meId }: { rows: SeasonRow[]; meId: string | undefined }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="px-3 py-2 grid gap-2 items-center"
        style={{
          gridTemplateColumns: '18px 1fr 30px 30px 34px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-2, var(--color-bg))',
          fontFamily: MONO,
        }}>
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: TT_CYAN }}>#</span>
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: TT_CYAN }}>Season</span>
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-muted)', textAlign: 'right' }}>P</span>
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-muted)', textAlign: 'right' }} title="Exact scores">E</span>
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: TT_YELLOW, textAlign: 'right' }}>PTS</span>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {rows.map((r, i) => {
          const isMe = r.player_id === meId
          const rank = i + 1
          const isTop = rank <= 3
          return (
            <div key={r.player_id}
              className="grid gap-2 px-3 py-1.5 items-center"
              style={{
                gridTemplateColumns: '18px 1fr 30px 30px 34px',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
                background: isTop ? 'rgba(201,162,39,0.08)' : isMe ? 'rgba(14,116,144,0.10)' : 'transparent',
                fontSize: 13,
              }}
            >
              <span style={{ color: isTop ? TT_YELLOW : 'var(--color-text-muted)', fontSize: 11, fontWeight: isTop ? 700 : 400, fontFamily: MONO }}>
                {String(rank).padStart(2, '0')}
              </span>
              <span className="truncate" style={{
                color: isTop ? TT_YELLOW : isMe ? TT_CYAN : 'var(--color-text)',
                fontWeight: isTop || isMe ? 700 : 400,
              }}>{r.display_name}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'right' }}>
                {r.picks_settled}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: r.exact_count > 0 ? TT_YELLOW : 'var(--color-text-muted)', textAlign: 'right', fontWeight: r.exact_count > 0 ? 700 : 400 }}>
                {r.exact_count}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: isTop ? TT_YELLOW : TT_CYAN, fontWeight: 700, textAlign: 'right' }}>
                {r.total_pts}
              </span>
            </div>
          )
        })}
      </div>
      <div className="px-3 py-1.5 text-[10px]" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontFamily: MONO, textAlign: 'center' }}>
        P = picks settled · E = exact scores · PTS = season total
      </div>
    </div>
  )
}

// ── No-fixture-yet preview (holds shape until Monday's picker fires) ──────
function PreviewCard() {
  return (
    <div className="mt-2 rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="px-4 pt-5 pb-3 text-center">
        <div style={{ fontSize: 42, lineHeight: 1 }}>🎯</div>
        <p className="text-xs uppercase tracking-widest font-semibold mt-3"
          style={{ color: TT_GREEN, letterSpacing: '0.12em' }}>
          Live · Free to play
        </p>
        <h2 className="font-display tracking-wide mt-1" style={{ color: 'var(--color-text)', fontSize: 24, lineHeight: 1.1 }}>
          Match of the Week
        </h2>
        <p className="text-sm mt-2 mx-auto" style={{ color: 'var(--color-text-muted)', maxWidth: 320 }}>
          Next fixture drops Monday morning. Auto-picked from the weekend slate,
          weighted by which club you support.
        </p>
      </div>
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-2, var(--color-bg))' }}>
        <p className="text-[10px] uppercase font-semibold tracking-widest mb-2"
          style={{ color: 'var(--color-text-muted)' }}>
          How it works
        </p>
        <ul className="space-y-1.5">
          {[
            'One PL / Championship fixture per week, published Monday',
            'Pick a scoreline before kickoff',
            '5 pts exact · 3 pts right result · 0 wrong',
            'Running season leaderboard — bragging rights only',
          ].map((line, i) => (
            <li key={i} className="text-xs flex items-start gap-2" style={{ color: 'var(--color-text)' }}>
              <span style={{ color: TT_CYAN, flexShrink: 0 }}>▸</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
