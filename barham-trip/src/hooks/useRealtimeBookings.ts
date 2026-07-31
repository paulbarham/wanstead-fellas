import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLocalStore, type BookingTick } from '../store/local'
import { useAuth } from './useAuth'

/**
 * Shared booking ticks across the whole family.
 * - Reads render from the local store (works offline).
 * - When Supabase is configured, hydrates from `booking_status`, subscribes to
 *   realtime changes, and writes optimistically on toggle.
 */
export function useRealtimeBookings() {
  const bookings = useLocalStore((s) => s.bookings)
  const setBooking = useLocalStore((s) => s.setBooking)
  const hydrate = useLocalStore((s) => s.hydrateBookings)
  const { member } = useAuth()

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase
      .from('booking_status')
      .select('booking_key, checked, checked_by, checked_at')
      .then(({ data }) => {
        if (!active || !data) return
        const rows: Record<string, BookingTick> = {}
        for (const r of data) {
          rows[r.booking_key] = {
            checked: r.checked,
            checked_by: r.checked_by,
            checked_at: r.checked_at,
          }
        }
        hydrate(rows)
      })

    const channel = supabase
      .channel('booking_status_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_status' },
        (payload) => {
          const row = payload.new as {
            booking_key: string
            checked: boolean
            checked_by: string | null
            checked_at: string | null
          }
          if (row?.booking_key) {
            setBooking(row.booking_key, {
              checked: row.checked,
              checked_by: row.checked_by,
              checked_at: row.checked_at,
            })
          }
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase?.removeChannel(channel)
    }
  }, [hydrate, setBooking])

  async function toggle(key: string) {
    const current = bookings[key]?.checked ?? false
    const next: BookingTick = {
      checked: !current,
      checked_by: member?.id ?? null,
      checked_at: new Date().toISOString(),
    }
    // Optimistic.
    setBooking(key, next)

    if (supabase) {
      await supabase.from('booking_status').upsert(
        {
          booking_key: key,
          checked: next.checked,
          checked_by: next.checked_by,
          checked_at: next.checked_at,
        },
        { onConflict: 'booking_key' },
      )
    }
  }

  return { bookings, toggle }
}
