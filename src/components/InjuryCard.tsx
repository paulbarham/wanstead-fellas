import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getNextThursday } from '../lib/time'
import type { Injury } from '../types'

// Self-service injury reporter on the Profile page. Player picks an injury
// type (free text, common ones as quick-pick chips), and a return-Thursday
// from the next 8 available Thursdays. Data lives in `injuries` (mig 078)
// and the group sees it via v_active_injuries on the Tonight tab.
//
// One "active" injury per player is enforced client-side: when a new one is
// created, any existing uncleared ones are cleared first. Cheaper than a
// DB constraint (partial index on `where cleared_at is null AND return_date
// >= current_date` isn't possible — current_date isn't IMMUTABLE).

const QUICK_PICK_TYPES = [
  'Hamstring',
  'Calf',
  'Knee',
  'Ankle',
  'Back',
  'Shoulder',
  'Illness',
  'Other',
] as const

function formatThursdayLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function nextEightThursdays(): string[] {
  const list: string[] = []
  let d = getNextThursday()
  for (let i = 0; i < 8; i++) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    list.push(`${y}-${m}-${day}`)
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
  }
  return list
}

export default function InjuryCard() {
  const { profile } = useAuth()
  const [active, setActive] = useState<Injury | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Form state
  const [injuryType, setInjuryType] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [returnDate, setReturnDate] = useState<string>('')

  const load = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await supabase
      .from('injuries')
      .select('*')
      .eq('player_id', profile.id)
      .is('cleared_at', null)
      .gte('return_date', new Date().toISOString().slice(0, 10))
      .order('reported_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setActive((data as Injury | null) ?? null)
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!profile?.id || !injuryType.trim() || !returnDate) return
    setSaving(true)
    setErr(null)
    // Clear any pre-existing active row first (one-active-at-a-time).
    await supabase
      .from('injuries')
      .update({ cleared_at: new Date().toISOString(), cleared_by: profile.id })
      .eq('player_id', profile.id)
      .is('cleared_at', null)
    const { data, error } = await supabase
      .from('injuries')
      .insert({
        player_id: profile.id,
        injury_type: injuryType.trim(),
        notes: notes.trim() || null,
        return_date: returnDate,
      })
      .select().single()
    setSaving(false)
    if (error) { setErr(error.message); return }
    setActive(data as Injury)
    setShowForm(false)
    setInjuryType(''); setNotes(''); setReturnDate('')
  }

  async function clear() {
    if (!profile?.id || !active) return
    if (!confirm('Mark yourself recovered? You\'ll drop off the injury list.')) return
    setSaving(true)
    await supabase
      .from('injuries')
      .update({ cleared_at: new Date().toISOString(), cleared_by: profile.id })
      .eq('id', active.id)
    setSaving(false)
    setActive(null)
  }

  async function extend() {
    if (!profile?.id || !active) return
    // Push return date one week forward.
    const cur = new Date(active.return_date + 'T12:00:00')
    const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7)
    const iso = next.toISOString().slice(0, 10)
    setSaving(true)
    const { data } = await supabase
      .from('injuries')
      .update({ return_date: iso })
      .eq('id', active.id)
      .select().single()
    setSaving(false)
    if (data) setActive(data as Injury)
  }

  if (loading) return null

  // ── Active injury view ───────────────────────────────────────────────────
  if (active) {
    return (
      <div className="rounded-2xl mb-4"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--tt-red, #DC2626)',
          backgroundClip: 'padding-box',
        }}>
        <div className="px-4 py-2.5"
          style={{
            borderTopLeftRadius: 15, borderTopRightRadius: 15,
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface-2, var(--color-bg))',
          }}>
          <p className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--tt-red, #DC2626)' }}>
            🩹 You're on the injury list
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm" style={{ color: 'var(--color-text)' }}>
            <strong>{active.injury_type}</strong>
            {active.notes ? <span style={{ color: 'var(--color-text-muted)' }}> · {active.notes}</span> : null}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            Back for {formatThursdayLabel(active.return_date)}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={clear}
              disabled={saving}
              className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{
                background: 'var(--color-primary)',
                color: 'var(--color-text)',
              }}
            >
              ✓ I'm fit
            </button>
            <button
              onClick={extend}
              disabled={saving}
              className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              +1 week
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Not injured — call to action / form ──────────────────────────────────
  if (!showForm) {
    return (
      <div className="rounded-2xl mb-4"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          backgroundClip: 'padding-box',
        }}>
        <div className="px-4 py-2.5"
          style={{
            borderTopLeftRadius: 15, borderTopRightRadius: 15,
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface-2, var(--color-bg))',
          }}>
          <p className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-text-muted)' }}>
            🩹 Injury status
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm mb-3" style={{ color: 'var(--color-text)' }}>
            Fit and available. If you pick up a knock, mark it here so the group knows you're out.
          </p>
          <button
            onClick={() => {
              setShowForm(true)
              const first = nextEightThursdays()[0]
              setReturnDate(first)
            }}
            className="w-full py-2 rounded-lg text-xs font-semibold"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
          >
            Mark myself injured
          </button>
        </div>
      </div>
    )
  }

  const thursdayOptions = nextEightThursdays()
  const canSave = injuryType.trim() && returnDate

  return (
    <div className="rounded-2xl mb-4"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        backgroundClip: 'padding-box',
      }}>
      <div className="px-4 py-2.5 flex items-center justify-between"
        style={{
          borderTopLeftRadius: 15, borderTopRightRadius: 15,
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-2, var(--color-bg))',
        }}>
        <p className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-muted)' }}>
          🩹 Report an injury
        </p>
        <button
          onClick={() => { setShowForm(false); setErr(null) }}
          className="text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--tt-cyan, var(--color-primary))' }}>
          Cancel
        </button>
      </div>
      <div className="px-4 py-3 space-y-3">
        {/* Quick-pick chips */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PICK_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setInjuryType(t)}
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{
                background: injuryType === t ? 'var(--color-primary)' : 'var(--color-surface)',
                color: injuryType === t ? 'var(--color-text)' : 'var(--color-text-muted)',
                border: `1px solid ${injuryType === t ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Or custom */}
        <input
          type="text"
          value={injuryType}
          onChange={e => setInjuryType(e.target.value)}
          placeholder="Type or pick from above"
          maxLength={80}
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{
            background: 'var(--color-surface-2)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        />

        {/* Optional notes */}
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional notes (e.g. 'strain, no scan yet')"
          maxLength={200}
          className="w-full px-3 py-2 rounded-lg text-xs"
          style={{
            background: 'var(--color-surface-2)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        />

        {/* Return-Thursday picker */}
        <div>
          <p className="text-[10px] uppercase font-semibold tracking-wider mb-1.5"
            style={{ color: 'var(--color-text-muted)' }}>
            Expected return
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {thursdayOptions.map((iso, i) => (
              <button
                key={iso}
                onClick={() => setReturnDate(iso)}
                className="text-xs px-2 py-1.5 rounded-lg font-medium"
                style={{
                  background: returnDate === iso ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: returnDate === iso ? 'var(--color-text)' : 'var(--color-text-muted)',
                  border: `1px solid ${returnDate === iso ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {i === 0 ? 'This Thu' : formatThursdayLabel(iso)}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <div className="text-[11px] px-2 py-1.5 rounded"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)' }}>
            {err}
          </div>
        )}

        <button
          onClick={save}
          disabled={saving || !canSave}
          className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
          style={{
            background: 'var(--tt-red, #DC2626)',
            color: '#FFFFFF',
          }}
        >
          {saving ? 'Saving…' : '🩹 Report injury'}
        </button>
      </div>
    </div>
  )
}
