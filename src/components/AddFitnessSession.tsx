import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseFitnessFile } from '../lib/fitnessImport'
import type { Profile } from '../types'

// Most recent Thursday (the group plays Thursdays) as a sensible default date.
function lastThursday(): string {
  const d = new Date()
  const day = d.getDay() // 0 Sun … 4 Thu
  const diff = (day - 4 + 7) % 7
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

// "65:52" → 3952s · "65.5" or "65" (minutes) → seconds.
function durationToSeconds(input: string): number | null {
  const v = input.trim()
  if (!v) return null
  if (v.includes(':')) {
    const [m, s] = v.split(':')
    const mm = parseInt(m, 10)
    const ss = parseInt(s, 10)
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null
    return mm * 60 + ss
  }
  const mins = parseFloat(v)
  return Number.isFinite(mins) ? Math.round(mins * 60) : null
}

function numOrNull(v: string): number | null {
  const n = parseFloat(v.trim())
  return Number.isFinite(n) ? n : null
}

interface Fields {
  matchDate: string
  sport: string
  distanceKm: string
  duration: string
  avgHr: string
  maxHr: string
  calories: string
  topSpeed: string
}

const BLANK: Fields = {
  matchDate: lastThursday(), sport: 'soccer',
  distanceKm: '', duration: '', avgHr: '', maxHr: '', calories: '', topSpeed: '',
}

const C = {
  accent: '#14a06e',
  accentBright: '#2dd4a7',
  border: 'rgba(20,160,110,0.30)',
}

export default function AddFitnessSession({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<Fields>(BLANK)
  const [source, setSource] = useState<string>('manual')
  const [fileName, setFileName] = useState<string | null>(null)
  const [recordedStart, setRecordedStart] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  function reset() {
    setF(BLANK); setSource('manual'); setFileName(null); setRecordedStart(null)
    setError(null); setDone(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true); setError(null)
    try {
      const p = await parseFitnessFile(file)
      setSource(p.source)
      setFileName(file.name)
      setRecordedStart(p.recordedStart)
      setF(prev => ({
        ...prev,
        sport: p.sport ?? prev.sport,
        matchDate: p.recordedStart ? p.recordedStart.slice(0, 10) : prev.matchDate,
        distanceKm: p.distanceM != null ? (p.distanceM / 1000).toFixed(2) : prev.distanceKm,
        duration: p.durationS != null
          ? `${Math.floor(p.durationS / 60)}:${String(p.durationS % 60).padStart(2, '0')}`
          : prev.duration,
        avgHr: p.avgHr != null ? String(p.avgHr) : prev.avgHr,
        maxHr: p.maxHr != null ? String(p.maxHr) : prev.maxHr,
        calories: p.calories != null ? String(p.calories) : prev.calories,
        topSpeed: p.maxSpeedKmh != null ? String(p.maxSpeedKmh) : prev.topSpeed,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setParsing(false)
    }
  }

  async function save() {
    setError(null)
    const distanceKm = numOrNull(f.distanceKm)
    const durationS = durationToSeconds(f.duration)
    if (distanceKm == null && durationS == null) {
      setError('Enter at least a distance or a duration.')
      return
    }
    const distanceM = distanceKm != null ? Math.round(distanceKm * 1000) : null
    const avgSpeed = distanceM != null && durationS
      ? Math.round((distanceM / durationS) * 36) / 10
      : null

    const start = recordedStart ?? new Date(`${f.matchDate}T20:00:00`).toISOString()

    setSaving(true)
    const { error: insErr } = await supabase.from('fitness_sessions').insert({
      profile_id: profile.id,
      match_date: f.matchDate,
      source,
      recorded_start: start,
      distance_m: distanceM,
      duration_s: durationS,
      avg_hr: numOrNull(f.avgHr) != null ? Math.round(numOrNull(f.avgHr)!) : null,
      max_hr: numOrNull(f.maxHr) != null ? Math.round(numOrNull(f.maxHr)!) : null,
      calories: numOrNull(f.calories) != null ? Math.round(numOrNull(f.calories)!) : null,
      avg_speed_kmh: avgSpeed,
      max_speed_kmh: numOrNull(f.topSpeed),
      raw: {
        sport: f.sport || null,
        entered_via: source === 'manual' ? 'manual' : 'file',
        ...(fileName ? { source_file: fileName } : {}),
      },
    })
    setSaving(false)

    if (insErr) {
      setError(insErr.message.includes('row-level security')
        ? 'You can only add fitness for your own profile.'
        : insErr.message)
      return
    }
    setDone(true)
    onSaved()
    setTimeout(() => { setOpen(false); reset() }, 1200)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 rounded-xl text-sm font-medium mt-2"
        style={{ background: 'var(--color-surface)', color: C.accent, border: `1px solid ${C.border}` }}
      >
        ＋ Add match fitness
      </button>
    )
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 8, padding: '7px 9px', fontSize: 13, color: 'var(--color-text)', width: '100%',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 3, display: 'block',
  }

  // Plain render helper (NOT a component) so inputs don't remount and lose focus.
  const field = (label: string, k: keyof Fields, placeholder?: string, type = 'text') => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type} value={f[k]} onChange={set(k)} placeholder={placeholder}
        style={inputStyle} inputMode={type === 'number' ? 'decimal' : undefined}
      />
    </div>
  )

  return (
    <div className="mt-2 rounded-2xl p-4" style={{ background: 'var(--color-surface)', border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold tracking-widest" style={{ color: C.accent }}>ADD MATCH FITNESS</p>
        <button onClick={() => { setOpen(false); reset() }} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
      </div>

      {/* File import */}
      <label
        className="block w-full text-center py-2.5 rounded-xl text-xs font-semibold cursor-pointer mb-3"
        style={{ background: 'rgba(20,160,110,0.12)', color: C.accent, border: `1px dashed ${C.border}` }}
      >
        {parsing ? 'Reading file…' : '⤴ Import from watch (.tcx / .gpx)'}
        <input ref={fileRef} type="file" accept=".tcx,.gpx,application/xml,text/xml" onChange={onFile} className="hidden" />
      </label>
      {fileName && !error && (
        <p className="text-xs mb-3" style={{ color: C.accentBright }}>✓ Imported {fileName} — review and save.</p>
      )}
      <p className="text-[11px] mb-3" style={{ color: 'var(--color-text-muted)' }}>
        …or just type the numbers from your watch app below. Polar, Garmin, Apple Watch and Strava all work.
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        {field('Match date', 'matchDate', undefined, 'date')}
        {field('Sport', 'sport', 'soccer')}
        {field('Distance (km)', 'distanceKm', '6.88', 'number')}
        {field('Duration (mm:ss)', 'duration', '65:52')}
        {field('Avg HR (bpm)', 'avgHr', '136', 'number')}
        {field('Max HR (bpm)', 'maxHr', '166', 'number')}
        {field('Calories (kcal)', 'calories', '125', 'number')}
        {field('Top speed (km/h)', 'topSpeed', '24.5', 'number')}
      </div>

      {error && (
        <p className="text-xs mt-3" style={{ color: 'var(--color-error-text)' }}>{error}</p>
      )}

      <button
        onClick={save}
        disabled={saving || done}
        className="w-full py-2.5 rounded-xl text-sm font-semibold mt-3"
        style={{ background: done ? C.accentBright : C.accent, color: '#fff', opacity: saving ? 0.7 : 1 }}
      >
        {done ? '✓ Saved' : saving ? 'Saving…' : 'Save session'}
      </button>
    </div>
  )
}
