import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Feedback, Profile } from '../types'

const CATEGORIES = ['Bug Report', 'Feature Request', 'Design Feedback', 'General']

const CATEGORY_HINTS: Record<string, string> = {
  'Bug Report': 'Something broken? Tell us exactly what happened and on which screen.',
  'Feature Request': 'Got an idea to improve the app? Describe what you\'d love to see.',
  'Design Feedback': 'Something looks off or could look better? Let us know.',
  'General': 'Anything else — questions, suggestions, thoughts, complaints...',
}

export default function FeedbackPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.is_admin ?? false

  return isAdmin ? <AdminFeedbackView /> : <PlayerFeedbackForm />
}

function PlayerFeedbackForm() {
  const { profile } = useAuth()
  const [category, setCategory] = useState('General')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSubmitting(true)
    setError('')

    const { error } = await supabase.from('feedback').insert({
      player_id: profile.id,
      category,
      subject,
      message,
    })

    setSubmitting(false)
    if (error) {
      setError(error.message)
    } else {
      setSubmitted(true)
      setSubject('')
      setMessage('')
    }
  }

  if (submitted) {
    return (
      <div className="px-4 py-5">
        <div className="text-center py-16">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="font-semibold text-white text-lg mb-2">Thanks for your feedback!</h2>
          <p className="text-sm mb-6" style={{ color: '#888' }}>We'll review it soon.</p>
          <button
            onClick={() => setSubmitted(false)}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#0D6B52', color: 'white' }}
          >
            Send another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-5">
      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: '#0D6B52' }}>
        Have a say
      </p>
      <h1 className="font-display text-3xl text-white tracking-wide mb-5">FEEDBACK</h1>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#2a0a0a', color: '#ff6b6b', border: '1px solid #5a1a1a' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#888' }}>Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
            style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="mt-1.5 text-xs" style={{ color: '#555' }}>{CATEGORY_HINTS[category]}</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#888' }}>Subject</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
            style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
            placeholder="One-line summary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#888' }}>Message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            required
            rows={5}
            className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none resize-none"
            style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
            placeholder="Tell us more..."
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
          style={{ background: '#0D6B52', color: 'white' }}
        >
          {submitting ? 'Submitting...' : 'Submit Feedback'}
        </button>
      </form>
    </div>
  )
}

interface FeedbackWithProfile extends Feedback {
  profile?: Pick<Profile, 'name' | 'surname'>
}

function AdminFeedbackView() {
  const [items, setItems] = useState<FeedbackWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterReviewed, setFilterReviewed] = useState<'all' | 'unreviewed' | 'reviewed'>('all')

  useEffect(() => {
    async function load() {
      const { data: feedbackData } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false })

      if (!feedbackData) { setLoading(false); return }

      const playerIds = [...new Set((feedbackData as Feedback[]).map(f => f.player_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, surname')
        .in('id', playerIds)

      const profileMap: Record<string, Pick<Profile, 'name' | 'surname'>> = {}
      for (const p of (profiles as Profile[]) || []) profileMap[p.id] = p

      setItems((feedbackData as Feedback[]).map(f => ({
        ...f,
        profile: profileMap[f.player_id],
      })))
      setLoading(false)
    }
    load()
  }, [])

  async function toggleReviewed(id: string, current: boolean) {
    await supabase.from('feedback').update({ reviewed: !current }).eq('id', id)
    setItems(prev => prev.map(f => f.id === id ? { ...f, reviewed: !current } : f))
  }

  const filtered = items
    .filter(f => filterCategory === 'All' || f.category === filterCategory)
    .filter(f => {
      if (filterReviewed === 'reviewed') return f.reviewed
      if (filterReviewed === 'unreviewed') return !f.reviewed
      return true
    })

  const unreviewed = items.filter(f => !f.reviewed).length

  return (
    <div className="px-4 py-5">
      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: '#0D6B52' }}>Admin</p>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-3xl text-white tracking-wide">FEEDBACK</h1>
        {unreviewed > 0 && (
          <span className="text-xs px-2 py-1 rounded-full font-medium"
            style={{ background: '#0D6B52', color: 'white' }}>
            {unreviewed} new
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['All', ...CATEGORIES].map(c => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: filterCategory === c ? '#0D6B52' : '#1e1e1e',
                color: filterCategory === c ? 'white' : '#888',
                border: `1px solid ${filterCategory === c ? '#0D6B52' : '#2e2e2e'}`,
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {(['all', 'unreviewed', 'reviewed'] as const).map(v => (
            <button
              key={v}
              onClick={() => setFilterReviewed(v)}
              className="px-3 py-1.5 rounded-full text-xs font-medium capitalize"
              style={{
                background: filterReviewed === v ? '#1e1e1e' : 'transparent',
                color: filterReviewed === v ? 'white' : '#555',
                border: `1px solid ${filterReviewed === v ? '#2e2e2e' : 'transparent'}`,
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: '#888' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10" style={{ color: '#555' }}>
          <p>No feedback found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <div key={item.id} className="p-4 rounded-2xl"
              style={{
                background: '#141414',
                border: `1px solid ${item.reviewed ? '#2e2e2e' : '#0D6B52'}`,
                opacity: item.reviewed ? 0.7 : 1,
              }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: '#1e1e1e', color: '#888', border: '1px solid #2e2e2e' }}>
                      {item.category}
                    </span>
                    <span className="font-semibold text-white text-sm">{item.subject}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                    {item.profile ? `${item.profile.name} ${item.profile.surname}` : 'Unknown'} ·{' '}
                    {format(new Date(item.created_at), 'dd MMM yyyy HH:mm')}
                  </p>
                </div>
                <button
                  onClick={() => toggleReviewed(item.id, item.reviewed)}
                  className="flex-shrink-0 text-xs px-2 py-1 rounded-lg"
                  style={{
                    background: item.reviewed ? '#1e1e1e' : '#0a1a10',
                    color: item.reviewed ? '#555' : '#4ade80',
                    border: `1px solid ${item.reviewed ? '#2e2e2e' : '#4ade80'}`,
                  }}
                >
                  {item.reviewed ? 'Reviewed' : 'Mark done'}
                </button>
              </div>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: '#ccc' }}>{item.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
