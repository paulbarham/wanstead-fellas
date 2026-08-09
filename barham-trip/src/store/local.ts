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
  /** Manual display order within the day (drag-to-reorder). */
  sort: number
  added_by: string | null
  created_at: string
}

/** Order day-plan items by manual sort, then creation as a stable tiebreak. */
export function sortDayPlan(a: DayPlanItem, b: DayPlanItem): number {
  return (a.sort ?? 0) - (b.sort ?? 0) || a.created_at.localeCompare(b.created_at)
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
  // dayN -> option_keys the admin has removed from the suggested plan
  dismissedOptions: Record<number, string[]>
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
  /** Apply a manual order (list of ids) — sets each item's sort to its index. */
  setDayPlanOrder: (dayN: number, orderedIds: string[]) => void
  /** Merge a remote snapshot of a day's plan into local state (by id). */
  mergeDayPlanItems: (dayN: number, items: DayPlanItem[]) => void

  addDismissedOption: (dayN: number, optionKey: string) => void
  removeDismissedOption: (dayN: number, optionKey: string) => void
  /** Replace the dismissed-option keys for a day from a remote snapshot. */
  setDismissedOptions: (dayN: number, keys: string[]) => void

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
      dismissedOptions: {},
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
          return { dayPlans: { ...s.dayPlans, [item.day_n]: [...list, item].sort(sortDayPlan) } }
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

      setDayPlanOrder: (dayN, orderedIds) =>
        set((s) => {
          const byId = new Map((s.dayPlans[dayN] ?? []).map((i) => [i.id, i]))
          const next = orderedIds
            .map((id, idx) => {
              const it = byId.get(id)
              return it ? { ...it, sort: idx } : null
            })
            .filter((i): i is DayPlanItem => i !== null)
          return { dayPlans: { ...s.dayPlans, [dayN]: next } }
        }),

      mergeDayPlanItems: (dayN, items) =>
        set((s) => {
          const byId = new Map<string, DayPlanItem>()
          for (const i of s.dayPlans[dayN] ?? []) byId.set(i.id, i)
          for (const i of items) byId.set(i.id, i)
          const merged = [...byId.values()].sort(sortDayPlan)
          return { dayPlans: { ...s.dayPlans, [dayN]: merged } }
        }),

      addDismissedOption: (dayN, optionKey) =>
        set((s) => {
          const list = s.dismissedOptions[dayN] ?? []
          if (list.includes(optionKey)) return s
          return { dismissedOptions: { ...s.dismissedOptions, [dayN]: [...list, optionKey] } }
        }),

      removeDismissedOption: (dayN, optionKey) =>
        set((s) => ({
          dismissedOptions: {
            ...s.dismissedOptions,
            [dayN]: (s.dismissedOptions[dayN] ?? []).filter((k) => k !== optionKey),
          },
        })),

      setDismissedOptions: (dayN, keys) =>
        set((s) => ({ dismissedOptions: { ...s.dismissedOptions, [dayN]: keys } })),

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
