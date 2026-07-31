// Zustand store for lightweight local state that must survive reloads and work
// with zero connectivity: booking ticks, per-user packing ticks and day RSVPs.
//
// This is the SINGLE source of truth the UI renders from. Hooks keep it in sync
// with Supabase (when configured): realtime pushes flow IN via `applyRemote*`,
// and optimistic local edits flow OUT via the hooks' write calls. With no
// backend, this store alone (persisted to localStorage) runs the whole app.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RsvpChoice } from '../lib/itinerary'

export interface BookingTick {
  checked: boolean
  checked_by: string | null
  checked_at: string | null
}

interface LocalState {
  // booking_key -> tick
  bookings: Record<string, BookingTick>
  // `${memberId}:${itemKey}` -> checked
  packing: Record<string, boolean>
  // `${memberId}:${dayN}` -> choice
  rsvp: Record<string, RsvpChoice>

  setBooking: (key: string, tick: BookingTick) => void
  setPacking: (memberId: string, itemKey: string, checked: boolean) => void
  setRsvp: (memberId: string, dayN: number, choice: RsvpChoice) => void

  // Bulk hydrate from a remote snapshot (called by hooks on first load).
  hydrateBookings: (rows: Record<string, BookingTick>) => void
  hydrateRsvp: (rows: Record<string, RsvpChoice>) => void
  hydratePacking: (rows: Record<string, boolean>) => void
}

export const rsvpKey = (memberId: string, dayN: number) => `${memberId}:${dayN}`
export const packingKey = (memberId: string, itemKey: string) => `${memberId}:${itemKey}`

export const useLocalStore = create<LocalState>()(
  persist(
    (set) => ({
      bookings: {},
      packing: {},
      rsvp: {},

      setBooking: (key, tick) =>
        set((s) => ({ bookings: { ...s.bookings, [key]: tick } })),

      setPacking: (memberId, itemKey, checked) =>
        set((s) => ({ packing: { ...s.packing, [packingKey(memberId, itemKey)]: checked } })),

      setRsvp: (memberId, dayN, choice) =>
        set((s) => ({ rsvp: { ...s.rsvp, [rsvpKey(memberId, dayN)]: choice } })),

      hydrateBookings: (rows) => set((s) => ({ bookings: { ...s.bookings, ...rows } })),
      hydrateRsvp: (rows) => set((s) => ({ rsvp: { ...s.rsvp, ...rows } })),
      hydratePacking: (rows) => set((s) => ({ packing: { ...s.packing, ...rows } })),
    }),
    { name: 'barham-trip-local-v1' },
  ),
)
