import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Match, Team, Fixture, Profile, Result } from '../types'
import { stripFC } from '../lib/format'

interface RosterPlayer {
  id: string
  name: string
  surname: string
  team_id: string
}

// One slot = one goal. Slot count per team per fixture is locked to that
// team's score, so we can't ever over-attribute. Hat-tricks are 3 slots all
// pointing at the same player. Was previously a free ScorerRow with goals_count
// — that allowed over/under-attribution and had a delete-all-and-re-insert save
// pattern that lost in-progress edits on parent re-renders.
interface Slot {
  rowId: string
  player_id: string  // '' until picked
  own_goal: boolean  // when true, dropdown shows the OTHER team's roster
}

interface FixtureSlots {
  team1: Slot[]  // length === fixture.score1 (0 if score null)
  team2: Slot[]  // length === fixture.score2
}

const newSlot = (): Slot => ({ rowId: crypto.randomUUID(), player_id: '', own_goal: false })

// Resize a slot array to `target` length: append empty slots if growing,
// drop tail if shrinking. Preserves any already-filled prefix.
function resizeSlots(current: Slot[], target: number): Slot[] {
  if (target < 0) target = 0
  if (current.length === target) return current
  if (current.length > target) return current.slice(0, target)
  return [...current, ...Array.from({ length: target - current.length }, newSlot)]
}

function scorerSummary(slots: Slot[], roster: RosterPlayer[]): string {
  const tally: Record<string, number> = {}
  const ogTally: Record<string, number> = {}
  for (const s of slots) {
    if (!s.player_id) continue
    const bucket = s.own_goal ? ogTally : tally
    bucket[s.player_id] = (bucket[s.player_id] ?? 0) + 1
  }
  const fmt = (pid: string, n: number, og: boolean) => {
    const p = roster.find(x => x.id === pid)
    const label = p ? `${p.name} ${p.surname}` : 'Unknown'
    const suffix = og ? ' OG' : ''
    return n > 1 ? `${label} ${n}${suffix}` : `${label}${suffix}`
  }
  return [
    ...Object.entries(tally).map(([pid, n]) => fmt(pid, n, false)),
    ...Object.entries(ogTally).map(([pid, n]) => fmt(pid, n, true)),
  ].join(', ')
}

interface FixtureWithTeams extends Fixture {
  team1: Team
  team2: Team
}

interface Props {
  match: Match | null
  teams: Team[]
  fixtures: FixtureWithTeams[]
  result: Result | null
  onSaved: () => void
  // Admin path passes true (default). Delegate path (can_enter_results
  // without is_admin) passes false: report/highlights inputs are hidden
  // and those fields are omitted from the save payload. Backstopped by
  // a DB trigger (results_protect_narrative, migration 034).
  canWriteReport?: boolean
}

interface GroupRow {
  team: Team
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  pts: number
}

function buildTable(teams: Team[], fixtures: FixtureWithTeams[]): GroupRow[] {
  const rows: Record<string, GroupRow> = {}
  for (const t of teams) {
    rows[t.id] = { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 }
  }
  for (const f of fixtures) {
    // A fixture counts as played as soon as one side has a score recorded —
    // a null on the other side means 0 (admin tapped + on one stepper only).
    if (f.score1 == null && f.score2 == null) continue
    const s1 = f.score1 ?? 0
    const s2 = f.score2 ?? 0
    const t1 = rows[f.team1_id]
    const t2 = rows[f.team2_id]
    if (!t1 || !t2) continue
    t1.played++; t2.played++
    t1.gf += s1; t1.ga += s2
    t2.gf += s2; t2.ga += s1
    if (s1 > s2) { t1.won++; t1.pts += 3; t2.lost++ }
    else if (s1 < s2) { t2.won++; t2.pts += 3; t1.lost++ }
    else {
      t1.drawn++; t1.pts++; t2.drawn++; t2.pts++
      // Drawn fixture → penalty shootout: winner takes a bonus point (migration 035).
      if (f.shootout_winner === 1) t1.pts++
      else if (f.shootout_winner === 2) t2.pts++
    }
  }
  return Object.values(rows).sort((a, b) => b.pts !== a.pts ? b.pts - a.pts : (b.gf - b.ga) - (a.gf - a.ga))
}

