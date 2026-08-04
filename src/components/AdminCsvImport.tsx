import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, PlayerPosition } from '../types'
import { CLUBS_BY_SLUG } from '../lib/clubs'
import { parseCsvObjects, toCsv } from '../lib/csv'

const NUMERIC_COLS = [
  'card_pace', 'card_shooting', 'card_passing', 'card_dribbling', 'card_defence', 'card_physicality',
  'gk_pace', 'gk_reflexes', 'gk_handling', 'gk_distribution', 'gk_positioning', 'gk_physicality',
  'cunt', 'overall_rating',
] as const

const EXPORT_COLS = [
  'name', 'surname', 'position',
  ...NUMERIC_COLS.slice(0, 12),
  'cunt', 'overall_rating', 'favourite_club',
]

const POSITIONS = new Set<PlayerPosition>(['GK', 'DF', 'MF', 'ST'])
// Tolerant of null/undefined — a single stub profile with a missing surname
// (as happened with the Rossini bot on 1 Aug 2026) used to throw here and
// take the whole Admin tab down. Coerce first, trim second.
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const clamp = (n: number) => Math.max(1, Math.min(10, n))

interface Summary {
  updated: number
  unchanged: number
  skipped: { name: string; reason: string }[]
  warnings: string[]
}

export default function AdminCsvImport({ players, onImported }: { players: Profile[]; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')

  const byKey = new Map<string, Profile>()
  for (const p of players) byKey.set(`${norm(p.name)}|${norm(p.surname)}`, p)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await runImport(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function runImport(file: File) {
    setBusy(true); setError(''); setSummary(null)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsvObjects(text)
      if (!headers.includes('name') || !headers.includes('surname')) {
        setError('CSV must have at least "name" and "surname" header columns.')
        return
      }

      const s: Summary = { updated: 0, unchanged: 0, skipped: [], warnings: [] }
      const updates: { id: string; payload: Record<string, unknown> }[] = []

      for (const row of rows) {
        const label = `${row.name ?? ''} ${row.surname ?? ''}`.trim() || '(blank row)'
        const match = byKey.get(`${norm(row.name ?? '')}|${norm(row.surname ?? '')}`)
        if (!match) {
          s.skipped.push({ name: label, reason: 'no matching profile' })
          continue
        }

        const payload: Record<string, unknown> = {}

        for (const col of NUMERIC_COLS) {
          if (!(col in row)) continue
          const raw = row[col]
          if (raw === '' || raw == null) continue
          const n = parseInt(raw, 10)
          if (Number.isNaN(n)) { s.warnings.push(`${label}: "${col}" is not a number ("${raw}") — skipped`); continue }
          const val = clamp(n)
          if (val !== (match as unknown as Record<string, unknown>)[col]) payload[col] = val
        }

        if ('position' in row && row.position !== '') {
          const pos = row.position.toUpperCase() as PlayerPosition
          if (POSITIONS.has(pos)) {
            if (pos !== match.position) payload.position = pos
          } else {
            s.warnings.push(`${label}: invalid position "${row.position}" — skipped`)
          }
        }

        if ('favourite_club' in row && row.favourite_club !== '') {
          const slug = row.favourite_club.trim()
          if (CLUBS_BY_SLUG[slug]) {
            if (slug !== match.favourite_club) payload.favourite_club = slug
          } else {
            s.warnings.push(`${label}: unknown club slug "${slug}" — skipped`)
          }
        }

        if (Object.keys(payload).length === 0) s.unchanged++
        else updates.push({ id: match.id, payload })
      }

      const results = await Promise.all(
        updates.map(u => supabase.from('profiles').update(u.payload).eq('id', u.id))
      )
      results.forEach((r, i) => {
        if (r.error) s.warnings.push(`Update failed for ${updates[i].id}: ${r.error.message}`)
        else s.updated++
      })

      setSummary(s)
      if (s.updated > 0) onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV.')
    } finally {
      setBusy(false)
    }
  }

  function downloadCsv() {
    const rows = players.map(p =>
      EXPORT_COLS.map(c => (p as unknown as Record<string, unknown>)[c] as string | number | null)
    )
    const blob = new Blob([toCsv(EXPORT_COLS, rows)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wanstead-fellas-profiles-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <p className="text-sm font-semibold text-[var(--color-text)]">Bulk Import from CSV</p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Matches rows by name + surname. Blank cells are left untouched. Photos and unlisted columns are never modified. New profiles are not auto-created.
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
        >
          {busy ? 'Importing…' : 'Upload CSV'}
        </button>
        <button
          onClick={downloadCsv}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
        >
          Download current
        </button>
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />

      {error && (
        <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid var(--color-error-border)' }}>
          {error}
        </div>
      )}

      {summary && (
        <div className="text-xs space-y-2" style={{ color: 'var(--color-text-muted)' }}>
          <p className="font-semibold text-[var(--color-text)]">
            {summary.updated} updated · {summary.unchanged} unchanged · {summary.skipped.length} skipped
          </p>
          {summary.skipped.length > 0 && (
            <div>
              <p className="font-medium">Rows that did not match an existing profile:</p>
              <ul className="list-disc pl-4">
                {summary.skipped.map((sk, i) => <li key={i}>{sk.name} — {sk.reason}</li>)}
              </ul>
            </div>
          )}
          {summary.warnings.length > 0 && (
            <div>
              <p className="font-medium" style={{ color: 'var(--color-warning-text)' }}>Warnings:</p>
              <ul className="list-disc pl-4">
                {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
