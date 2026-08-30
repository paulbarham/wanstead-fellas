import { describe, it, expect } from 'vitest'
import type { Profile } from '../types'
import { enforceBalanceConstraints, isStar, isOver40, starCapFor } from './balance'

let seq = 0
function p(opts: { ovr?: number; age?: string; pos?: string } = {}): Profile {
  seq += 1
  return {
    id: `p${seq}`,
    name: `P${seq}`,
    surname: 'X',
    overall_rating: opts.ovr ?? 6,
    age_group: opts.age ?? '30–39',
    preferred_position_primary: opts.pos ?? 'MID',
  } as unknown as Profile
}

const starsOn = (teams: Profile[][]) => teams.map(t => t.filter(isStar).length)
const oldsOn = (teams: Profile[][]) => teams.map(t => t.filter(isOver40).length)

describe('starCapFor', () => {
  it('spreads 4 stars across 4 teams one each — the old hardcoded 2 allowed 2/2/0/0', () => {
    expect(starCapFor(4, 4)).toBe(1)
  })

  it('stays achievable when stars outnumber the old cap capacity', () => {
    // 6 Aug 2026: 5 stars, 2 teams. Old cap of 2 gave capacity 4 — impossible.
    expect(starCapFor(5, 2)).toBe(3)
    expect(starCapFor(9, 4)).toBe(3)
  })

  it('never returns 0, even with no stars', () => {
    expect(starCapFor(0, 4)).toBe(1)
  })
})

describe('enforceBalanceConstraints', () => {
  it('breaks up star stacking on a 4-team night', () => {
    const teams = [
      [p({ ovr: 9 }), p({ ovr: 9 }), p({ ovr: 5 })],
      [p({ ovr: 9 }), p({ ovr: 9 }), p({ ovr: 5 })],
      [p({ ovr: 5 }), p({ ovr: 5 }), p({ ovr: 5 })],
      [p({ ovr: 5 }), p({ ovr: 5 }), p({ ovr: 5 })],
    ]
    const out = enforceBalanceConstraints(teams)
    // 4 stars / 4 teams → cap 1, so no team may keep 2.
    expect(Math.max(...starsOn(out))).toBe(1)
    expect(out.flat()).toHaveLength(12)
  })

  it('still runs the age pass when the star cap cannot be satisfied', () => {
    // THE REGRESSION TEST. Three stars all play GK, and there is no
    // non-star GK anywhere to swap with, so the star pass is stuck.
    // The old code `break`ed here and never balanced the over-40s.
    const teams = [
      [
        p({ ovr: 9, pos: 'GK' }), p({ ovr: 9, pos: 'GK' }), p({ ovr: 9, pos: 'GK' }),
        p({ ovr: 5, age: '40–49' }), p({ ovr: 5, age: '40–49' }), p({ ovr: 5, age: '40–49' }),
      ],
      [
        p({ ovr: 5 }), p({ ovr: 5 }), p({ ovr: 5 }), p({ ovr: 5 }), p({ ovr: 5 }), p({ ovr: 5 }),
      ],
    ]
    const before = oldsOn(teams)
    expect(before).toEqual([3, 0])

    const out = enforceBalanceConstraints(teams)
    const after = oldsOn(out)

    // Age spread must now be within tolerance despite the stuck star pass.
    expect(Math.max(...after) - Math.min(...after)).toBeLessThanOrEqual(1)
    expect(out.flat()).toHaveLength(12)
  })

  it('evens out over-40 stacking', () => {
    const teams = [
      [p({ age: '40–49' }), p({ age: '50+' }), p({ age: '40–49' }), p({ age: '20–29' })],
      [p({ age: '20–29' }), p({ age: '20–29' }), p({ age: '30–39' }), p({ age: '20–29' })],
    ]
    const out = enforceBalanceConstraints(teams)
    const olds = oldsOn(out)
    expect(Math.max(...olds) - Math.min(...olds)).toBeLessThanOrEqual(1)
  })

  it('never loses, duplicates or invents a player', () => {
    const teams = [
      [p({ ovr: 9, age: '40–49' }), p({ ovr: 9 }), p({ ovr: 4 })],
      [p({ ovr: 9 }), p({ ovr: 3, age: '50+' }), p({ ovr: 4 })],
      [p({ ovr: 5 }), p({ ovr: 5, age: '40–49' }), p({ ovr: 6 })],
      [p({ ovr: 5 }), p({ ovr: 7 }), p({ ovr: 6 })],
    ]
    const inputIds = teams.flat().map(x => x.id).sort()
    const out = enforceBalanceConstraints(teams)
    expect(out.flat().map(x => x.id).sort()).toEqual(inputIds)
    // Team sizes preserved — swaps are 1-for-1.
    expect(out.map(t => t.length)).toEqual([3, 3, 3, 3])
  })

  it('leaves already-balanced teams alone', () => {
    const teams = [
      [p({ ovr: 9 }), p({ ovr: 5, age: '40–49' })],
      [p({ ovr: 9 }), p({ ovr: 5, age: '40–49' })],
    ]
    const out = enforceBalanceConstraints(teams)
    expect(starsOn(out)).toEqual([1, 1])
    expect(oldsOn(out)).toEqual([1, 1])
  })
})
