// Typed accessors over data/itinerary.json.
// Static import → the whole trip ships in the client bundle (offline-first).
import raw from '../../data/itinerary.json'

export type OptionKind = 'recommended' | 'alternative'

export interface TripOption {
  kind: OptionKind
  badge: string
  title: string
  plan: string
  food: string
}

export interface Tip {
  label: string
  body: string
}

/** A "things to do here" suggestion for a leg (place). */
/** Broad category so "things to do" can be grouped (restaurants, playgrounds,
 *  cultural, sports…). `other` is the fallback bucket for un-categorised
 *  family-added ideas. */
export type IdeaCategory =
  | 'sights'
  | 'outdoors'
  | 'rides'
  | 'playgrounds'
  | 'cultural'
  | 'sports'
  | 'shows'
  | 'food'
  | 'shopping'
  | 'other'

/** Who an idea suits best, so the mixed-age group (grown-ups, teens, and the
 *  little ones) can see at a glance what's for them. */
export type IdeaSuits = 'all' | 'littles' | 'teens' | 'adults'

export interface Idea {
  title: string
  note?: string
  category?: IdeaCategory
  suits?: IdeaSuits
}

export interface TripDay {
  n: number
  weekday: string
  date: string
  iso_date: string
  title: string
  subtitle: string
  options: TripOption[]
  tip: Tip | null
}

/** A hotel stay covering one or more nights. `check_in`/`check_out` are ISO
 *  dates; the stay covers the nights from check_in up to (not including)
 *  check_out — i.e. you sleep there on any day D where check_in ≤ D < check_out. */
export interface Stay {
  name: string
  address: string
  check_in: string
  check_out: string
}

export interface Leg {
  id: string
  num: string
  title: string
  range: string
  tagline: string
  notes: string
  ideas?: Idea[]
  /** Where the family sleeps during this leg (some legs switch hotels mid-way). */
  stays?: Stay[]
  days: TripDay[]
}

export interface Booking {
  name: string
  note: string
}

export interface PackingItem {
  name: string
  note: string
}

export interface Cost {
  item: string
  amount: string
}

export interface Meta {
  family: string
  trip: string
  start_date: string
  end_date: string
  travellers: number
  notes: string
}

export interface Itinerary {
  meta: Meta
  legs: Leg[]
  bookings: Booking[]
  packing: PackingItem[]
  costs: Cost[]
}

export const itinerary = raw as Itinerary

export const meta = itinerary.meta
export const legs = itinerary.legs
export const bookings = itinerary.bookings
export const packing = itinerary.packing
export const costs = itinerary.costs

/** Every day, flattened across all legs, in trip order (day 1 → 22). */
export const allDays: TripDay[] = legs.flatMap((leg) => leg.days)

export const TOTAL_DAYS = allDays.length
export const FIRST_DAY_N = allDays.length ? allDays[0].n : 1
export const LAST_DAY_N = allDays.length ? allDays[allDays.length - 1].n : TOTAL_DAYS

export function getLeg(id: string): Leg | undefined {
  return legs.find((leg) => leg.id === id)
}

export function getDay(n: number): TripDay | undefined {
  return allDays.find((day) => day.n === n)
}

/** The leg a given day number belongs to. */
export function getLegForDay(n: number): Leg | undefined {
  return legs.find((leg) => leg.days.some((day) => day.n === n))
}

/** Every hotel stay across the trip, in order. */
export const stays: Stay[] = legs.flatMap((leg) => leg.stays ?? [])

/** Where the family sleeps on the night of a given day (undefined on the final
 *  departure day, when there's no overnight stay). */
export function hotelForDay(day: TripDay): Stay | undefined {
  return stays.find((s) => day.iso_date >= s.check_in && day.iso_date < s.check_out)
}

/** Recommended option for a day (falls back to the first option). */
export function recommendedOption(day: TripDay): TripOption | undefined {
  return day.options.find((o) => o.kind === 'recommended') ?? day.options[0]
}

/** Alternatives for a day, in order. */
export function alternativeOptions(day: TripDay): TripOption[] {
  return day.options.filter((o) => o.kind === 'alternative')
}

/** RSVP choice keys map onto option slots for a given day. */
export type RsvpChoice = 'recommended' | 'alt1' | 'alt2' | 'skip'

/** Human label for an RSVP choice on a specific day. */
export function choiceLabel(day: TripDay, choice: RsvpChoice): string {
  if (choice === 'skip') return "Sitting this one out"
  if (choice === 'recommended') return recommendedOption(day)?.title ?? 'Recommended'
  const alts = alternativeOptions(day)
  if (choice === 'alt1') return alts[0]?.title ?? 'Alternative'
  if (choice === 'alt2') return alts[1]?.title ?? 'Alternative'
  return 'Recommended'
}

/** Slugify a booking/packing name into a stable key for the DB primary key. */
export function slugKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}
