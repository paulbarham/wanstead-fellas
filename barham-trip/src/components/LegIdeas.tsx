import { useState, type FormEvent } from 'react'
import { Lightbulb, Plus, MapPin, X, Star, ExternalLink } from 'lucide-react'
import type { Leg, Idea, IdeaCategory, IdeaSuits } from '../lib/itinerary'
import { CATEGORY_META, PICKABLE_CATEGORIES } from '../lib/ideaCategories'
import { useLegIdeas } from '../hooks/useLegIdeas'
import { useAuth } from '../hooks/useAuth'
import type { UserIdea } from '../store/local'

interface Props {
  leg: Leg
}

/** A row in the grouped list — either a seed suggestion or a family-added idea. */
type Row = {
  key: string
  title: string
  note?: string | null
  category: IdeaCategory
  suits?: IdeaSuits
  recommended?: boolean
  url?: string
  addedBy?: string | null
}

const SUITS_META: Record<IdeaSuits, { label: string; bg: string; fg: string }> = {
  all: { label: 'All ages', bg: 'rgba(14,58,72,0.08)', fg: 'var(--teal, #4a8896)' },
  littles: { label: 'Little ones', bg: 'rgba(224,136,83,0.16)', fg: 'var(--coral-dark)' },
  teens: { label: 'Teens', bg: 'rgba(74,136,150,0.16)', fg: 'var(--teal, #4a8896)' },
  adults: { label: 'Grown-ups', bg: 'rgba(14,58,72,0.1)', fg: 'var(--navy, #0e3a48)' },
}

/** "Things to do here" — seed suggestions + family-added ideas, grouped by
 *  category (sights, food, playgrounds, …) and tagged by who they suit. */
export default function LegIdeas({ leg }: Props) {
  const seed: Idea[] = leg.ideas ?? []
  const { userIdeas, addIdea, removeIdea } = useLegIdeas(leg.id)
  const { member, members } = useAuth()

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState<IdeaCategory>('sights')

  const nameFor = (id: string | null | undefined) =>
    id ? members.find((m) => m.id === id)?.display_name ?? 'Someone' : 'Someone'

  const mapsUrl = (t: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${t}, ${leg.title}`)}`

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await addIdea(title, note, category)
    setTitle('')
    setNote('')
    setCategory('sights')
    setOpen(false)
  }

  // Merge seed + family ideas into one categorised list.
  const rows: Row[] = [
    ...seed.map((idea, i) => ({
      key: `seed-${i}`,
      title: idea.title,
      note: idea.note,
      category: (idea.category ?? 'other') as IdeaCategory,
      suits: idea.suits,
      recommended: idea.recommended,
      url: idea.url,
    })),
    ...userIdeas.map((idea: UserIdea) => ({
      key: `user-${idea.id}`,
      title: idea.title,
      note: idea.note,
      category: (idea.category ?? 'other') as IdeaCategory,
      addedBy: idea.added_by,
    })),
  ]

  const groups = CATEGORY_META.map((meta) => ({
    ...meta,
    items: rows.filter((r) => r.category === meta.key),
  })).filter((g) => g.items.length > 0)

  const idOf = (key: string) => key.replace(/^user-/, '')

  return (
    <section
      id="leg-ideas"
      className="rounded-card p-4 shadow-card"
      style={{
        background: 'var(--surface)',
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
        Grouped by type and tagged for who they suit. Tap the map pin to find one, or add your own.
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
            <label className="mt-2 block text-[12px] font-semibold text-navy/60">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as IdeaCategory)}
              className="mt-1 w-full rounded-lg bg-white px-3 py-2.5 text-[14px] outline-none"
              style={{ border: '1px solid rgba(14,58,72,0.18)' }}
            >
              {PICKABLE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
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
                  setCategory('sights')
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

      {/* Grouped ideas */}
      <div className="mt-4 space-y-5">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <group.Icon size={15} style={{ color: 'var(--coral-dark)' }} />
              <span className="text-[12px] font-bold uppercase tracking-wide text-navy/55">
                {group.label}
              </span>
              <span className="text-[12px] font-semibold text-navy/30">{group.items.length}</span>
            </div>
            {group.key === 'food' && (
              <p className="mb-1.5 text-[12px] italic text-navy/45">Picks skip seafood.</p>
            )}
            <ul className="divide-y" style={{ borderColor: 'rgba(14,58,72,0.07)' }}>
              {group.items.map((row) => {
                const suits = row.suits ? SUITS_META[row.suits] : null
                const isUser = row.key.startsWith('user-')
                return (
                  <li key={row.key} className="flex items-start gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[15px] font-semibold text-navy">{row.title}</span>
                        {row.recommended && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                            style={{ background: 'var(--coral)' }}
                          >
                            <Star size={9} fill="currentColor" strokeWidth={0} /> Must-do
                          </span>
                        )}
                        {suits && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{ background: suits.bg, color: suits.fg }}
                          >
                            {suits.label}
                          </span>
                        )}
                      </div>
                      {row.note && (
                        <div className="mt-0.5 text-[13px] leading-snug text-navy/65">{row.note}</div>
                      )}
                      {isUser && (
                        <div className="mt-0.5 text-[12px] font-medium" style={{ color: 'var(--teal)' }}>
                          — {nameFor(row.addedBy)}
                        </div>
                      )}
                    </div>
                    {row.url && (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg"
                        style={{ background: 'var(--sand-2)' }}
                        aria-label={`Open the ${row.title} website`}
                      >
                        <ExternalLink size={14} style={{ color: 'var(--teal)' }} />
                      </a>
                    )}
                    <a
                      href={mapsUrl(row.title)}
                      target="_blank"
                      rel="noreferrer"
                      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg"
                      style={{ background: 'var(--sand-2)' }}
                      aria-label={`Open ${row.title} in Maps`}
                    >
                      <MapPin size={15} style={{ color: 'var(--coral-dark)' }} />
                    </a>
                    {isUser && member && row.addedBy === member.id && (
                      <button
                        onClick={() => removeIdea(idOf(row.key))}
                        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-navy/40"
                        aria-label="Remove idea"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
