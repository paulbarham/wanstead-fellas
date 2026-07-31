import { useState, type FormEvent } from 'react'
import { Check, Plus, Pencil, Trash2, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useBookings } from '../hooks/useBookings'
import { useAuth } from '../hooks/useAuth'
import type { BookingRow } from '../store/local'

export default function Bookings() {
  const { bookings, toggle, add, edit, remove } = useBookings()
  const { members } = useAuth()

  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const done = bookings.filter((b) => b.checked).length

  function whoTicked(byId: string | null, at: string | null): string | null {
    if (!byId) return null
    const who = members.find((m) => m.id === byId)?.display_name ?? 'Someone'
    let when = ''
    try {
      if (at) when = ` · ${format(parseISO(at), 'd MMM')}`
    } catch {
      /* ignore */
    }
    return `${who}${when}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl text-navy">Bookings</h1>
          <p className="mt-1 text-[14px] text-navy/65">Shared checklist — edit and tick together.</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl" style={{ color: 'var(--coral)' }}>
            {done}/{bookings.length}
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/45">done</div>
        </div>
      </div>

      {/* Add */}
      {addOpen ? (
        <BookingForm
          onCancel={() => setAddOpen(false)}
          onSave={async (name, note) => {
            await add(name, note)
            setAddOpen(false)
          }}
        />
      ) : (
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-white"
          style={{ background: 'var(--coral)', minHeight: 40 }}
        >
          <Plus size={16} /> Add a booking
        </button>
      )}

      <ul className="space-y-2">
        {bookings.map((b) =>
          editingId === b.id ? (
            <li key={b.id}>
              <BookingForm
                initial={b}
                onCancel={() => setEditingId(null)}
                onSave={async (name, note) => {
                  await edit(b.id, name, note)
                  setEditingId(null)
                }}
              />
            </li>
          ) : (
            <li key={b.id}>
              <div
                className="flex items-start gap-3 rounded-card bg-white p-3.5 shadow-card"
                style={{ border: '1px solid rgba(14,58,72,0.08)' }}
              >
                <button
                  onClick={() => toggle(b)}
                  className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-md transition"
                  style={{
                    background: b.checked ? 'var(--coral)' : 'transparent',
                    border: b.checked ? '1px solid var(--coral)' : '1.5px solid rgba(14,58,72,0.25)',
                  }}
                  aria-label={b.checked ? 'Untick' : 'Tick'}
                >
                  {b.checked && <Check size={16} color="#fff" strokeWidth={3} />}
                </button>

                <button onClick={() => toggle(b)} className="min-w-0 flex-1 text-left">
                  <div
                    className="text-[15px] font-semibold text-navy"
                    style={{ textDecoration: b.checked ? 'line-through' : 'none', opacity: b.checked ? 0.6 : 1 }}
                  >
                    {b.name}
                  </div>
                  {b.note && <div className="mt-0.5 text-[13px] leading-snug text-navy/60">{b.note}</div>}
                  {b.checked && whoTicked(b.checked_by, b.checked_at) && (
                    <div className="mt-1 text-[12px] font-medium" style={{ color: 'var(--teal)' }}>
                      ✓ {whoTicked(b.checked_by, b.checked_at)}
                    </div>
                  )}
                </button>

                <div className="flex flex-shrink-0 flex-col gap-1">
                  <button
                    onClick={() => setEditingId(b.id)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-navy/40"
                    aria-label="Edit booking"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => remove(b.id)}
                    className="grid h-8 w-8 place-items-center rounded-lg"
                    style={{ color: 'var(--coral-dark)' }}
                    aria-label="Delete booking"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </li>
          ),
        )}
      </ul>

      {bookings.length === 0 && (
        <p className="py-6 text-center text-[14px] text-navy/50">
          No bookings yet — tap “Add a booking”.
        </p>
      )}
    </div>
  )
}

function BookingForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: BookingRow
  onSave: (name: string, note: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [note, setNote] = useState(initial?.note ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave(name, note)
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card p-3"
      style={{ background: 'var(--sand-2)', border: '1px solid rgba(224,136,83,0.28)' }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Booking (e.g. Yosemite tour)"
        autoFocus
        className="w-full rounded-lg bg-white px-3 py-2.5 text-[15px] outline-none"
        style={{ border: '1px solid rgba(14,58,72,0.18)' }}
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note — date, confirmation ref, who booked…"
        className="mt-2 w-full rounded-lg bg-white px-3 py-2.5 text-[14px] outline-none"
        style={{ border: '1px solid rgba(14,58,72,0.18)' }}
      />
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={!name.trim()} className="btn-coral flex-1 disabled:opacity-50" style={{ minHeight: 44 }}>
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-xl px-4 font-semibold text-navy/70"
          style={{ border: '1px solid rgba(14,58,72,0.18)', minHeight: 44 }}
        >
          <X size={16} /> Cancel
        </button>
      </div>
    </form>
  )
}
