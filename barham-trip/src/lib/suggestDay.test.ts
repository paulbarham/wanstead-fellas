import { describe, it, expect } from 'vitest'
import { getLeg } from './itinerary'
import { scoreDays, bestDay, complements, thematicFit } from './suggestDay'

const sf = getLeg('sf')!
const alcatraz = sf.ideas!.find((i) => i.title === 'Alcatraz Island')!
const cableCar = sf.ideas!.find((i) => i.title === 'Ride a cable car')!

describe('suggestDay', () => {
  it('scores one entry per day in the leg', () => {
    const scores = scoreDays(sf, alcatraz, {})
    expect(scores.length).toBe(sf.days.length)
  })

  it('sends a themed idea to its matching day', () => {
    // Alcatraz should land on the "Alcatraz & the waterfront" day.
    const best = bestDay(scoreDays(sf, alcatraz, {}))!
    expect(best.day.title).toContain('Alcatraz')
    expect(best.fits).toBe(true)
  })

  it('prefers the lighter day when nothing else separates them', () => {
    // Cable car has no strong thematic day; load up day 1 and it should avoid it.
    const busy = { 1: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] }
    const best = bestDay(scoreDays(sf, cableCar, busy))!
    expect(best.day.n).not.toBe(1)
  })

  it('reflects planned count in the reason', () => {
    const scores = scoreDays(sf, cableCar, { 1: [{ title: 'x' }] })
    const day1 = scores.find((s) => s.day.n === 1)!
    expect(day1.count).toBe(1)
  })

  it('suggests complementary ideas, same category first, excluding self + planned', () => {
    const comps = complements(sf, alcatraz, new Set<string>(), 3)
    expect(comps.length).toBe(3)
    expect(comps.map((c) => c.title)).not.toContain('Alcatraz Island')
    // top pick should share Alcatraz's category (sights)
    expect(comps[0].category).toBe('sights')
    // excludes anything already planned
    const excluded = complements(sf, alcatraz, new Set([comps[0].title]), 3)
    expect(excluded.map((c) => c.title)).not.toContain(comps[0].title)
  })

  it('thematicFit is false for an unrelated day', () => {
    const arrival = sf.days.find((d) => d.title.includes('Arrival'))!
    expect(thematicFit(arrival, alcatraz)).toBe(false)
  })
})
