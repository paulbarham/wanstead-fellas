import { useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ListChecks, Plus, X, Check, Star, Search, GripVertical } from 'lucide-react'
import type { TripDay, Idea, IdeaCategory } from '../lib/itinerary'
import { getLegForDay } from '../lib/itinerary'
import { CATEGORY_META } from '../lib/ideaCategories'
import { arrayMove } from '../lib/arrayMove'
import { useDayPlan } from '../hooks/useDayPlan'
import { useAuth } from '../hooks/useAuth'

interface Props {
  day: TripDay
}

const categoryLabel = (cat?: IdeaCategory) =>
  CATEGORY_META.find((c) => c.key === (cat ?? 'other'))?.label ?? 'More ideas'

/** "Plan for the day" — the family-curated list of activities for this day.
 *  Search the place's things-to-do (must-dos first, grouped by category) or
 *  type your own, tick them off, and remove any the group decides against. */
export default function DayPlan({ day }: Props) {
  const { items, addItem, toggleDone, removeItem, reorder } = useDayPlan(day.n)
  const { member, members, isAdmin } = useAuth()
  const leg = getLegForDay(day.n)
  const ideas = useMemo(() => leg?.ideas ?? [], [leg])

  // Drag-to-reorder state. `dragOrder` holds the live order while dragging.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  const displayItems = dragOrder
    ? (dragOrder.map((id) => items.find((i) => i.id === id)).filter(Boolean) as typeof items)
    : items

  function beginDrag(e: ReactPointerEvent, id: string) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragId(id)
    setDragOrder(items.map((i) => i.id))
  }

  function onDragMove(e: ReactPointerEvent) {
    if (!dragId || !dragOrder) return
    const ids = dragOrder
    const y = e.clientY
    let target = ids.length - 1
    for (let k = 0; k < ids.length; k++) {
      const el = rowRefs.current.get(ids[k])
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) {
        target = k
        break
      }
    }
    const from = ids.indexOf(dragId)
    if (from !== -1 && from !== target) setDragOrder(arrayMove(ids, from, target))
  }

  function endDrag() {
    if (dragOrder && dragId) reorder(dragOrder)
    setDragId(null)
    setDragOrder(null)
  }

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')

  const nameFor = (id: string | null | undefined) =>
    id ? members.find((m) => m.id === id)?.display_name ?? 'Someone' : 'Someone'

  const q = title.trim().toLowerCase()

  // Suggestions matching what's typed (title or note). Empty query → everything.
  const matches = useMemo(
    () =>
      ideas.filter(
        (i) =>
          !q ||
          i.title.toLowerCase().includes(q) ||
          (i.note ?? '').toLowerCase().includes(q),
      ),
    [ideas, q],
  )
  const mustDo = matches.filter((i) => i.recommended)
  const searchResults = [
    ...matches.filter((i) => i.recommended),
    ...matches.filter((i) => !i.recommended),
  ]
  // When browsing (no query), group the non-must-do items by category.
  const groups = CATEGORY_META.map((meta) => ({
    ...meta,
    items: matches.filter((i) => (i.category ?? 'other') === meta.key && !i.recommended),
  })).filter((g) => g.items.length > 0)

  function pick(idea: Idea) {
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

  function cancel() {
    setOpen(false)
    setTitle('')
    setNote('')
  }

  const done = items.filter((i) => i.done).length

  function Suggestion({ idea, showCategory }: { idea: Idea; showCategory?: boolean }) {
    const selected = idea.title === title
    return (
      <button
        type="button"
        onClick={() => pick(idea)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left active:opacity-70"
        style={{ background: selected ? 'var(--sand-2)' : 'transparent' }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-navy">{idea.title}</span>
            {idea.recommended && (
              <Star size={12} fill="var(--coral)" strokeWidth={0} />
            )}
            {showCategory && (
              <span className="text-[11px] font-medium text-navy/40">{categoryLabel(idea.category)}</span>
            )}
          </div>
          {idea.note && <div className="mt-0.5 truncate text-[12px] text-navy/55">{idea.note}</div>}
        </div>
        {selected ? (
          <Check size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--teal)' }} />
        ) : (
          <Plus size={16} className="mt-0.5 flex-shrink-0 text-navy/35" />
        )}
      </button>
    )
  }

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
          Nothing planned yet. Add activities from the ideas here — or your own — and tick them off as you go.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {displayItems.map((item) => {
            const dragging = dragId === item.id
            return (
              <li
                key={item.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(item.id, el)
                  else rowRefs.current.delete(item.id)
                }}
                className="flex items-start gap-2 rounded-xl p-3"
                style={{
                  background: 'var(--sand-2)',
                  border: `1px solid ${dragging ? 'rgba(224,136,83,0.5)' : 'rgba(14,58,72,0.08)'}`,
                  boxShadow: dragging ? '0 8px 24px rgba(0,0,0,0.18)' : 'none',
                  opacity: dragOrder && !dragging ? 0.85 : 1,
                }}
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
                {member && displayItems.length > 1 && (
                  <button
                    onPointerDown={(e) => beginDrag(e, item.id)}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className="grid h-8 w-8 flex-shrink-0 cursor-grab touch-none place-items-center rounded-lg text-navy/30 active:cursor-grabbing"
                    style={{ touchAction: 'none' }}
                    aria-label={`Drag to reorder ${item.title}`}
                  >
                    <GripVertical size={16} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {items.length > 1 && member && (
        <p className="mt-2 text-[12px] italic text-navy/40">Drag the ⠿ handle to put activities in order.</p>
      )}
      {items.length > 0 && member && !isAdmin && (
        <p className="mt-1 text-[12px] italic text-navy/40">Ask Dad to remove anything the group drops.</p>
      )}

      {/* Add */}
      {member &&
        (open ? (
          <form onSubmit={handleAdd} className="mt-3 rounded-xl p-3" style={{ background: 'var(--sand-2)' }}>
            {/* Type-to-search over the place's things to do (or type your own). */}
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35" />
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Search activities or type your own"
                autoFocus
                className="w-full rounded-lg bg-white py-2.5 pl-9 pr-3 text-[15px] outline-none"
                style={{ border: '1px solid rgba(14,58,72,0.18)' }}
              />
            </div>

            {ideas.length > 0 && (
              <div
                className="mt-2 max-h-64 overflow-y-auto rounded-lg bg-white"
                style={{ border: '1px solid rgba(14,58,72,0.14)' }}
              >
                {q !== '' ? (
                  searchResults.length > 0 ? (
                    <div className="divide-y" style={{ borderColor: 'rgba(14,58,72,0.06)' }}>
                      {searchResults.map((idea) => (
                        <Suggestion key={idea.title} idea={idea} showCategory />
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-3 text-[13px] text-navy/55">
                      No matches — tap “Add to the day” to create “{title.trim()}”.
                    </div>
                  )
                ) : (
                  <>
                    {mustDo.length > 0 && (
                      <div>
                        <GroupHeader Icon={Star} label="Must-do" count={mustDo.length} />
                        <div className="divide-y" style={{ borderColor: 'rgba(14,58,72,0.06)' }}>
                          {mustDo.map((idea) => (
                            <Suggestion key={idea.title} idea={idea} />
                          ))}
                        </div>
                      </div>
                    )}
                    {groups.map((g) => (
                      <div key={g.key}>
                        <GroupHeader Icon={g.Icon} label={g.label} count={g.items.length} />
                        <div className="divide-y" style={{ borderColor: 'rgba(14,58,72,0.06)' }}>
                          {g.items.map((idea) => (
                            <Suggestion key={idea.title} idea={idea} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

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
                onClick={cancel}
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

function GroupHeader({
  Icon,
  label,
  count,
}: {
  Icon: typeof Star
  label: string
  count: number
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5"
      style={{ background: 'var(--sand-2)' }}
    >
      <Icon size={13} style={{ color: 'var(--coral-dark)' }} />
      <span className="text-[11px] font-bold uppercase tracking-wide text-navy/55">{label}</span>
      <span className="text-[11px] font-semibold text-navy/30">{count}</span>
    </div>
  )
}
