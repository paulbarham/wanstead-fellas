// "A report draft is waiting" bar on the Admin dashboard.
//
// The Friday generator pushes Paul directly, but a push is easy to swipe away
// on a Friday morning. This is the fallback route back to the draft: it only
// renders when something is actually waiting, so on a normal day the admin
// dashboard looks exactly as it did before.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ReportDraftBanner() {
  const navigate = useNavigate()
  const [count, setCount] = useState(0)
  const [latest, setLatest] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('results')
        .select('id, matches!inner(match_date)')
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
      if (cancelled) return
      const rows = (data as unknown as Array<{ matches: { match_date: string } | null }>) ?? []
      setCount(rows.length)
      setLatest(rows[0]?.matches?.match_date ?? null)
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (count === 0) return null

  return (
    <button
      onClick={() => navigate('/admin/report-review')}
      className="w-full text-left rounded-xl mb-3 px-4 py-3 active:opacity-70"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--tt-yellow)',
        backgroundClip: 'padding-box',
        minHeight: 44,
      }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--tt-yellow)' }}>
          📝 {count === 1 ? 'Match report draft ready' : `${count} match report drafts ready`}
        </span>
        {latest && (
          <span className="text-[12px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            {latest}
          </span>
        )}
      </div>
      <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
        Not visible to the group yet — tap to review and publish.
      </p>
    </button>
  )
}
