import { describe, it, expect } from 'vitest'
import { tripPosition, clampDayN, hasPrevDay, hasNextDay } from './date'

describe('tripPosition', () => {
  it('reports days-until before the trip', () => {
    const pos = tripPosition(new Date('2026-08-01T09:00:00'))
    expect(pos.phase).toBe('before')
    if (pos.phase === 'before') expect(pos.daysUntil).toBe(7)
  })

  it('matches the right day during the trip', () => {
    const pos = tripPosition(new Date('2026-08-14T12:00:00'))
    expect(pos.phase).toBe('during')
    if (pos.phase === 'during') {
      expect(pos.day.n).toBe(7)
      expect(pos.day.iso_date).toBe('2026-08-14')
    }
  })

  it('handles the first and last day inclusively', () => {
    const first = tripPosition(new Date('2026-08-08T23:00:00'))
    const last = tripPosition(new Date('2026-08-29T06:00:00'))
    expect(first.phase).toBe('during')
    expect(last.phase).toBe('during')
    if (first.phase === 'during') expect(first.day.n).toBe(1)
    if (last.phase === 'during') expect(last.day.n).toBe(22)
  })

  it('reports days-since after the trip', () => {
    const pos = tripPosition(new Date('2026-09-01T09:00:00'))
    expect(pos.phase).toBe('after')
    if (pos.phase === 'after') expect(pos.daysSince).toBe(3)
  })
})

describe('day navigation helpers', () => {
  it('clamps to the valid range', () => {
    expect(clampDayN(0)).toBe(1)
    expect(clampDayN(99)).toBe(22)
    expect(clampDayN(10)).toBe(10)
  })

  it('knows the edges', () => {
    expect(hasPrevDay(1)).toBe(false)
    expect(hasNextDay(1)).toBe(true)
    expect(hasPrevDay(22)).toBe(true)
    expect(hasNextDay(22)).toBe(false)
  })
})
