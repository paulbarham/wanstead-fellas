// Report Review — the human gate between the Friday generator and the group.
//
// generate-match-report writes results.status = 'draft' at 10:05 and pushes
// Paul (and only Paul). Nothing is visible to anyone else until Publish is
// pressed here, which flips status to 'published'.
//
// Publishing and notifying are separate (mig 093). Publish makes the report
// live on the Match tab immediately, whatever the ballot is doing; the single
// group push is sent by dispatch_report_notifications() once the awards are
// also final. So a report can be published on the night without either
// jumping the ballot or losing its push.
//
// Mobile-first by necessity: this gets read on a phone, on a Friday morning,
// probably one-handed. Section by section, everything editable in place, one
// obvious green button at the bottom.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import CeefaxHeader from '../components/CeefaxHeader'
import type { Result, ReportNoteItem } from '../types'

const TT_YELLOW = 'var(--tt-yellow)'
const TT_CYAN = 'var(--tt-cyan)'
const TT_GREEN = 'var(--tt-green)'
const TT_RED = 'var(--tt-red)'
const MONO = 'var(--font-mono)'

type DraftRow = Result & { matches: { match_date: string; format: string | null } | null }

/** Editable local shape. Kept flat so every field is a controlled input. */
interface Editable {
  summary: string
  predictionsNote: string
  key_highlights: ReportNoteItem[]
  banter: ReportNoteItem[]
  app_watch: ReportNoteItem[]
  conclusion: string
  closer: string
}

function toEditable(r: Result): Editable {
  return {
    summary: r.summary ?? '',
    predictionsNote: r.predictions?.note ?? '',
    key_highlights: r.key_highlights ?? [],
    banter: r.banter ?? [],
    app_watch: r.app_watch ?? [],
    conclusion: r.conclusion ?? '',
    closer: r.closer ?? '',
  }
}

// ── shared bits ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--color-text)',
}

/**
 * Card wrapper. No `overflow: hidden` — the header carries bold DM Sans and
 * would get its first letter shaved off at the padding edge. Explicit corner
 * radii on the header instead (see CLAUDE.md).
 */
function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl mb-4"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        backgroundClip: 'padding-box',
      }}
    >
      <div
        className="px-4 py-2"
        style={{
          borderTopLeftRadius: 11,
          borderTopRightRadius: 11,
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-2, var(--color-bg))',
        }}
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className="text-[11px] uppercase tracking-wider"
            style={{ fontFamily: MONO, color: TT_CYAN, fontWeight: 700 }}
          >
            {title}
          </span>
          {hint && (
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{hint}</span>
          )}
        </div>
      </div>
      <div className="px-4 py-3" style={{ borderBottomLeftRadius: 11, borderBottomRightRadius: 11 }}>
        {children}
      </div>
    </div>
  )
}

function AutoTextarea({ value, onChange, rows = 4, placeholder }: {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, resize: 'vertical' }}
    />
  )
}

/**
 * Repeating {player?, label?, note} list — key_highlights, banter, app_watch
 * all share this shape, so they share this editor.
 */
