import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Profile, FitnessSession } from '../types'

// ── Self-contained dark forest-green palette (matches the modal's dark feel) ──
const C = {
  bg: 'linear-gradient(160deg, #0a1f17 0%, #0c2a1d 60%, #0e3324 100%)',
  border: 'rgba(20,160,110,0.30)',
  tile: 'rgba(255,255,255,0.045)',
  tileBorder: 'rgba(20,160,110,0.22)',
  accent: '#14a06e',
  accentBright: '#2dd4a7',
  text: '#F1F8F4',
  muted: '#86b5a0',
  amber: '#F5B133',
  amberBg: 'rgba(245,177,51,0.12)',
  amberBorder: 'rgba(245,177,51,0.35)',
}

// Heart-rate zone colours: cool green → bright green, amber for the top band.
const ZONE_ORDER = ['<100', '100-119', '120-139', '140-159', '160+']
const ZONE_COLORS: Record<string, string> = {
  '<100': '#0e5a3f',
  '100-119': '#13935f',
  '120-139': '#18b277',
  '140-159': '#34e08f',
  '160+': '#F5B133',
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : null
}

function mmss(seconds: number | null): string | null {
  if (seconds == null) return null
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Tile({ label, value, caption }: { label: string; value: string; caption?: { text: string } | null }) {
  return (
    <div style={{
      background: C.tile, border: `1px solid ${C.tileBorder}`, borderRadius: 12,
      padding: '9px 11px',
    }}>
      <p style={{ color: C.muted, fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </p>
      <p style={{ color: C.text, fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.15, marginTop: 3 }}>
        {value}
      </p>
      {caption && (
        <p style={{ color: C.amber, fontSize: '0.55rem', marginTop: 4, lineHeight: 1.25 }}>
          ⚠ {caption.text}
        </p>
      )}
    </div>
  )
}

export default function MatchFitnessPanel({ profile }: { profile: Profile }) {
  const [session, setSession] = useState<FitnessSession | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Badge only — the panel's visibility is driven entirely by whether a
  // session row exists, NOT by this flag (which may be undefined at runtime).
  const tracked = profile.fitness_source === 'tracked'

  // Always query — the panel is self-sufficient and does not depend on
  // fitness_source being threaded through the profile object.
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setSession(null)
    supabase
      .from('fitness_sessions')
      .select('*')
      .eq('profile_id', profile.id)
      .order('recorded_start', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return
        setSession((data?.[0] as FitnessSession) ?? null)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [profile.id, profile.fitness_source])

  // Render only when a session row exists. No row / error / still loading → nothing.
  if (!loaded || !session) return null

  const s = session
  const raw = (s.raw ?? {}) as Record<string, unknown>
  const rawStr = (k: string): string | null => {
    const v = raw[k]
    return v == null ? null : String(v)
  }

  const distanceM = num(s.distance_m)
  const durationStr = mmss(s.duration_s)
  const avgSpeed = num(s.avg_speed_kmh)
  const maxSpeed = num(s.max_speed_kmh)
  const minHr = s.hr_zones?.min_hr ?? null

  const sport = rawStr('sport')
  const sprintSecs = rawStr('sprint_seconds_over_15kmh')
  const topSpeedNote = rawStr('top_speed_note')
  const hrNote = rawStr('hr_note')
  const hrSource = rawStr('hr_source')
  const mergeNote = rawStr('merge_note')

  const dateLabel = s.recorded_start ? format(new Date(s.recorded_start), 'EEE d MMM yyyy') : null
  const minutes = s.duration_s != null ? `${Math.round(s.duration_s / 60)} min` : null
  const eyebrowBits = [dateLabel, sport ? cap(sport) : null, minutes].filter(Boolean)

  // Stat tiles — omit any whose value is null.
  const tiles: { label: string; value: string; caption?: { text: string } | null }[] = []
  if (durationStr != null) tiles.push({ label: 'Duration', value: durationStr })
  if (avgSpeed != null) tiles.push({ label: 'Avg speed', value: `${avgSpeed.toFixed(1)} km/h` })
  if (s.calories != null) tiles.push({ label: 'Calories', value: `${s.calories} kcal` })
  if (sprintSecs != null) tiles.push({ label: 'Sprint >15km/h', value: `${sprintSecs}s` })
  if (maxSpeed != null) tiles.push({ label: 'Top speed', value: `${maxSpeed.toFixed(1)} km/h`, caption: topSpeedNote ? { text: topSpeedNote } : null })
  if (minHr != null) tiles.push({ label: 'Min HR', value: `${minHr} bpm` })

  const bands = s.hr_zones?.bands ?? null
  const bandKeys = bands ? ZONE_ORDER.filter(k => bands[k] != null).concat(Object.keys(bands).filter(k => !ZONE_ORDER.includes(k))) : []

  return (
    <div style={{
      marginTop: 8, borderRadius: 18, overflow: 'hidden',
      background: C.bg, border: `1px solid ${C.border}`,
      boxShadow: `0 0 0 1px rgba(20,160,110,0.08) inset`,
      padding: '16px 16px 14px',
    }}>
      {/* Eyebrow + meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ color: C.accentBright, fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.18em' }}>
          MATCH FITNESS
        </p>
        {tracked && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 7px', borderRadius: 999,
            background: 'rgba(20,160,110,0.16)', border: `1px solid ${C.tileBorder}`,
            color: C.accentBright, fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.14em',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: C.accentBright, display: 'inline-block' }} />
            TRACKED · LIVE
          </span>
        )}
      </div>
      {eyebrowBits.length > 0 && (
        <p style={{ color: C.muted, fontSize: '0.72rem', marginTop: 4 }}>
          {eyebrowBits.join(' · ')}
        </p>
      )}

      {/* Hero metric */}
      {distanceM != null && (
        <div style={{ marginTop: 14, marginBottom: 4 }}>
          <p style={{ color: C.text, fontFamily: 'Bebas Neue, sans-serif', fontSize: '3rem', lineHeight: 1, letterSpacing: '0.01em' }}>
            {(distanceM / 1000).toFixed(2)}
            <span style={{ fontSize: '1.3rem', color: C.accentBright, marginLeft: 6 }}>km</span>
          </p>
          <p style={{ color: C.muted, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
            Distance covered
          </p>
        </div>
      )}

      {/* Stat grid */}
      {tiles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
          {tiles.map((t, i) => <Tile key={i} {...t} />)}
        </div>
      )}

      {/* Engine / Heart Rate block */}
      {(s.avg_hr != null || s.max_hr != null || bands) && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <p style={{ color: C.muted, fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Engine · Heart Rate
            </p>
            <p style={{ color: C.text, fontSize: '0.82rem', fontWeight: 700 }}>
              {s.avg_hr != null && <span>{s.avg_hr}<span style={{ color: C.muted, fontWeight: 500 }}> avg</span></span>}
              {s.avg_hr != null && s.max_hr != null && <span style={{ color: C.muted }}>  ·  </span>}
              {s.max_hr != null && <span>{s.max_hr}<span style={{ color: C.muted, fontWeight: 500 }}> max</span></span>}
              <span style={{ color: C.muted, fontWeight: 500, fontSize: '0.7rem' }}> bpm</span>
            </p>
          </div>

          {bands && bandKeys.length > 0 && (
            <>
              <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 10 }}>
                {bandKeys.map(k => (
                  <div key={k} title={`${k}: ${bands[k]}%`} style={{
                    width: `${bands[k]}%`,
                    background: ZONE_COLORS[k] ?? C.accent,
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
                {bandKeys.map(k => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.56rem', color: C.muted }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: ZONE_COLORS[k] ?? C.accent, display: 'inline-block' }} />
                    {k} · {bands[k]}%
                  </span>
                ))}
              </div>
            </>
          )}

          {hrNote ? (
            <div style={{
              marginTop: 10, padding: '7px 10px', borderRadius: 9,
              background: C.amberBg, border: `1px solid ${C.amberBorder}`,
              color: C.amber, fontSize: '0.62rem', lineHeight: 1.3,
            }}>
              ⚠ {hrNote}
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: '0.6rem', marginTop: 10 }}>
              ✓ Full session{hrSource ? ` · ${hrSource}` : ''}
            </p>
          )}
        </div>
      )}

      {/* Footer credit */}
      {(mergeNote || s.source) && (
        <p style={{
          color: C.muted, fontSize: '0.55rem', lineHeight: 1.35, marginTop: 14,
          paddingTop: 12, borderTop: `1px solid rgba(20,160,110,0.18)`, opacity: 0.85,
        }}>
          {mergeNote ?? s.source}
        </p>
      )}
    </div>
  )
}
