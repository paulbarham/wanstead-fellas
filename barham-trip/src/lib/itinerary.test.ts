import { describe, it, expect } from 'vitest'
import {
  legs,
  allDays,
  bookings,
  packing,
  costs,
  getDay,
  getLeg,
  recommendedOption,
  alternativeOptions,
  slugKey,
  TOTAL_DAYS,
} from './itinerary'

describe('itinerary data', () => {
  it('has five legs covering 22 contiguous days', () => {
    expect(legs.length).toBe(5)
    expect(TOTAL_DAYS).toBe(22)
    const ns = allDays.map((d) => d.n)
    expect(ns).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
  })

  it('every day has a recommended option and valid iso date', () => {
    for (const day of allDays) {
      expect(recommendedOption(day)).toBeTruthy()
      expect(day.iso_date).toMatch(/^2026-08-\d{2}$/)
      expect(day.options.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('alternatives never exceed two (alt1 / alt2 slots)', () => {
    for (const day of allDays) {
      expect(alternativeOptions(day).length).toBeLessThanOrEqual(2)
    }
  })

  it('lookups work', () => {
    expect(getDay(1)?.title).toContain('Arrival')
    expect(getLeg('vegas')?.title).toBe('Las Vegas')
    expect(getDay(999)).toBeUndefined()
  })

  it('has the expected checklist counts', () => {
    expect(bookings.length).toBe(20)
    expect(packing.length).toBe(10)
    expect(costs.length).toBeGreaterThan(0)
  })

  it('every idea has a known category and age-suitability tag', () => {
    const cats = new Set([
      'sights', 'outdoors', 'rides', 'playgrounds', 'cultural',
      'sports', 'shows', 'food', 'shopping', 'other',
    ])
    const suits = new Set(['all', 'littles', 'teens', 'adults'])
    for (const leg of legs) {
      for (const idea of leg.ideas ?? []) {
        expect(cats.has(idea.category ?? '')).toBe(true)
        expect(suits.has(idea.suits ?? '')).toBe(true)
      }
    }
  })

  it('food ideas never suggest seafood dishes', () => {
    // Named seafood dishes (the reassurance phrase "no seafood" is fine).
    const banned = /\b(oysters?|clam chowder|crab|lobster|shrimp|prawns?|sushi|scampi|mussels)\b/i
    for (const leg of legs) {
      for (const idea of leg.ideas ?? []) {
        if (idea.category !== 'food') continue
        expect(banned.test(idea.title)).toBe(false)
        expect(banned.test(idea.note ?? '')).toBe(false)
      }
    }
  })

  it('slugKey produces stable primary keys', () => {
    expect(slugKey('Muir Woods parking / shuttle reservation')).toBe(
      'muir-woods-parking-shuttle-reservation',
    )
    expect(slugKey('  ESTA ×6!! ')).toBe('esta-6')
  })
})