function NoteItemEditor({ items, onChange }: {
  items: ReportNoteItem[]
  onChange: (next: ReportNoteItem[]) => void
}) {
  function patch(i: number, field: keyof ReportNoteItem, v: string) {
    const next = items.map((it, idx) => idx === i ? { ...it, [field]: v || null } : it)
    onChange(next)
  }
  function remove(i: number) { onChange(items.filter((_, idx) => idx !== i)) }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
          Nothing here. Add an item if it needs one.
        </p>
      )}

      {items.map((it, i) => (
        <div
          key={i}
          className="rounded-lg p-3"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', backgroundClip: 'padding-box' }}
        >
          <div className="flex gap-2 mb-2">
            <input
              value={it.player ?? ''}
              placeholder="Player (optional)"
              onChange={e => patch(i, 'player', e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <input
              value={it.label ?? ''}
              placeholder="Label (optional)"
              onChange={e => patch(i, 'label', e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
          </div>
          <AutoTextarea value={it.note ?? ''} rows={3} placeholder="Note" onChange={v => patch(i, 'note', v)} />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="active:opacity-70"
              style={{ ...pillStyle, opacity: i === 0 ? 0.35 : 1 }}
            >↑</button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              className="active:opacity-70"
              style={{ ...pillStyle, opacity: i === items.length - 1 ? 0.35 : 1 }}
            >↓</button>
            <div className="flex-1" />
            <button
              onClick={() => remove(i)}
              className="active:opacity-70"
              style={{ ...pillStyle, color: TT_RED, borderColor: TT_RED }}
            >Remove</button>
          </div>
        </div>
      ))}

      <button
        onClick={() => onChange([...items, { player: null, label: null, note: '' }])}
        className="active:opacity-70 w-full"
        style={{ ...pillStyle, height: 44, color: TT_CYAN, borderColor: TT_CYAN }}
      >+ Add item</button>
    </div>
  )
}

const pillStyle: React.CSSProperties = {
  minHeight: 36,
  minWidth: 44,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'transparent',
  color: 'var(--color-text)',
  fontSize: 13,
  fontWeight: 600,
}

// ── page ──────────────────────────────────────────────────────────────────

export default function ReportReviewPage() {
  const { profile } = useAuth()
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [edit, setEdit] = useState<Editable | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [seededFor, setSeededFor] = useState<string | null>(null)
  // match_id -> awards are final (voting closed and computed). Drives the
  // publish copy: with awards in, the push follows within ten minutes; without
  // them, publishing is live-now and the push holds automatically.
  const [awardsFinalBy, setAwardsFinalBy] = useState<Record<string, boolean>>({})

  // No state is touched before the first await: `loading` already starts true,
  // and refetches after a save are fast enough not to need a spinner (the
  // buttons carry their own busy state). Keeps every setState out of the
  // synchronous effect body.
  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('results')
      .select('*, matches!inner(match_date, format)')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
    if (e) setError(e.message)
    else {
      const rows = (data as unknown as DraftRow[]) ?? []
      setDrafts(rows)
      setActiveId(prev => prev && rows.some(r => r.id === prev) ? prev : (rows[0]?.id ?? null))

      // voting_windows has no direct FK to results, so it can't be embedded in
      // the query above — one extra round trip for the whole set.
      const matchIds = rows.map(r => r.match_id)
      if (matchIds.length > 0) {
        const { data: vw } = await supabase
          .from('voting_windows')
          .select('match_id, results_published')
          .in('match_id', matchIds)
        const map: Record<string, boolean> = {}
        for (const w of ((vw as Array<{ match_id: string; results_published: boolean }>) ?? [])) {
          map[w.match_id] = w.results_published === true
        }
        setAwardsFinalBy(map)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const active = drafts.find(d => d.id === activeId) ?? null
  const awardsFinal = active ? awardsFinalBy[active.match_id] === true : false

  // Seed the editor when the SELECTED DRAFT changes — during render, keyed on
  // the id, rather than in an effect keyed on the row object. An effect would
  // re-fire on every load() refetch (the object identity changes even when the
  // content doesn't) and silently overwrite whatever the admin had typed since
  // the last save. Keying on the id means a refetch is a no-op and only an
  // actual switch of draft re-seeds.
  if ((active?.id ?? null) !== seededFor) {
    setSeededFor(active?.id ?? null)
    setEdit(active ? toEditable(active) : null)
    setConfirmPublish(false)
  }

  if (!profile?.is_admin) {
    return (
      <div className="px-4 pt-4">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Admins only.</p>
      </div>
    )
  }

  function payloadFrom(e: Editable, current: DraftRow) {
    return {
      summary: e.summary.trim() || null,
      // rows are computed by the generator from predicted_order + the actual
      // standings — they're facts, not prose, so the editor leaves them be
      // and only the note is editable.
      predictions: {
        ...(current.predictions ?? { rows: [] }),
        note: e.predictionsNote.trim() || null,
      },
      key_highlights: e.key_highlights.filter(i => (i.note ?? '').trim()),
      banter: e.banter.filter(i => (i.note ?? '').trim()),
      app_watch: e.app_watch.filter(i => (i.note ?? '').trim()),
      conclusion: e.conclusion.trim() || null,
      closer: e.closer.trim() || null,
    }
  }

  async function save() {
    if (!edit || !active) return
    setBusy('save'); setError(null); setNotice(null)
    const { error: e } = await supabase
      .from('results')
      .update(payloadFrom(edit, active))
      .eq('id', active.id)
    setBusy(null)
    if (e) { setError(e.message); return }
    setNotice('Draft saved. Still not visible to the group.')
    load()
  }

  async function publish() {
    if (!edit || !active) return
    if (!edit.summary.trim()) { setError('A report needs a summary before it goes out.'); return }
    setBusy('publish'); setError(null); setNotice(null)
    // One write: the edits and the status flip land together, so the mig 090
    // trigger sees the final text at the moment it fires the group push.
    const { error: e } = await supabase
      .from('results')
      .update({ ...payloadFrom(edit, active), status: 'published' })
      .eq('id', active.id)
    setBusy(null)
    if (e) { setError(e.message); return }
    setConfirmPublish(false)
    setNotice(awardsFinal
      ? 'Published. The group push goes out within ten minutes.'
      : 'Published and live on the Match tab. The group push waits until voting closes and the awards are in — it will go automatically, you do not need to come back.')
    load()
  }

  return (
    <div className="px-4 pt-4 pb-24">
      <CeefaxHeader
        pageId="P610"
        title="REPORT REVIEW"
        meta={loading ? 'Loading…' : `${drafts.length} draft${drafts.length === 1 ? '' : 's'} awaiting review`}
      />

      {error && (
        <div className="rounded-lg p-3 mb-4" style={{ border: `1px solid ${TT_RED}`, color: TT_RED, fontSize: 13 }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg p-3 mb-4" style={{ border: `1px solid ${TT_GREEN}`, color: TT_GREEN, fontSize: 13 }}>
          {notice}
        </div>
      )}

      {!loading && drafts.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No drafts waiting. The generator runs Friday at 10:05, after the ballot closes —
          anything it writes lands here first.
        </p>
      )}

      {/* Draft picker only appears when there's more than one — a single
          draft is the normal case and doesn't need a chooser. */}
      {drafts.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {drafts.map(d => (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className="active:opacity-70"
              style={{
                ...pillStyle,
                height: 44,
                borderColor: d.id === activeId ? TT_YELLOW : 'var(--color-border)',
                color: d.id === activeId ? TT_YELLOW : 'var(--color-text)',
                fontFamily: MONO,
              }}
            >
              {d.matches?.match_date ?? '—'}
            </button>
          ))}
        </div>
      )}

      {active && edit && (
        <>
          <p className="text-[12px] mb-4" style={{ color: 'var(--color-text-muted)' }}>
            <span style={{ fontFamily: MONO, color: TT_YELLOW }}>{active.matches?.match_date}</span>
            {active.matches?.format ? ` · ${active.matches.format}` : ''} · draft, not visible to the group
          </p>

          <Card title="Summary" hint="the lede">
            <AutoTextarea value={edit.summary} rows={5} onChange={v => setEdit({ ...edit, summary: v })} />
          </Card>

          <Card title="Predicted vs Actual" hint="table is computed — edit the note">
            {(active.predictions?.rows?.length ?? 0) > 0 ? (
              <div className="mb-3 overflow-x-auto">
                <table style={{ fontSize: 13, fontFamily: MONO, borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead>
                    <tr style={{ color: TT_CYAN }}>
                      <th style={{ textAlign: 'left', padding: '2px 10px 6px 0' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '2px 10px 6px 0' }}>Predicted</th>
                      <th style={{ textAlign: 'left', padding: '2px 0 6px 0' }}>Actual</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: 'var(--color-text-muted)' }}>
                    {active.predictions!.rows.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '2px 10px 2px 0' }}>{r.position}</td>
                        <td style={{ padding: '2px 10px 2px 0', whiteSpace: 'nowrap' }}>{r.predicted ?? '—'}</td>
                        <td style={{
                          padding: '2px 0',
                          whiteSpace: 'nowrap',
                          color: r.predicted === r.actual ? TT_GREEN : 'var(--color-text-muted)',
                        }}>{r.actual}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[13px] mb-3" style={{ color: 'var(--color-text-muted)' }}>
                No prediction table for this match.
              </p>
            )}
            <AutoTextarea value={edit.predictionsNote} rows={3} onChange={v => setEdit({ ...edit, predictionsNote: v })} />
          </Card>

          <Card title="Key Highlights">
            <NoteItemEditor items={edit.key_highlights} onChange={v => setEdit({ ...edit, key_highlights: v })} />
          </Card>

          <Card title="Banter & Incidents">
            <NoteItemEditor items={edit.banter} onChange={v => setEdit({ ...edit, banter: v })} />
          </Card>

          <Card title="App Watch">
            <NoteItemEditor items={edit.app_watch} onChange={v => setEdit({ ...edit, app_watch: v })} />
          </Card>

          <Card title="Conclusion" hint="one line per point">
            <AutoTextarea value={edit.conclusion} rows={4} onChange={v => setEdit({ ...edit, conclusion: v })} />
          </Card>

          <Card title="Closer" hint="optional sign-off">
            <input
              value={edit.closer}
              placeholder="Roll on next Thursday."
              onChange={e => setEdit({ ...edit, closer: e.target.value })}
              style={inputStyle}
            />
          </Card>

          {active.scorers && (
            <Card title="Scorers" hint="auto-generated, read-only">
              <p className="text-[13px]" style={{ color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>
                {active.scorers}
              </p>
            </Card>
          )}

          <div className="flex gap-2 mt-6">
            <button
              onClick={save}
              disabled={busy !== null}
              className="active:opacity-70"
              style={{ ...pillStyle, height: 48, flex: 1, opacity: busy ? 0.6 : 1 }}
            >
              {busy === 'save' ? 'Saving…' : 'Save draft'}
            </button>
            <button
              onClick={() => confirmPublish ? publish() : setConfirmPublish(true)}
              disabled={busy !== null}
              className="active:opacity-70"
              style={{
                ...pillStyle,
                height: 48,
                flex: 1,
                borderColor: TT_GREEN,
                color: confirmPublish ? 'var(--color-bg)' : TT_GREEN,
                background: confirmPublish ? TT_GREEN : 'transparent',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy === 'publish' ? 'Publishing…' : confirmPublish ? 'Tap again to send' : 'Publish'}
            </button>
          </div>
          <p className="text-[12px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
            {awardsFinal
              ? 'Publishing makes the report live on the Match tab and pushes the whole group within ten minutes.'
              : 'Voting is still open. Publishing makes the report live on the Match tab now; the group push holds until the awards are in, then goes automatically.'}
          </p>
        </>
      )}
    </div>
  )
}
