import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLocalStore, type BookingRow } from '../store/local'
import { useAuth } from './useAuth'

/**
 * Editable, shared bookings checklist.
 * Renders from the local store (offline-safe, seeded from the bundled JSON);
 * when Supabase is configured it hydrates from `bookings`, subscribes to
 * realtime, and writes add/edit/remove/toggle optimistically.
 */
export function useBookings() {
  const list = useLocalStore((s) => s.bookingsList)
  const setList = useLocalStore((s) => s.setBookingsList)
  const upsert = useLocalStore((s) => s.upsertBookingRow)
  const removeRow = useLocalStore((s) => s.removeBookingRow)
  const { member } = useAuth()

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase
      .from('bookings')
      .select('id, name, note, sort, checked, checked_by, checked_at')
      .order('sort')
      .then(({ data }) => {
        if (active && data) setList(data as BookingRow[])
      })

    const channel = supabase
      .channel('bookings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { id: string }
          if (old?.id) removeRow(old.id)
        } else {
          upsert(payload.new as BookingRow)
        }
      })
      .subscribe()

    return () => {
      active = false
      supabase?.removeChannel(channel)
    }
  }, [setList, upsert, removeRow])

  async function toggle(row: BookingRow) {
    const checked = !row.checked
    const next: BookingRow = {
      ...row,
      checked,
      checked_by: checked ? member?.id ?? null : null,
      checked_at: checked ? new Date().toISOString() : null,
    }
    upsert(next)
    if (supabase) {
      await supabase
        .from('bookings')
        .update({ checked: next.checked, checked_by: next.checked_by, checked_at: next.checked_at })
        .eq('id', row.id)
    }
  }

  async function add(name: string, note: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const sort = list.reduce((m, b) => Math.max(m, b.sort), -1) + 1
    const row: BookingRow = {
      id: crypto.randomUUID(),
      name: trimmed,
      note: note.trim() || null,
      sort,
      checked: false,
      checked_by: null,
      checked_at: null,
    }
    upsert(row)
    if (supabase) {
      await supabase
        .from('bookings')
        .insert({ id: row.id, name: row.name, note: row.note, sort: row.sort })
    }
  }

  async function edit(id: string, name: string, note: string) {
    const row = list.find((b) => b.id === id)
    if (!row) return
    const next: BookingRow = { ...row, name: name.trim(), note: note.trim() || null }
    upsert(next)
    if (supabase) {
      await supabase.from('bookings').update({ name: next.name, note: next.note }).eq('id', id)
    }
  }

  async function remove(id: string) {
    removeRow(id)
    if (supabase) await supabase.from('bookings').delete().eq('id', id)
  }

  const bookings = [...list].sort((a, b) => a.sort - b.sort)
  return { bookings, toggle, add, edit, remove }
}
