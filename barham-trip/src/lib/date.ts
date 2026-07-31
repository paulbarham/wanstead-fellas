// Trip-day math. All comparisons are done on calendar dates (no time-of-day)
// against the traveller's LOCAL clock, so "today" flips at local midnight.
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { meta, allDays, FIRST_DAY_N, LAST_DAY_N, type TripDay } from './itinerary'

const startDate = parseISO(meta.start_date)
const endDate = parseISO(meta.end_date)

/** Strip a Date down to midnight local, so day-diffs are clean. */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export type TripPosition =
  | { phase: 'before'; daysUntil: number }
  | { phase: 'during'; day: TripDay }
  | { phase: 'after'; daysSince: number }

/**
 * Where are we relative to the trip, for a given "now" (defaults to real now)?
 * `during` returns the matching day object.
 */
export function tripPosition(now: Date = new Date()): TripPosition {
  const today = atMidnight(now)
  const start = atMidnight(startDate)
  const end = atMidnight(endDate)

  if (today < start) {
    return { phase: 'before', daysUntil: differenceInCalendarDays(start, today) }
  }
  if (today > end) {
    return { phase: 'after', daysSince: differenceInCalendarDays(today, end) }
  }

  // During the trip: match by ISO date, falling back to index by offset.
  const iso = isoOf(today)
  const byIso = allDays.find((d) => d.iso_date === iso)
  if (byIso) return { phase: 'during', day: byIso }

  const offset = differenceInCalendarDays(today, start)
  const day = allDays[Math.min(Math.max(offset, 0), allDays.length - 1)]
  return { phase: 'during', day }
}

function isoOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Clamp a day number to the valid trip range. */
export function clampDayN(n: number): number {
  return Math.min(Math.max(n, FIRST_DAY_N), LAST_DAY_N)
}

export function hasPrevDay(n: number): boolean {
  return n > FIRST_DAY_N
}
export function hasNextDay(n: number): boolean {
  return n < LAST_DAY_N
}
