import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import CeefaxHeader from '../components/CeefaxHeader'
import {
  type CupMatch, type CupStage,
  stageLabel, stagePageId,
  GROUP_OUTCOMES, KO_OUTCOMES, knockoutModeLabel, knockoutMode,
} from '../lib/cup'
import SweepstakeAdminPanel from '../components/SweepstakeAdminPanel'

const TT_YELLOW = 'var(--tt-yellow)'
const TT_CYAN = 'var(--tt-cyan)'
const TT_GREEN = 'var(--tt-green)'
const TT_RED = 'var(--tt-red)'
const MONO = 'var(--font-mono)'

const ALL_STAGES: CupStage[] = [
  'group_a','group_b','group_c','group_d','group_e','group_f',
  'group_g','group_h','group_i','group_j','group_k','group_l',
  'r32','r16','qf','sf','third_place','final',
]

export default function CupAdminPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<CupMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: e } = await supabase.from('cup_matches').select('*').order('kickoff')
    if (e) setError(e.message)
    else setMatches((data as CupMatch[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (!profile?.is_admin) {
    return (
      <div className="px-4 pt-4">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Admins only.</p>
      </div>
    )
  }

  const unsettledPast = matches.filter(m => !m.actual_outcome && new Date(m.kickoff).getTime() < Date.now())

  return (
    <div className="px-4 pt-4 pb-6">
      <CeefaxHeader
        pageId="P909 · CUP ADMIN"
        title="CUP ADMIN"
        meta={`${matches.length} FIXTURES · ${unsettledPast.length} AWAITING RESULT`}
        trailing={
          <button
            onClick={() => navigate('/cup')}
            className="text-xs font-medium px-2 py-1 rounded-lg"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            ← Back
          </button>
        }
      />

      {error && (
        <p className="text-xs mb-3 p-2 rounded" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid var(--color-error-border)' }}>{error}</p>
      )}

      <AddMatchForm onAdded={load} />

      <SweepstakeAdminPanel />

      <p className="text-xs mt-5 mb-2" style={{ fontFamily: MONO, color: TT_CYAN, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
        ▶ All Fixtures · {matches.length}
      </p>

      {loading ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: MONO }}>Loading…</p>
      ) : (
        matches.map(m => (
          <MatchAdminCard
            key={m.id}
            match={m}
            isOpen={editing === m.id}
            onToggle={() => setEditing(editing === m.id ? null : m.id)}
            onChanged={load}
            onError={setError}
          />
        ))
      )}
    </div>
  )
}

function AddMatchForm({ onAdded }: { onAdded: () => Promise<void> | void }) {
  const [stage, setStage] = useState<CupStage>('group_a')
  const [team1, setTeam1] = useState('')
  const [team2, setTeam2] = useState('')
  const [kickoff, setKickoff] = useState('')
  const [venue, setVenue] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setErr(null)
    if (!team1.trim() || !team2.trim() || !kickoff) {
      setErr('Team 1, Team 2 and kickoff are required.')
      return
    }
    setSaving(true)
    const isKnockout = !stage.startsWith('group_')
    const groupLetter = stage.startsWith('group_') ? stage.slice(-1).toUpperCase() : null
    const { error } = await supabase.from('cup_matches').insert({
      stage,
      group_letter: groupLetter,
      team1: team1.trim(),
      team2: team2.trim(),
      kickoff: new Date(kickoff).toISOString(),
      venue: venue.trim() || null,
      is_knockout: isKnockout,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setTeam1(''); setTeam2(''); setKickoff(''); setVenue('')
    await onAdded()
  }

  return (
    <div className="rounded-xl p-3 mb-3" style={{ border: '1px solid var(--color-border)', fontFamily: MONO }}>
      <p className="text-xs mb-2" style={{ color: TT_CYAN, letterSpacing: '0.12em', textTransform: 'uppercase' }}>▶ Add Fixture</p>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={stage}
          onChange={e => setStage(e.target.value as CupStage)}
          className="px-2 py-2 rounded-lg text-xs"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO, gridColumn: 'span 2' }}
        >
          {ALL_STAGES.map(s => <option key={s} value={s}>{stagePageId(s)} · {stageLabel(s)}</option>)}
        </select>
        <input type="text" placeholder="Team 1" value={team1} onChange={e => setTeam1(e.target.value)}
          className="px-2 py-2 rounded-lg text-xs"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }} />
        <input type="text" placeholder="Team 2" value={team2} onChange={e => setTeam2(e.target.value)}
          className="px-2 py-2 rounded-lg text-xs"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }} />
        <input type="datetime-local" value={kickoff} onChange={e => setKickoff(e.target.value)}
          className="px-2 py-2 rounded-lg text-xs"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO, gridColumn: 'span 2' }} />
        <input type="text" placeholder="Venue (optional)" value={venue} onChange={e => setVenue(e.target.value)}
          className="px-2 py-2 rounded-lg text-xs"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO, gridColumn: 'span 2' }} />
      </div>
      {err && <p className="text-[11px] mt-2" style={{ color: TT_RED }}>{err}</p>}
      <button
        onClick={submit}
        disabled={saving}
        className="w-full mt-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
        style={{ background: 'transparent', color: TT_GREEN, border: '1px solid ' + TT_GREEN, fontFamily: MONO, letterSpacing: '0.1em' }}
      >
        {saving ? 'SAVING…' : '▶ ADD FIXTURE'}
      </button>
    </div>
  )
}

