import { describe, it, expect } from 'vitest'
import { parseISO, subDays, addDays } from 'date-fns'
import { tripPosition, clampDayN, hasPrevDay, hasNextDay } from './date'
import { meta, allDays, FIRST_DAY_N, LAST_DAY_N } from './itinerary'

const start = parseISO(meta.start_date)
const end = parseISO(meta.end_date)

// Trip-agnostic — derived from meta, so they pass for any itinerary.
describe('tripPosition', () => {
  it('reports days-until before the trip', () => {
    const pos = tripPosition(subDays(start, 3))
    expect(pos.phase).toBe('before')
    if (pos.phase === 'before') expect(pos.daysUntil).toBe(3)
  })

  it('is the first day on the start date', () => {
    const pos = tripPosition(start)
    expect(pos.phase).toBe('during')
    if (pos.phase === 'during') expect(pos.day.n).toBe(FIRST_DAY_N)
  })

  it('is the last day on the end date', () => {
    const pos = tripPosition(end)
    expect(pos.phase).toBe('during')
    if (pos.phase === 'during') expect(pos.day.n).toBe(LAST_DAY_N)
  })

  it('reports days-since after the trip', () => {
    const pos = tripPosition(addDays(end, 2))
    expect(pos.phase).toBe('after')
    if (pos.phase === 'after') expect(pos.daysSince).toBe(2)
  })
})

describe('day navigation helpers', () => {
  it('clamps to the valid range', () => {
    expect(clampDayN(0)).toBe(FIRST_DAY_N)
    expect(clampDayN(99999)).toBe(LAST_DAY_N)
  })

  it('knows the edges', () => {
    expect(hasPrevDay(FIRST_DAY_N)).toBe(false)
    expect(hasNextDay(LAST_DAY_N)).toBe(false)
    if (allDays.length > 1) {
      expect(hasNextDay(FIRST_DAY_N)).toBe(true)
      expect(hasPrevDay(LAST_DAY_N)).toBe(true)
    }
  })
})
