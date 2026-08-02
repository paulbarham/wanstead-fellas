// Zustand store for lightweight local state that must survive reloads and work
// with zero connectivity: booking ticks, per-user packing ticks and day RSVPs.
//
// This is the SINGLE source of truth the UI renders from. Hooks keep it in sync
// with Supabase (when configured): realtime pushes flow IN via `applyRemote*`,
// and optimistic local edits flow OUT via the hooks' write calls. With no
// backend, this store alone (persisted to localStorage) runs the whole app.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { bookings as seedBookings, slugKey, type RsvpChoice } from '../lib/itinerary'

export interface BookingRow {
  id: string
  name: string
  note: string | null
  sort: number
  checked: boolean
  checked_by: string | null
  checked_at: string | null
}

/** Initial editable bookings list — seeded from the bundled JSON so the list is
 *  populated offline / on first load, before the DB (if any) syncs. */
const initialBookings: BookingRow[] = seedBookings.map((b, i) => ({
  id: slugKey(b.name),
  name: b.name,
  note: b.note,
  sort: i,
  checked: false,
  checked_by: null,
  checked_at: null,
}))

export interface BookingTick {
  checked: boolean
  checked_by: string | null
  checked_at: string | null
}

export interface UserIdea {
  id: string
  leg_id: string
  title: string
  note: string | null
  /** One of IdeaCategory (see lib/itinerary). Null/absent → shown under "More ideas". */
  category: string | null
  added_by: string | null
  created_at: string
}

/** A family-curated activity slotted onto a specific day's itinerary. Shared
 *  and collaborative — anyone can add, tick off, or remove one. */
export interface DayPlanItem {
  id: string
  day_n: number
  title: string
  note: string | null
  done: boolean
  added_by: string | null
  created_at: string
}

interface LocalState {
  // booking_key -> tick
  bookings: Record<string, BookingTick>
  // `${memberId}:${itemKey}` -> checked
  packing: Record<string, boolean>
  // `${memberId}:${dayN}` -> choice
  rsvp: Record<string, RsvpChoice>
  // legId -> family-added ideas
  userIdeas: Record<string, UserIdea[]>
  // dayN -> family-curated activities on that day
  dayPlans: Record<number, DayPlanItem[]>
  // editable, shared bookings list
  bookingsList: BookingRow[]

  setBooking: (key: string, tick: BookingTick) => void
  setPacking: (memberId: string, itemKey: string, checked: boolean) => void
  setRsvp: (memberId: string, dayN: number, choice: RsvpChoice) => void

  addUserIdea: (idea: UserIdea) => void
  removeUserIdea: (legId: string, id: string) => void
  /** Merge a remote snapshot of a leg's ideas into local state (by id). */
  mergeUserIdeas: (legId: string, ideas: UserIdea[]) => void

  addDayPlanItem: (item: DayPlanItem) => void
  removeDayPlanItem: (dayN: number, id: string) => void
  setDayPlanDone: (dayN: number, id: string, done: boolean) => void
  /** Merge a remote snapshot of a day's plan into local state (by id). */
  mergeDayPlanItems: (dayN: number, items: DayPlanItem[]) => void

  setBookingsList: (rows: BookingRow[]) => void
  upsertBookingRow: (row: BookingRow) => void
  removeBookingRow: (id: string) => void

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
      userIdeas: {},
      dayPlans: {},
      bookingsList: initialBookings,

      setBooking: (key, tick) =>
        set((s) => ({ bookings: { ...s.bookings, [key]: tick } })),

      setPacking: (memberId, itemKey, checked) =>
        set((s) => ({ packing: { ...s.packing, [packingKey(memberId, itemKey)]: checked } })),

      setRsvp: (memberId, dayN, choice) =>
        set((s) => ({ rsvp: { ...s.rsvp, [rsvpKey(memberId, dayN)]: choice } })),

      addUserIdea: (idea) =>
        set((s) => {
          const list = s.userIdeas[idea.leg_id] ?? []
          if (list.some((i) => i.id === idea.id)) return s
          return { userIdeas: { ...s.userIdeas, [idea.leg_id]: [...list, idea] } }
        }),

      removeUserIdea: (legId, id) =>
        set((s) => ({
          userIdeas: {
            ...s.userIdeas,
            [legId]: (s.userIdeas[legId] ?? []).filter((i) => i.id !== id),
          },
        })),

      mergeUserIdeas: (legId, ideas) =>
        set((s) => {
          const byId = new Map<string, UserIdea>()
          for (const i of s.userIdeas[legId] ?? []) byId.set(i.id, i)
          for (const i of ideas) byId.set(i.id, i)
          const merged = [...byId.values()].sort((a, b) =>
            a.created_at.localeCompare(b.created_at),
          )
          return { userIdeas: { ...s.userIdeas, [legId]: merged } }
        }),

      addDayPlanItem: (item) =>
        set((s) => {
          const list = s.dayPlans[item.day_n] ?? []
          if (list.some((i) => i.id === item.id)) return s
          return { dayPlans: { ...s.dayPlans, [item.day_n]: [...list, item] } }
        }),

      removeDayPlanItem: (dayN, id) =>
        set((s) => ({
          dayPlans: {
            ...s.dayPlans,
            [dayN]: (s.dayPlans[dayN] ?? []).filter((i) => i.id !== id),
          },
        })),

      setDayPlanDone: (dayN, id, done) =>
        set((s) => ({
          dayPlans: {
            ...s.dayPlans,
            [dayN]: (s.dayPlans[dayN] ?? []).map((i) => (i.id === id ? { ...i, done } : i)),
          },
        })),

      mergeDayPlanItems: (dayN, items) =>
        set((s) => {
          const byId = new Map<string, DayPlanItem>()
          for (const i of s.dayPlans[dayN] ?? []) byId.set(i.id, i)
          for (const i of items) byId.set(i.id, i)
          const merged = [...byId.values()].sort((a, b) =>
            a.created_at.localeCompare(b.created_at),
          )
          return { dayPlans: { ...s.dayPlans, [dayN]: merged } }
        }),

      setBookingsList: (rows) => set(() => ({ bookingsList: rows })),

      upsertBookingRow: (row) =>
        set((s) => {
          const idx = s.bookingsList.findIndex((b) => b.id === row.id)
          if (idx === -1) return { bookingsList: [...s.bookingsList, row] }
          const next = s.bookingsList.slice()
          next[idx] = row
          return { bookingsList: next }
        }),

      removeBookingRow: (id) =>
        set((s) => ({ bookingsList: s.bookingsList.filter((b) => b.id !== id) })),

      hydrateBookings: (rows) => set((s) => ({ bookings: { ...s.bookings, ...rows } })),
      hydrateRsvp: (rows) => set((s) => ({ rsvp: { ...s.rsvp, ...rows } })),
      hydratePacking: (rows) => set((s) => ({ packing: { ...s.packing, ...rows } })),
    }),
    { name: 'barham-trip-local-v1' },
  ),
)