function MatchAdminCard({
  match, isOpen, onToggle, onChanged, onError,
}: {
  match: CupMatch
  isOpen: boolean
  onToggle: () => void
  onChanged: () => Promise<void> | void
  onError: (e: string | null) => void
}) {
  const [score1, setScore1] = useState<string>(match.score1?.toString() ?? '')
  const [score2, setScore2] = useState<string>(match.score2?.toString() ?? '')
  const [outcome, setOutcome] = useState<string>(match.actual_outcome ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    onError(null)
    setSaving(true)
    // Lock the outcome when an admin sets it — the auto-sync will then
    // stop rewriting it back. If they clear it (set to null), unlock so
    // the sync can freshly settle the match. See migration 042.
    const outcomeVal = outcome === '' ? null : outcome
    const update = {
      score1: score1 === '' ? null : parseInt(score1, 10),
      score2: score2 === '' ? null : parseInt(score2, 10),
      actual_outcome: outcomeVal,
      outcome_locked_by_admin: outcomeVal !== null,
    }
    const { error } = await supabase.from('cup_matches').update(update).eq('id', match.id)
    setSaving(false)
    if (error) { onError(error.message); return }
    await onChanged()
  }

  async function remove() {
    if (!confirm(`Delete fixture ${match.team1} vs ${match.team2}? This will remove any predictions tied to it.`)) return
    const { error } = await supabase.from('cup_matches').delete().eq('id', match.id)
    if (error) onError(error.message)
    else onChanged()
  }

  const ko = new Date(match.kickoff)
  const isPast = ko.getTime() < Date.now()
  const outcomeOptions = match.is_knockout
    ? KO_OUTCOMES.map(o => ({
        value: o,
        label: `${o.startsWith('team1') ? match.team1 : match.team2} (${knockoutModeLabel(knockoutMode(o))})`,
      }))
    : GROUP_OUTCOMES.map(o => ({
        value: o,
        label: o === 'team1' ? match.team1 : o === 'team2' ? match.team2 : 'Draw',
      }))

  return (
    <div className="rounded-xl mb-2 overflow-hidden" style={{ border: '1px solid var(--color-border)', fontFamily: MONO }}>
      <button
        onClick={onToggle}
        className="w-full text-left p-3"
        style={{ background: isOpen ? 'var(--color-surface-2)' : 'transparent' }}
      >
        <div className="flex items-center justify-between mb-1" style={{ fontSize: 10, letterSpacing: '0.1em' }}>
          <span style={{ color: TT_CYAN }}>{stagePageId(match.stage)} · {stageLabel(match.stage)}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{ko.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()}</span>
        </div>
        <div className="flex items-center justify-between gap-3" style={{ fontSize: 13, color: 'var(--color-text)' }}>
          <span className="truncate">{match.team1} vs {match.team2}</span>
          <span style={{ color: match.actual_outcome ? TT_YELLOW : isPast ? TT_RED : 'var(--color-text-muted)', fontWeight: 700 }}>
            {match.actual_outcome
              ? `${match.score1 ?? '–'}–${match.score2 ?? '–'} · SETTLED`
              : isPast ? 'AWAITING' : 'UPCOMING'}
          </span>
        </div>
      </button>
      {isOpen && (
        <div className="p-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>{match.team1} Score</label>
              <input type="number" min={0} value={score1} onChange={e => setScore1(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }} />
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>{match.team2} Score</label>
              <input type="number" min={0} value={score2} onChange={e => setScore2(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }} />
            </div>
          </div>
          <div className="mt-2">
            <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>Result (settles predictions)</label>
            <select
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              className="w-full px-2 py-2 rounded text-xs"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: MONO }}
            >
              <option value="">— not yet settled —</option>
              {outcomeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: 'transparent', color: TT_YELLOW, border: '1px solid ' + TT_YELLOW, fontFamily: MONO, letterSpacing: '0.1em' }}
            >
              {saving ? 'SAVING…' : '▶ SAVE'}
            </button>
            <button
              onClick={remove}
              className="px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'transparent', color: TT_RED, border: '1px solid ' + TT_RED, fontFamily: MONO, letterSpacing: '0.1em' }}
            >
              DELETE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
