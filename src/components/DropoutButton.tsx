// Player self-service dropout — the "I can't play tonight" red button that
// sits below FormationPicker on the user's own team card. Tapping shows a
// confirm modal; confirming calls the player_dropout RPC (migration 057)
// which atomically removes the caller from team_players + formation slot,
// auto-swaps in a WTP replacement, and rebuilds team_drafts JSON.
//
// Only visible when there's a genuine dropout opportunity: the caller is
// rostered for the given match, the match hasn't already been played, and
// we're before the kickoff-2h cutoff. Outside that window admin has to
// hand-swap on WhatsApp — the button doesn't render.

import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  matchId: string
  matchDate: string   // YYYY-MM-DD
  onDropout: () => void
}

// Kickoff is 21:00 BST every Thursday. Cutoff for self-service = kickoff - 2h
// (19:00 BST). After that it's admin's call because there's not enough time
// to find a replacement over WhatsApp.
function isBeforeCutoff(matchDateStr: string): boolean {
  const kickoff = new Date(`${matchDateStr}T21:00:00+01:00`)
  const cutoff = new Date(kickoff.getTime() - 2 * 60 * 60 * 1000)
  return Date.now() < cutoff.getTime()
}

type Outcome =
  | { ok: true; replaced: boolean; replacement_name?: string; slot_filled?: boolean; match_date?: string }
  | { ok: false; reason: string }

export default function DropoutButton({ matchId, matchDate, onDropout }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Outcome | null>(null)

  if (!isBeforeCutoff(matchDate)) return null

  async function submit() {
    setBusy(true)
    const { data, error } = await supabase.rpc('player_dropout', { p_match_id: matchId })
    setBusy(false)
    if (error) {
      setResult({ ok: false, reason: error.message })
      return
    }
    setResult(data as Outcome)
    setConfirming(false)
    if ((data as Outcome).ok) onDropout()
  }

  if (result?.ok) {
    return (
      <div className="rounded-xl p-3 mt-2 text-xs"
        style={{ background: 'rgba(74,220,122,0.08)', border: '1px solid var(--tt-green)', color: 'var(--tt-green)' }}>
        <p className="font-semibold uppercase tracking-widest text-[10px] mb-1">Sorted ✓</p>
        <p style={{ color: 'var(--color-text)' }}>
          {result.replaced
            ? `You're out. ${result.replacement_name} has been swapped in${result.slot_filled ? ' into your formation slot' : ''}.`
            : 'You\'re out. No WTP replacement available — admin will pick one up.'}
        </p>
      </div>
    )
  }

  if (result && !result.ok) {
    return (
      <div className="rounded-xl p-3 mt-2 text-xs"
        style={{ background: 'rgba(255,85,85,0.08)', border: '1px solid var(--tt-red)', color: 'var(--tt-red)' }}>
        ⚠ {result.reason}. Ping admin on WhatsApp.
      </div>
    )
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full py-2.5 rounded-xl text-xs font-semibold mt-2"
        style={{
          background: 'transparent',
          color: 'var(--tt-red)',
          border: '1px solid var(--tt-red)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Can't play tonight
      </button>
    )
  }

  return (
    <div className="rounded-xl p-3 mt-2"
      style={{ background: 'rgba(255,85,85,0.06)', border: '1px solid var(--tt-red)' }}>
      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--tt-red)' }}>
        Confirm dropout
      </p>
      <p className="text-[11px] mb-3" style={{ color: 'var(--color-text-muted)' }}>
        You'll be removed from the roster. If a WTP is available, they'll be swapped in
        automatically. This can't be undone from the app — you'd need to ask admin.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--tt-red)', color: '#FFFFFF', border: '1px solid var(--tt-red)' }}
        >
          {busy ? 'Dropping…' : 'Yes, drop me'}
        </button>
      </div>
    </div>
  )
}