function SlotSection({
  label,
  slots,
  ownTeam,
  otherTeam,
  roster,
  onPick,
  onToggleOG,
}: {
  label: string
  slots: Slot[]
  ownTeam: Team
  otherTeam?: Team
  roster: RosterPlayer[]
  onPick: (rowId: string, playerId: string) => void
  onToggleOG: (rowId: string) => void
}) {
  const ownPlayers = roster.filter(p => p.team_id === ownTeam.id)
  const otherPlayers = otherTeam ? roster.filter(p => p.team_id === otherTeam.id) : []
  const filled = slots.filter(s => !!s.player_id).length
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          {label} goals
        </span>
        <span
          className="text-[10px] font-mono"
          style={{ color: filled === slots.length ? 'var(--color-success-text, #4ADC7A)' : 'var(--color-text-muted)' }}
        >
          {filled}/{slots.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {slots.map((slot, i) => {
          // Own-goal slots show the OPPOSITE team's roster (an OG is committed
          // by a defender on the conceding team).
          const players = slot.own_goal ? otherPlayers : ownPlayers
          const empty = !slot.player_id
          return (
            <div key={slot.rowId} className="flex items-center gap-2">
              <span className="w-5 text-[10px] font-mono text-right" style={{ color: 'var(--color-text-muted)' }}>{i + 1}.</span>
              <select
                value={slot.player_id}
                onChange={e => onPick(slot.rowId, e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{
                  background: 'var(--color-surface)',
                  color: empty ? 'var(--color-text-muted)' : 'var(--color-text)',
                  border: `1px solid ${empty ? 'var(--color-border)' : 'var(--color-primary)'}`,
                }}
              >
                <option value="">— scorer —</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.name} {p.surname}</option>)}
              </select>
              <button
                type="button"
                onClick={() => onToggleOG(slot.rowId)}
                className="text-[10px] font-semibold px-2 py-1.5 rounded-lg"
                style={{
                  background: slot.own_goal ? 'var(--color-warning-bg)' : 'var(--color-surface)',
                  color: slot.own_goal ? 'var(--color-warning-text)' : 'var(--color-text-muted)',
                  border: `1px solid ${slot.own_goal ? '#C9A227' : 'var(--color-border)'}`,
                }}
                aria-label="Toggle own goal"
                title={slot.own_goal ? 'Own goal (scored by opposite team)' : 'Mark as own goal'}
              >
                OG
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AdminMatchEntry({ match, teams, fixtures: initialFixtures, result: initialResult, onSaved, canWriteReport = true }: Props) {
  const isElevenVEleven = match?.format === '11v11' || teams.length <= 2
  const [fixtures, setFixtures] = useState<FixtureWithTeams[]>(initialFixtures)
  const [reportText, setReportText] = useState(initialResult?.report_text ?? '')
  const [highlights, setHighlights] = useState(initialResult?.highlights ?? '')
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [fixtureScorers, setFixtureScorers] = useState<Record<string, FixtureSlots>>({})
  const [hydrated, setHydrated] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [autosaveError, setAutosaveError] = useState<string | null>(null)
  const [autosaveTick, setAutosaveTick] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [fixturesError, setFixturesError] = useState<string | null>(null)
  const [regenConfirm, setRegenConfirm] = useState(false)
  const generatingRef = useRef(false)

  const table = buildTable(teams, fixtures)

  // Hydrate roster + existing goals ONCE per match. The previous version
  // re-ran on every change of the `teams` prop (a new reference on each
  // parent render), which clobbered in-progress scorer entries. Roster
  // also gets re-fetched if the team_id set genuinely changes.
  const teamIdsKey = teams.map(t => t.id).sort().join(',')
  useEffect(() => {
    if (!match?.id || !teamIdsKey) { setRoster([]); setHydrated(true); return }
    let cancelled = false
    async function load() {
      const teamIds = teamIdsKey.split(',')
      const { data: tp } = await supabase
        .from('team_players')
        .select('team_id, player_id, profiles!inner(id, name, surname)')
        .in('team_id', teamIds)
      if (cancelled) return
      const rows = ((tp as unknown as { team_id: string; profiles: Pick<Profile, 'id' | 'name' | 'surname'> }[]) || [])
        .map(r => ({ id: r.profiles.id, name: r.profiles.name, surname: r.profiles.surname, team_id: r.team_id }))
        .sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, undefined, { sensitivity: 'base' }))
      setRoster(rows)

      const { data: g } = await supabase
        .from('goals')
        .select('player_id, goals_count, own_goal, fixture_id, team_id')
        .eq('match_id', match!.id)
      if (cancelled) return

      // Expand each goal row (which may have goals_count > 1) into individual
      // slots, then bucket into team1/team2 of the relevant fixture. A slot's
      // bucket is determined by who it scored FOR — i.e. team_id (player team)
      // for normal goals, opposite team for own goals.
      const initial: Record<string, FixtureSlots> = {}
      for (const f of fixtures) {
        initial[f.id] = { team1: [], team2: [] }
      }
      type GoalRow = { player_id: string; goals_count: number; own_goal: boolean; fixture_id: string | null; team_id: string | null }
      for (const r of (g as GoalRow[]) || []) {
        if (!r.fixture_id) continue
        const fx = fixtures.find(x => x.id === r.fixture_id)
        if (!fx) continue
        // A normal goal credits the player's team; an OG credits the opposite team.
        const creditedTeamId = r.own_goal
          ? (r.team_id === fx.team1.id ? fx.team2.id : fx.team1.id)
          : r.team_id
        const bucket: 'team1' | 'team2' = creditedTeamId === fx.team1.id ? 'team1' : 'team2'
        const count = Math.max(1, r.goals_count)
        for (let i = 0; i < count; i++) {
          initial[r.fixture_id][bucket].push({ rowId: crypto.randomUUID(), player_id: r.player_id, own_goal: r.own_goal })
        }
      }

      // Pad/truncate to match current scores so slot counts always === scores
      for (const f of fixtures) {
        initial[f.id].team1 = resizeSlots(initial[f.id].team1, f.score1 ?? 0)
        initial[f.id].team2 = resizeSlots(initial[f.id].team2, f.score2 ?? 0)
      }

      setFixtureScorers(initial)
      setHydrated(true)
    }
    load()
    return () => { cancelled = true }
  // fixtures intentionally excluded — only re-hydrate when the match or roster genuinely changes;
  // score-stepper code resizes slot arrays in place so we don't lose entries.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, teamIdsKey])

  function setSlotPlayer(fixtureId: string, team: 'team1' | 'team2', rowId: string, playerId: string) {
    setFixtureScorers(prev => {
      const slots = prev[fixtureId] ?? { team1: [], team2: [] }
      return {
        ...prev,
        [fixtureId]: { ...slots, [team]: slots[team].map(s => s.rowId === rowId ? { ...s, player_id: playerId } : s) },
      }
    })
  }
  function toggleSlotOG(fixtureId: string, team: 'team1' | 'team2', rowId: string) {
    setFixtureScorers(prev => {
      const slots = prev[fixtureId] ?? { team1: [], team2: [] }
      return {
        ...prev,
        [fixtureId]: { ...slots, [team]: slots[team].map(s => s.rowId === rowId ? { ...s, own_goal: !s.own_goal, player_id: '' } : s) },
      }
    })
  }

  function renderFixtureScorers(fixtureId: string, team1?: Team, team2?: Team) {
    const slots = fixtureScorers[fixtureId] ?? { team1: [], team2: [] }
    if (slots.team1.length === 0 && slots.team2.length === 0) return null
    return (
      <div className="mt-3 space-y-3">
        {team1 && slots.team1.length > 0 && (
          <SlotSection
            label={stripFC(team1.name)}
            slots={slots.team1}
            ownTeam={team1}
            otherTeam={team2}
            roster={roster}
            onPick={(rowId, pid) => setSlotPlayer(fixtureId, 'team1', rowId, pid)}
            onToggleOG={rowId => toggleSlotOG(fixtureId, 'team1', rowId)}
          />
        )}
        {team2 && slots.team2.length > 0 && (
          <SlotSection
            label={stripFC(team2.name)}
            slots={slots.team2}
            ownTeam={team2}
            otherTeam={team1}
            roster={roster}
            onPick={(rowId, pid) => setSlotPlayer(fixtureId, 'team2', rowId, pid)}
            onToggleOG={rowId => toggleSlotOG(fixtureId, 'team2', rowId)}
          />
        )}
      </div>
    )
  }

  // Flatten current state into goal rows (1 slot = 1 goal, goals_count always 1).
  function slotsToGoalRows(): Array<{ match_id: string; fixture_id: string; player_id: string; team_id: string | null; goals_count: number; own_goal: boolean }> {
    if (!match?.id) return []
    const out: Array<{ match_id: string; fixture_id: string; player_id: string; team_id: string | null; goals_count: number; own_goal: boolean }> = []
    for (const f of fixtures) {
      const sl = fixtureScorers[f.id]
      if (!sl) continue
      for (const s of [...sl.team1, ...sl.team2]) {
        if (!s.player_id) continue
        const playerTeamId = roster.find(p => p.id === s.player_id)?.team_id ?? null
        out.push({
          match_id: match.id,
          fixture_id: f.id,
          player_id: s.player_id,
          team_id: playerTeamId,
          goals_count: 1,
          own_goal: s.own_goal,
        })
      }
    }
    return out
  }

  function allSlotsForSummary(): Slot[] {
    return Object.values(fixtureScorers).flatMap(sl => [...sl.team1, ...sl.team2])
  }

  function ScoreStepper({ fixtureId, field, value }: { fixtureId: string; field: 'score1' | 'score2'; value: number | null }) {
    const current = value ?? 0
    return (
      <div
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
      >
        <button
          type="button"
          onClick={() => updateFixtureScore(fixtureId, field, String(Math.max(0, current - 1)))}
          className="w-7 h-7 rounded flex items-center justify-center"
          style={{ color: 'var(--tt-yellow)', fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, background: 'transparent' }}
          aria-label="Decrement"
        >
          −
        </button>
        <span
          className="text-center"
          style={{ color: 'var(--tt-yellow)', fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, minWidth: 18 }}
        >
          {current}
        </span>
        <button
          type="button"
          onClick={() => updateFixtureScore(fixtureId, field, String(current + 1))}
          className="w-7 h-7 rounded flex items-center justify-center"
          style={{ color: 'var(--tt-yellow)', fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, background: 'transparent' }}
          aria-label="Increment"
        >
          +
        </button>
      </div>
    )
  }

  async function updateFixtureScore(fixtureId: string, field: 'score1' | 'score2', value: string) {
    const num = value === '' ? null : parseInt(value)
    const prevFixture = fixtures.find(f => f.id === fixtureId)
    const otherField: 'score1' | 'score2' = field === 'score1' ? 'score2' : 'score1'
    const otherCurrent = prevFixture?.[otherField] ?? null

    // Walked the score back to 0 (or null) while the other side is also 0
    // (typically because the other side was eagerly defaulted by an earlier
    // +1 tap). Reset BOTH sides to null so the live table treats the
    // fixture as "not played" again. Trade-off: this prevents the steppers
    // from ever expressing a real 0-0 result; rare enough at WF that the
    // bug fix is worth it. Add an explicit "Mark 0-0" affordance later if
    // it ever bites.
    const bothEffectivelyZero = (num ?? 0) === 0 && (otherCurrent ?? 0) === 0
    // Tapping +1 on a fresh fixture: explicitly write 0 to the other side
    // so the live table treats it as played (single-tap 1-0 / 0-1 wins).
    const shouldDefaultOther = num != null && num > 0 && otherCurrent == null

    const update: Partial<{ score1: number | null; score2: number | null; shootout_winner: number | null }> = bothEffectivelyZero
      ? { score1: null, score2: null, shootout_winner: null }
      : { [field]: num, ...(shouldDefaultOther ? { [otherField]: 0 } : {}) }

    // A recorded shootout winner only makes sense for a level fixture. If this
    // edit leaves it non-level (a win, or one side blank), drop the winner.
    const nextS1 = 'score1' in update ? update.score1 : (prevFixture?.score1 ?? null)
    const nextS2 = 'score2' in update ? update.score2 : (prevFixture?.score2 ?? null)
    const stillDraw = nextS1 != null && nextS2 != null && nextS1 === nextS2
    if (!stillDraw && prevFixture?.shootout_winner != null) update.shootout_winner = null

    setFixtures(prev => prev.map(f => f.id === fixtureId ? { ...f, ...update } : f))
    setScoreError(null)
    // Resize slot arrays in step with the new scores. Slot count for a
    // team === its score (null counts as 0). Preserves the leading filled
    // slots when shrinking.
    const finalScore1 = 'score1' in update ? update.score1 : prevFixture?.score1
    const finalScore2 = 'score2' in update ? update.score2 : prevFixture?.score2
    setFixtureScorers(prev => {
      const cur = prev[fixtureId] ?? { team1: [], team2: [] }
      return {
        ...prev,
        [fixtureId]: {
          team1: resizeSlots(cur.team1, finalScore1 ?? 0),
          team2: resizeSlots(cur.team2, finalScore2 ?? 0),
        },
      }
    })
    const { error } = await supabase.from('fixtures').update(update).eq('id', fixtureId)
    if (error) {
      console.error('Score update failed:', error)
      setScoreError(`Score not saved: ${error.message}`)
      if (prevFixture) {
        // Roll back both fields to their prior state — the update may have
        // touched either or both depending on which branch above fired.
        setFixtures(prev => prev.map(f => f.id === fixtureId
          ? { ...f, score1: prevFixture.score1, score2: prevFixture.score2 }
          : f))
      }
    }
  }

  // Record the penalty-shootout winner for a drawn fixture (1 = team1, 2 = team2).
  // Tapping the already-selected team clears it. Persists immediately.
  async function setShootoutWinner(fixtureId: string, winner: 1 | 2) {
    const prevFixture = fixtures.find(f => f.id === fixtureId)
    const next = prevFixture?.shootout_winner === winner ? null : winner
    setFixtures(prev => prev.map(f => f.id === fixtureId ? { ...f, shootout_winner: next } : f))
    setScoreError(null)
    const { error } = await supabase.from('fixtures').update({ shootout_winner: next }).eq('id', fixtureId)
    if (error) {
      console.error('Shootout winner update failed:', error)
      setScoreError(`Shootout result not saved: ${error.message}`)
      if (prevFixture) setFixtures(prev => prev.map(f => f.id === fixtureId ? { ...f, shootout_winner: prevFixture.shootout_winner } : f))
    }
  }

  // Record a genuine 0-0 draw. The score steppers deliberately can't express
  // 0-0 (walking both sides to zero resets the fixture to "not played"), so this
  // is the explicit way in — needed now that a 0-0 also goes to penalties.
  async function markZeroDraw(fixtureId: string) {
    const prevFixture = fixtures.find(f => f.id === fixtureId)
    setFixtures(prev => prev.map(f => f.id === fixtureId ? { ...f, score1: 0, score2: 0 } : f))
    setFixtureScorers(prev => ({ ...prev, [fixtureId]: { team1: [], team2: [] } }))
    setScoreError(null)
    const { error } = await supabase.from('fixtures').update({ score1: 0, score2: 0 }).eq('id', fixtureId)
    if (error) {
      console.error('0-0 mark failed:', error)
      setScoreError(`Score not saved: ${error.message}`)
      if (prevFixture) setFixtures(prev => prev.map(f => f.id === fixtureId ? { ...f, score1: prevFixture.score1, score2: prevFixture.score2 } : f))
    }
  }

  // Penalties affordance shown under each fixture's score row. For a not-yet-played
  // fixture it's the "mark 0-0" entry; for a level result it's the winner picker.
  function renderPenalties(f: FixtureWithTeams) {
    const played = f.score1 != null && f.score2 != null
    if (!played) {
      if (f.score1 == null && f.score2 == null) {
        return (
          <button
            type="button"
            onClick={() => markZeroDraw(f.id)}
            className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-medium"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', fontFamily: 'var(--font-mono)' }}
          >
            · mark 0-0 draw (→ penalties) ·
          </button>
        )
      }
      return null
    }
    if (f.score1 !== f.score2) return null
    const needsWinner = f.shootout_winner == null
    return (
      <div className="mt-2 rounded-xl px-3 py-2 flex items-center gap-2"
        style={{ background: 'var(--color-surface-2)', border: `1px solid ${needsWinner ? '#C9A227' : 'var(--color-border)'}` }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: needsWinner ? 'var(--color-warning-text)' : 'var(--color-text-muted)' }}>
          {needsWinner ? 'Penalties — pick winner' : 'Penalties'}
        </span>
        <div className="flex gap-1.5 flex-1 justify-end">
          {([1, 2] as const).map(w => {
            const team = w === 1 ? f.team1 : f.team2
            const sel = f.shootout_winner === w
            return (
              <button
                key={w}
                type="button"
                onClick={() => setShootoutWinner(f.id, w)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                style={{
                  background: sel ? 'var(--tt-yellow)' : 'var(--color-surface)',
                  color: sel ? '#0F1710' : 'var(--color-text-muted)',
                  border: `1px solid ${sel ? 'var(--tt-yellow)' : 'var(--color-border)'}`,
                }}
              >
                {stripFC(team?.name)}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Debounced auto-save: any change to fixtureScorers (slot edits, OG toggles,
  // score-stepper-driven resizes) writes the current goal set to the DB ~600ms
  // later. Replaces the previous "big save" button that nuked all rows and
  // re-inserted them, which both lost in-progress edits and required the user
  // to remember to press save.
  //
  // Strategy: delete + insert all goals for the match in one transaction-ish
  // sequence. Cheap (≤16 rows for a 4-team tournament) and trivially correct.
  useEffect(() => {
    if (!hydrated || !match?.id) return
    setAutosaveTick('saving')
    setAutosaveError(null)
    const handle = setTimeout(async () => {
      const rows = slotsToGoalRows()
      const { error: delErr } = await supabase.from('goals').delete().eq('match_id', match.id)
      if (delErr) {
        setAutosaveError(`Scorers not saved: ${delErr.message}`)
        setAutosaveTick('idle')
        return
      }
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('goals').insert(rows)
        if (insErr) {
          setAutosaveError(`Scorers not saved: ${insErr.message}`)
          setAutosaveTick('idle')
          return
        }
      }
      setAutosaveTick('saved')
      // Drop the "saved" indicator after a beat
      setTimeout(() => setAutosaveTick(t => t === 'saved' ? 'idle' : t), 1500)
    }, 600)
    return () => clearTimeout(handle)
  // slotsToGoalRows is stable enough — it reads from state that's already in deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtureScorers, hydrated, match?.id])

  // Scores + scorers are already auto-saved continuously. Submit is the
  // explicit commit: writes the results row (narrative for admin, just the
  // scorers summary for delegate), then flips match.status='completed'.
  async function submitResults() {
    if (!match?.id) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const scorersText = scorerSummary(allSlotsForSummary(), roster)
      // Delegate path (canWriteReport === false) skips narrative fields;
      // typed as a shared partial so the .update/.insert calls don't get
      // a union type that TS narrows too aggressively.
      const payload: { match_id: string; scorers: string; report_text?: string; highlights?: string } = canWriteReport
        ? { match_id: match.id, report_text: reportText, scorers: scorersText, highlights }
        : { match_id: match.id, scorers: scorersText }
      if (initialResult?.id) {
        const { error } = await supabase.from('results').update(payload).eq('id', initialResult.id)
        if (error) throw new Error(`Couldn't update result: ${error.message}`)
      } else {
        const { error } = await supabase.from('results').insert(payload)
        if (error) throw new Error(`Couldn't save result: ${error.message}`)
      }
      const { error: matchErr } = await supabase.from('matches').update({ status: 'completed' }).eq('id', match.id)
      if (matchErr) throw new Error(`Couldn't mark match completed: ${matchErr.message}`)
      setConfirmSubmit(false)
      onSaved()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Submit failed:', e)
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // A fixture is "complete" when both scores are set AND every allocated slot
  // has a player chosen. Submit is gated on all played fixtures being complete.
  function fixtureCompletion(f: FixtureWithTeams): { played: boolean; total: number; filled: number; shootoutPending: boolean } {
    const played = f.score1 != null && f.score2 != null
    const slots = fixtureScorers[f.id]
    const total = (slots?.team1.length ?? 0) + (slots?.team2.length ?? 0)
    const filled = [...(slots?.team1 ?? []), ...(slots?.team2 ?? [])].filter(s => !!s.player_id).length
    // A drawn fixture must have its penalty-shootout winner recorded before submit.
    const shootoutPending = played && f.score1 === f.score2 && f.shootout_winner == null
    return { played, total, filled, shootoutPending }
  }
  const completion = fixtures.map(f => ({ f, ...fixtureCompletion(f) }))
  const allReady = completion.length > 0 && completion.every(({ played, total, filled, shootoutPending }) => played && filled === total && !shootoutPending)
  const shootoutPendingCount = completion.filter(c => c.shootoutPending).length

  function roundRobinRows(matchId: string): { match_id: string; team1_id: string; team2_id: string }[] {
    const rows: { match_id: string; team1_id: string; team2_id: string }[] = []
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        rows.push({ match_id: matchId, team1_id: teams[i].id, team2_id: teams[j].id })
      }
    }
    return rows
  }

  async function generateFixtures() {
    if (!match?.id || teams.length < 2) return
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    setFixturesError(null)

    try {
      const { data: existing, error: checkErr } = await supabase
        .from('fixtures')
        .select('id')
        .eq('match_id', match.id)
        .limit(1)
      if (checkErr) throw checkErr
      if (existing && existing.length > 0) {
        setFixturesError('Fixtures already generated for this match — use Regenerate to replace.')
        return
      }

      const { error: insertErr } = await supabase.from('fixtures').insert(roundRobinRows(match.id))
      if (insertErr) {
        if (insertErr.code === '23505') {
          setFixturesError('Fixtures already generated for this match — use Regenerate to replace.')
        } else {
          setFixturesError(`Couldn't generate fixtures: ${insertErr.message}`)
        }
        return
      }
      onSaved()
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  async function regenerateFixtures() {
    if (!match?.id || teams.length < 2) return
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    setFixturesError(null)
    setRegenConfirm(false)

    try {
      const { error: delErr } = await supabase.from('fixtures').delete().eq('match_id', match.id)
      if (delErr) {
        setFixturesError(`Couldn't clear existing fixtures: ${delErr.message}`)
        return
      }
      const { error: insertErr } = await supabase.from('fixtures').insert(roundRobinRows(match.id))
      if (insertErr) {
        setFixturesError(`Couldn't regenerate fixtures: ${insertErr.message}`)
        return
      }
      onSaved()
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  function copyToClipboard() {
    const text = isElevenVEleven ? formatElevenReport() : formatFourTeamReport()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // "(Team won on pens)" suffix for a drawn fixture with a recorded shootout winner.
  function shootoutNote(f: FixtureWithTeams): string {
    if (f.shootout_winner !== 1 && f.shootout_winner !== 2) return ''
    const w = f.shootout_winner === 1 ? f.team1 : f.team2
    return ` (${stripFC(w?.name)} won on pens)`
  }

  function formatElevenReport(): string {
    const main = fixtures[0]
    const score = main ? `${main.score1 ?? '?'} - ${main.score2 ?? '?'}${shootoutNote(main)}` : ''
    const allScorers = scorerSummary(allSlotsForSummary(), roster)
    const lines = [
      `⚽ WF Match Report`,
      `${main?.team1?.name ?? ''} ${score} ${main?.team2?.name ?? ''}`,
      allScorers ? `\nScorers: ${allScorers}` : '',
      reportText ? `\n${reportText}` : '',
    ]
    return lines.filter(Boolean).join('\n')
  }

  function formatFourTeamReport(): string {
    const lines = ['⚽ WF Tournament Results\n']
    lines.push('📋 Group Table')
    table.forEach((row, i) => {
      lines.push(`${i + 1}. ${row.team.name} — ${row.pts}pts (${row.won}W ${row.drawn}D ${row.lost}L)`)
    })
    lines.push('\n🏟️ Results')
    fixtures.forEach(f => {
      if (f.score1 != null && f.score2 != null) {
        lines.push(`${f.team1?.name} ${f.score1} - ${f.score2} ${f.team2?.name}${shootoutNote(f)}`)
      }
    })
    return lines.join('\n')
  }

  if (teams.length === 0) {
    return (
      <div className="px-4 py-5">
        <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--color-primary)' }}>Admin</p>
        <h1 className="font-display text-3xl text-[var(--color-text)] tracking-wide mb-5">MATCH ENTRY</h1>
        <div className="text-center py-8" style={{ color: '#9CA897' }}>
          <p>No teams published yet</p>
          <p className="text-sm mt-1">Publish teams first from the Teams tab</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-5">
      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--color-primary)' }}>Admin</p>
      <h1 className="font-display text-3xl text-[var(--color-text)] tracking-wide mb-5">MATCH ENTRY</h1>

      {isElevenVEleven ? (
        // 11v11
        <div className="space-y-4">
          {fixtures.length > 0 ? (
            <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold text-[var(--color-text)] mb-3">Score</h3>
              {fixtures.map(f => (
                <div key={f.id}>
                  <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span className="flex-1 text-right text-sm" style={{ color: 'var(--color-text)' }}>{stripFC(f.team1?.name)}</span>
                    <ScoreStepper fixtureId={f.id} field="score1" value={f.score1} />
                    <span style={{ color: 'var(--color-text-muted)' }}>v</span>
                    <ScoreStepper fixtureId={f.id} field="score2" value={f.score2} />
                    <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{stripFC(f.team2?.name)}</span>
                  </div>
                  {renderFixtureScorers(f.id, f.team1, f.team2)}
                  {renderPenalties(f)}
                </div>
              ))}
            </div>
          ) : (
            <button
              onClick={generateFixtures}
              disabled={generating}
              className="w-full py-3 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              {generating ? 'Generating…' : 'Generate Fixture'}
            </button>
          )}
        </div>
      ) : (
        // 4-team tournament
        <div className="space-y-4">
          {fixturesError && (
            <div className="px-3 py-2 rounded-xl text-xs font-medium"
              style={{ background: 'var(--color-warning-bg)', color: '#92400e', border: '1px solid #C9A227' }}>
              {fixturesError}
            </div>
          )}

          {fixtures.length === 0 && (
            <button
              onClick={generateFixtures}
              disabled={generating}
              className="w-full py-3 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
            >
              {generating ? 'Generating…' : 'Generate Round-Robin Fixtures'}
            </button>
          )}

          {/* Live table */}
          {fixtures.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h3 className="font-semibold text-[var(--color-text)] text-sm">Live Table</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--color-text-muted)', background: '#F8F9F6', borderBottom: '1px solid var(--color-border)' }}>
                    <th className="py-2 text-center font-medium" style={{ width: 28, paddingLeft: 12 }}>#</th>
                    <th className="py-2 text-left font-medium" style={{ paddingLeft: 8 }}>Team</th>
                    <th className="px-2 py-2 text-center font-medium" style={{ width: 30 }}>P</th>
                    <th className="px-2 py-2 text-center font-medium" style={{ width: 30 }}>W</th>
                    <th className="px-2 py-2 text-center font-medium" style={{ width: 30 }}>D</th>
                    <th className="px-2 py-2 text-center font-medium" style={{ width: 30 }}>L</th>
                    <th className="px-2 py-2 text-center font-medium" style={{ width: 40 }}>GD</th>
                    <th className="px-2 py-2 text-center font-bold" style={{ width: 40, color: 'var(--color-text)' }}>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row, i) => (
                    <tr key={row.team.id} style={{ background: i % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg)' }}>
                      <td className="py-2.5 text-center font-medium" style={{ paddingLeft: 12, color: '#9CA897' }}>{i + 1}</td>
                      <td className="py-2.5 font-medium text-[var(--color-text)]" style={{ paddingLeft: 8 }}>{stripFC(row.team.name)}</td>
                      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.played}</td>
                      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.won}</td>
                      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.drawn}</td>
                      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.lost}</td>
                      <td className="px-2 py-2.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{row.gf - row.ga >= 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</td>
                      <td className="px-2 py-2.5 text-center font-bold" style={{ color: 'var(--color-text)' }}>{row.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Fixtures */}
          {fixtures.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h3 className="font-semibold text-[var(--color-text)] text-sm">Enter Scores</h3>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {fixtures.map(f => (
                  <div key={f.id} className="px-4 py-4">
                    <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)' }}>
                      <span className="flex-1 text-right text-xs" style={{ color: 'var(--color-text)' }}>{stripFC(f.team1?.name)}</span>
                      <ScoreStepper fixtureId={f.id} field="score1" value={f.score1} />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>v</span>
                      <ScoreStepper fixtureId={f.id} field="score2" value={f.score2} />
                      <span className="flex-1 text-xs" style={{ color: 'var(--color-text)' }}>{stripFC(f.team2?.name)}</span>
                    </div>
                    {renderFixtureScorers(f.id, f.team1, f.team2)}
                    {renderPenalties(f)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {fixtures.length > 0 && (
            regenConfirm ? (
              <div className="px-3 py-3 rounded-xl text-xs space-y-2"
                style={{ background: 'var(--color-warning-bg)', color: '#92400e', border: '1px solid #C9A227' }}>
                <p className="font-medium">Replace existing fixtures? Any scores entered will be lost.</p>
                <div className="flex gap-2">
                  <button
                    onClick={regenerateFixtures}
                    disabled={generating}
                    className="flex-1 py-2 rounded-lg font-semibold text-xs disabled:opacity-50"
                    style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}
                  >
                    {generating ? 'Regenerating…' : 'Yes, replace'}
                  </button>
                  <button
                    onClick={() => setRegenConfirm(false)}
                    disabled={generating}
                    className="flex-1 py-2 rounded-lg text-xs disabled:opacity-50"
                    style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setRegenConfirm(true)}
                disabled={generating}
                className="w-full py-2 rounded-xl text-xs font-medium disabled:opacity-50"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              >
                Regenerate Fixtures
              </button>
            )
          )}
        </div>
      )}

      {canWriteReport ? (
        <div className="space-y-4 mt-4">
          <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>Match Report</label>
            <textarea
              value={reportText}
              onChange={e => setReportText(e.target.value)}
              rows={5}
              placeholder="Write the match report here..."
              className="w-full px-3 py-2 rounded-lg text-[var(--color-text)] text-sm outline-none resize-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            />
          </div>

          <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>Highlights</label>
            <input
              type="text"
              value={highlights}
              onChange={e => setHighlights(e.target.value)}
              placeholder="Link or notes..."
              className="w-full px-3 py-2 rounded-lg text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
          Match report &amp; highlights are written by the admin afterwards. Your saved scores and scorers will appear in the report automatically.
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 space-y-2 pb-4">
        {scoreError && (
          <div className="px-3 py-2 rounded-xl text-xs font-medium"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
            ⚠ {scoreError}
          </div>
        )}
        {autosaveError && (
          <div className="px-3 py-2 rounded-xl text-xs font-medium"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
            ⚠ {autosaveError}
          </div>
        )}
        {submitError && (
          <div className="px-3 py-2 rounded-xl text-xs font-medium"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
            ⚠ Submit failed. {submitError}
          </div>
        )}

        {/* Live autosave indicator + completion summary */}
        <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {autosaveTick === 'saving' && '· saving…'}
            {autosaveTick === 'saved' && '✓ saved'}
            {autosaveTick === 'idle' && 'auto-saves as you go'}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {completion.filter(c => c.played && c.filled === c.total && !c.shootoutPending).length}/{fixtures.length} fixtures ready
          </span>
        </div>

        <button
          onClick={() => setConfirmSubmit(true)}
          disabled={submitting || !allReady}
          className="w-full py-3 rounded-xl disabled:opacity-40"
          style={{
            background: allReady ? 'var(--tt-yellow)' : 'transparent',
            color: allReady ? '#0F1710' : 'var(--tt-yellow)',
            border: '1px solid var(--tt-yellow)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.12em',
          }}
        >
          {submitting ? 'SUBMITTING…' : allReady ? '▶ SUBMIT RESULTS' : shootoutPendingCount > 0 ? '· pick penalty shootout winner ·' : '· enter all scores + scorers ·'}
        </button>

        {confirmSubmit && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--color-surface)', border: '2px solid var(--tt-yellow)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Confirm final results</div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Once submitted, the match will be marked completed and the result published. You can still edit afterwards via the ✎ button.
            </div>
            <div className="space-y-2">
              {fixtures.map(f => {
                const sl = fixtureScorers[f.id] ?? { team1: [], team2: [] }
                const scorers = scorerSummary([...sl.team1, ...sl.team2], roster)
                return (
                  <div key={f.id} className="text-xs">
                    <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                      {stripFC(f.team1?.name)} <strong style={{ color: 'var(--tt-yellow)' }}>{f.score1 ?? '?'} - {f.score2 ?? '?'}</strong> {stripFC(f.team2?.name)}
                    </div>
                    {(f.shootout_winner === 1 || f.shootout_winner === 2) && (
                      <div style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>
                        ↳ pens: {stripFC((f.shootout_winner === 1 ? f.team1 : f.team2)?.name)} won (+1)
                      </div>
                    )}
                    {scorers && <div style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>↳ {scorers}</div>}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={submitResults}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--tt-yellow)', color: '#0F1710', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}
              >
                {submitting ? 'SUBMITTING…' : 'YES, FINALISE'}
              </button>
              <button
                onClick={() => setConfirmSubmit(false)}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <button
          onClick={copyToClipboard}
          className="w-full py-3 rounded-xl font-medium text-sm"
          style={{
            background: 'var(--color-surface)',
            color: copied ? 'var(--color-primary)' : 'var(--color-text-muted)',
            border: `1px solid ${copied ? '#0D6B52' : '#8C9688'}`,
          }}
        >
          {copied ? '✓ Copied!' : 'Copy to Clipboard'}
        </button>
      </div>
    </div>
  )
}
