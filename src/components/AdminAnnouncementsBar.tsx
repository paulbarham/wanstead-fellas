import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { nextNineAmUk, formatNineAmUkLabel } from '../lib/nextNineAmUk'

// Admin-only bar for broadcasting a "what's new" push at the next 9am UK.
// Sits at the top of AdminPage (above the tab strip) so it's always one
// tap away when a feature ships. Also renders a compact pending/last-sent
// strip so it's obvious whether anything's queued.
//
// Table: feature_announcements (mig 079).
// Delivery: pg_cron every 15 min → send-feature-announcement edge fn →
// every push_subscription.

interface AnnouncementRow {
  id: string
  title: string
  body: string
  url: string | null
  created_at: string
  scheduled_for: string
  sent_at: string | null
  sent_count: number | null
  total_subs: number | null
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatScheduled(iso: string): string {
  return formatNineAmUkLabel(new Date(iso))
}

export default function AdminAnnouncementsBar() {
  const { profile } = useAuth()
  const [pending, setPending] = useState<AnnouncementRow[]>([])
  const [recent, setRecent] = useState<AnnouncementRow | null>(null)
  const [showModal, setShowModal] = useState(false)

  const load = useCallback(async () => {
    const [{ data: pend }, { data: last }] = await Promise.all([
      supabase.from('feature_announcements')
        .select('*')
        .is('sent_at', null)
        .order('scheduled_for', { ascending: true }),
      supabase.from('feature_announcements')
        .select('*')
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    setPending((pend as AnnouncementRow[] | null) ?? [])
    setRecent((last as AnnouncementRow | null) ?? null)
  }, [])

  useEffect(() => { load() }, [load])

  if (!profile?.is_admin) return null

  return (
    <>
      <div className="mb-3 rounded-xl"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          backgroundClip: 'padding-box',
        }}>
        <div className="px-3 py-2 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: 'var(--tt-cyan, var(--color-primary))' }}>
              📣 Feature announcement
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {pending.length > 0 ? (
                <>
                  {pending.length} pending — next fires {formatScheduled(pending[0].scheduled_for)}
                </>
              ) : recent ? (
                <>Last sent {timeAgo(recent.sent_at as string)} · {recent.sent_count ?? '—'}/{recent.total_subs ?? '—'} delivered</>
              ) : (
                <>No announcements sent yet.</>
              )}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
          >
            + New
          </button>
        </div>
      </div>

      {showModal && (
        <AnnouncementModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
          createdBy={profile.id}
        />
      )}
    </>
  )
}

function AnnouncementModal({ onClose, onSaved, createdBy }: {
  onClose: () => void
  onSaved: () => void
  createdBy: string
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Recompute the scheduled_for each render so the preview stays live if
  // the composer's open across the 9am boundary.
  const scheduled = nextNineAmUk()

  async function save() {
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    setErr(null)
    const { error } = await supabase
      .from('feature_announcements')
      .insert({
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || '/',
        created_by: createdBy,
        scheduled_for: scheduled.toISOString(),
      })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 430, maxHeight: '85vh',
          background: 'var(--color-surface)',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          boxShadow: '0 -12px 40px rgba(0,0,0,0.55)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          overflowY: 'auto',
        }}>
        {/* Drag-handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: 'var(--color-border)',
          margin: '10px auto',
        }} />

        {/* iOS-style header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <button onClick={onClose}
            className="text-sm"
            style={{ color: 'var(--tt-cyan, var(--color-primary))' }}>
            Cancel
          </button>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            📣 New announcement
          </p>
          <div style={{ width: 48 }} /> {/* balancer */}
        </div>

        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1"
              style={{ color: 'var(--color-text-muted)' }}>
              Title — becomes the push title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. 🩹 Injury list is live"
              maxLength={80}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>

          <div>
            <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1"
              style={{ color: 'var(--color-text-muted)' }}>
                Body — the push copy
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="One-liner. Keep it punchy — most phones truncate the push body after ~150 chars."
              maxLength={200}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            />
            <p className="text-[10px] text-right mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {body.length}/200
            </p>
          </div>

          <div>
            <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1"
              style={{ color: 'var(--color-text-muted)' }}>
              Deep link (optional) — where tapping the push takes the user
            </label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="/profile"
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg text-xs"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {/* Scheduled preview */}
          <div className="px-3 py-2 rounded-lg"
            style={{
              background: 'var(--color-success-bg)',
              color: 'var(--color-primary)',
              border: '1px solid var(--color-primary)',
              fontSize: 11,
            }}>
            ⏰ Will send at <strong>{formatNineAmUkLabel(scheduled)}</strong>.
          </div>

          {err && (
            <div className="px-3 py-2 rounded-lg text-[11px]"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)' }}>
              {err}
            </div>
          )}

          <button
            onClick={save}
            disabled={saving || !title.trim() || !body.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
          >
            {saving ? 'Scheduling…' : '📣 Schedule announcement'}
          </button>
        </div>
      </div>
    </div>
  )
}
