import { describe, it, expect } from 'vitest'
import {
  legs,
  allDays,
  bookings,
  packing,
  costs,
  meta,
  getDay,
  getLeg,
  recommendedOption,
  alternativeOptions,
  slugKey,
  FIRST_DAY_N,
  LAST_DAY_N,
} from './itinerary'

// Trip-agnostic shape checks — pass for any valid itinerary.json.
describe('itinerary shape', () => {
  it('has at least one leg and a sensible meta', () => {
    expect(legs.length).toBeGreaterThanOrEqual(1)
    expect(meta.start_date <= meta.end_date).toBe(true)
    expect(meta.travellers).toBeGreaterThan(0)
  })

  it('day numbers are contiguous from 1', () => {
    const ns = allDays.map((d) => d.n)
    expect(ns).toEqual(Array.from({ length: allDays.length }, (_, i) => i + 1))
    expect(FIRST_DAY_N).toBe(1)
    expect(LAST_DAY_N).toBe(allDays.length)
  })

  it('every day has a recommended option, valid iso date, ≤2 alternatives', () => {
    for (const day of allDays) {
      expect(recommendedOption(day)).toBeTruthy()
      expect(day.iso_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(day.options.length).toBeGreaterThanOrEqual(1)
      expect(alternativeOptions(day).length).toBeLessThanOrEqual(2)
    }
  })

  it('lookups work', () => {
    expect(getDay(FIRST_DAY_N)).toBeDefined()
    expect(getLeg(legs[0].id)?.id).toBe(legs[0].id)
    expect(getDay(99999)).toBeUndefined()
    expect(getLeg('nope')).toBeUndefined()
  })

  it('has the checklist arrays', () => {
    expect(Array.isArray(bookings)).toBe(true)
    expect(Array.isArray(packing)).toBe(true)
    expect(costs.length).toBeGreaterThan(0)
  })

  it('slugKey produces stable primary keys', () => {
    expect(slugKey('Muir Woods parking / shuttle reservation')).toBe(
      'muir-woods-parking-shuttle-reservation',
    )
    expect(slugKey('  ESTA ×6!! ')).toBe('esta-6')
  })
})
