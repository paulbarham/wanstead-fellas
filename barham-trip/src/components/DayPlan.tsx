import { useState, type FormEvent } from 'react'
import { ListChecks, Plus, X, Check } from 'lucide-react'
import type { TripDay } from '../lib/itinerary'
import { getLegForDay } from '../lib/itinerary'
import { useDayPlan } from '../hooks/useDayPlan'
import { useAuth } from '../hooks/useAuth'

interface Props {
  day: TripDay
}

/** "Plan for the day" — the family-curated list of activities for this day.
 *  Add from the place's things-to-do (or type your own), tick them off, and
 *  remove any the group decides against. Shared and offline-safe. */
export default function DayPlan({ day }: Props) {
  const { items, addItem, toggleDone, removeItem } = useDayPlan(day.n)
  const { member, members, isAdmin } = useAuth()
  const leg = getLegForDay(day.n)
  const ideas = leg?.ideas ?? []

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')

  const nameFor = (id: string | null | undefined) =>
    id ? members.find((m) => m.id === id)?.display_name ?? 'Someone' : 'Someone'

  function pickIdea(value: string) {
    const idea = ideas.find((i) => i.title === value)
    if (!idea) return
    setTitle(idea.title)
    setNote(idea.note ?? '')
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await addItem(title, note)
    setTitle('')
    setNote('')
    setOpen(false)
  }

  const done = items.filter((i) => i.done).length

  return (
    <section
      className="rounded-card p-4 shadow-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid rgba(14,58,72,0.1)',
        backgroundClip: 'padding-box',
      }}
    >
      <div className="flex items-center gap-2">
        <ListChecks size={18} style={{ color: 'var(--coral-dark)' }} />
        <h3 className="font-display text-lg text-navy">Plan for the day</h3>
        {items.length > 0 && (
          <span className="ml-auto text-[12px] font-semibold text-navy/40">
            {done}/{items.length} done
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-1 text-[13px] text-navy/60">
          Nothing planned yet. Add activities from the ideas below — or your own — and tick them off as you go.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2.5 rounded-xl p-3"
              style={{ background: 'var(--sand-2)', border: '1px solid rgba(14,58,72,0.08)' }}
            >
              <button
                onClick={() => toggleDone(item.id, !item.done)}
                className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-md"
                style={{
                  background: item.done ? 'var(--coral)' : 'var(--surface)',
                  border: item.done ? 'none' : '1px solid rgba(14,58,72,0.25)',
                }}
                aria-label={item.done ? 'Mark not done' : 'Mark done'}
              >
                {item.done && <Check size={15} className="text-white" />}
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[15px] font-semibold text-navy ${item.done ? 'line-through opacity-55' : ''}`}
                >
                  {item.title}
                </div>
                {item.note && (
                  <div className={`mt-0.5 text-[13px] leading-snug text-navy/65 ${item.done ? 'opacity-55' : ''}`}>
                    {item.note}
                  </div>
                )}
                <div className="mt-1 text-[12px] font-medium" style={{ color: 'var(--teal)' }}>
                  — {nameFor(item.added_by)}
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => removeItem(item.id)}
                  className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-navy/40"
                  aria-label={`Remove ${item.title}`}
                >
                  <X size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && member && !isAdmin && (
        <p className="mt-2 text-[12px] italic text-navy/40">Ask Dad to remove anything the group drops.</p>
      )}

      {/* Add */}
      {member &&
        (open ? (
          <form onSubmit={handleAdd} className="mt-3 rounded-xl p-3" style={{ background: 'var(--sand-2)' }}>
            {ideas.length > 0 && (
              <>
                <label className="block text-[12px] font-semibold text-navy/60">
                  Pick from things to do here
                </label>
                <select
                  value=""
                  onChange={(e) => pickIdea(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-white px-3 py-2.5 text-[14px] outline-none"
                  style={{ border: '1px solid rgba(14,58,72,0.18)' }}
                >
                  <option value="">Choose an activity…</option>
                  {ideas.map((idea) => (
                    <option key={idea.title} value={idea.title}>
                      {idea.title}
                    </option>
                  ))}
                </select>
                <div className="my-2 text-center text-[12px] font-medium text-navy/40">or add your own</div>
              </>
            )}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Activity (e.g. Breakfast at Porto's)"
              autoFocus
              className="w-full rounded-lg bg-white px-3 py-2.5 text-[15px] outline-none"
              style={{ border: '1px solid rgba(14,58,72,0.18)' }}
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note (time, who's going…)"
              className="mt-2 w-full rounded-lg bg-white px-3 py-2.5 text-[14px] outline-none"
              style={{ border: '1px solid rgba(14,58,72,0.18)' }}
            />
            <div className="mt-2 flex gap-2">
              <button type="submit" disabled={!title.trim()} className="btn-coral flex-1 disabled:opacity-50" style={{ minHeight: 44 }}>
                Add to the day
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
            <Plus size={16} /> Add an activity
          </button>
        ))}
    </section>
  )
}
