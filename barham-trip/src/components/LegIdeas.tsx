import { useState, type FormEvent } from 'react'
import { Lightbulb, Plus, Search, X, Sparkles } from 'lucide-react'
import type { Leg } from '../lib/itinerary'
import { useLegIdeas } from '../hooks/useLegIdeas'
import { useAuth } from '../hooks/useAuth'

interface Props {
  leg: Leg
}

/** "Things to do here" — seed suggestions + family-added ideas people can research. */
export default function LegIdeas({ leg }: Props) {
  const seed = leg.ideas ?? []
  const { userIdeas, addIdea, removeIdea } = useLegIdeas(leg.id)
  const { member, members } = useAuth()

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')

  const nameFor = (id: string | null) =>
    id ? members.find((m) => m.id === id)?.display_name ?? 'Someone' : 'Someone'

  const searchUrl = (t: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`${t} ${leg.title}`)}`

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await addIdea(title, note)
    setTitle('')
    setNote('')
    setOpen(false)
  }

  return (
    <section
      id="leg-ideas"
      className="rounded-card p-4 shadow-card"
      style={{
        background: '#fff',
        border: '1px solid rgba(14,58,72,0.1)',
        backgroundClip: 'padding-box',
        scrollMarginTop: 72,
      }}
    >
      <div className="flex items-center gap-2">
        <Lightbulb size={18} style={{ color: 'var(--coral-dark)' }} />
        <h3 className="font-display text-lg text-navy">Things to do in {leg.title}</h3>
      </div>
      <p className="mt-1 text-[13px] text-navy/60">
        Ideas to research — tap the search icon to look one up, or add your own for everyone to see.
      </p>

      {/* Add-your-own */}
      {member &&
        (open ? (
          <form onSubmit={handleAdd} className="mt-3 rounded-xl p-3" style={{ background: 'var(--sand-2)' }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Idea (e.g. Boat trip to see whales)"
              autoFocus
              className="w-full rounded-lg bg-white px-3 py-2.5 text-[15px] outline-none"
              style={{ border: '1px solid rgba(14,58,72,0.18)' }}
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
              className="mt-2 w-full rounded-lg bg-white px-3 py-2.5 text-[14px] outline-none"
              style={{ border: '1px solid rgba(14,58,72,0.18)' }}
            />
            <div className="mt-2 flex gap-2">
              <button type="submit" disabled={!title.trim()} className="btn-coral flex-1 disabled:opacity-50" style={{ minHeight: 44 }}>
                Add idea
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setTitle('')
                  setNote('')
                }}
                className="rounded-xl px-4 font-semibold text-navy/70"
                style={{ border: '1px solid rgba(14,58,72,0.18)', minHeight: 44 }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-white"
            style={{ background: 'var(--coral)', minHeight: 40 }}
          >
            <Plus size={16} /> Add an idea
          </button>
        ))}

      {/* Family-added ideas */}
      {userIdeas.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-navy/45">
            <Sparkles size={13} style={{ color: 'var(--coral-dark)' }} /> Added by the family
          </div>
          <ul className="space-y-2">
            {userIdeas.map((idea) => (
              <li
                key={idea.id}
                className="flex items-start gap-2 rounded-xl p-3"
                style={{ background: 'var(--sand-2)', border: '1px solid rgba(224,136,83,0.22)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-navy">{idea.title}</div>
                  {idea.note && <div className="mt-0.5 text-[13px] text-navy/65">{idea.note}</div>}
                  <div className="mt-1 text-[12px] font-medium" style={{ color: 'var(--teal)' }}>
                    — {nameFor(idea.added_by)}
                  </div>
                </div>
                <a
                  href={searchUrl(idea.title)}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg"
                  style={{ background: '#fff', border: '1px solid rgba(14,58,72,0.12)' }}
                  aria-label={`Search ${idea.title}`}
                >
                  <Search size={15} style={{ color: 'var(--navy)' }} />
                </a>
                {member && idea.added_by === member.id && (
                  <button
                    onClick={() => removeIdea(idea.id)}
                    className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-navy/40"
                    aria-label="Remove idea"
                  >
                    <X size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Seed suggestions */}
      {seed.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-navy/45">
            Suggestions
          </div>
          <ul className="divide-y" style={{ borderColor: 'rgba(14,58,72,0.07)' }}>
            {seed.map((idea, i) => (
              <li key={i} className="flex items-start gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-navy">{idea.title}</div>
                  {idea.note && <div className="mt-0.5 text-[13px] leading-snug text-navy/65">{idea.note}</div>}
                </div>
                <a
                  href={searchUrl(idea.title)}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg"
                  style={{ background: 'var(--sand-2)' }}
                  aria-label={`Search ${idea.title}`}
                >
                  <Search size={15} style={{ color: 'var(--coral-dark)' }} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
