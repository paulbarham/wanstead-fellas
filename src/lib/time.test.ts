import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getMatchPhase,
  canGenerateTeams,
  getVotingWindow,
  getCountdownLabel,
} from './time'

// All fixtures use Thursday 2026-06-18 as the match date. London is on BST
// (UTC+1) in June, so London-local times map to UTC by subtracting one hour.
const THU = '2026-06-18'

function at(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('getMatchPhase', () => {
  it('is signup_open before the Wednesday 10pm deadline', () => {
    at('2026-06-17T20:59:00Z') // Wed 21:59 BST
    expect(getMatchPhase(THU)).toBe('signup_open')
  })

  it('locks at Wednesday 10pm London', () => {
    at('2026-06-17T21:00:00Z') // Wed 22:00 BST exactly
    expect(getMatchPhase(THU)).toBe('signup_locked')
  })

  it('stays locked up to Thursday 9am', () => {
    at('2026-06-18T07:00:00Z') // Thu 08:00 BST
    expect(getMatchPhase(THU)).toBe('signup_locked')
  })

  // NOTE: the code's threshold is Thu 9am (setHours(..,9)), even though the
  // MatchPhase type comment documents "Thu 9pm". This test pins the *actual*
  // behaviour; see the discrepancy flagged to the maintainer.
  it('flips to match_live from Thursday 9am', () => {
    at('2026-06-18T08:00:00Z') // Thu 09:00 BST exactly
    expect(getMatchPhase(THU)).toBe('match_live')
  })

  it('is match_live in the evening too', () => {
    at('2026-06-18T20:30:00Z') // Thu 21:30 BST
    expect(getMatchPhase(THU)).toBe('match_live')
  })

  it('is post_match after Thu 10pm', () => {
    at('2026-06-18T21:01:00Z') // Thu 22:01 BST
    expect(getMatchPhase(THU)).toBe('post_match')
  })
})

describe('canGenerateTeams', () => {
  it('is false before signups close (Wed 10pm)', () => {
    at('2026-06-17T20:00:00Z') // Wed 21:00 BST
    expect(canGenerateTeams(THU)).toBe(false)
  })

  it('is true once signups close', () => {
    at('2026-06-17T21:30:00Z') // Wed 22:30 BST
    expect(canGenerateTeams(THU)).toBe(true)
  })

  it('is true up to 30 min before kick-off', () => {
    at('2026-06-18T19:29:00Z') // Thu 20:29 BST
    expect(canGenerateTeams(THU)).toBe(true)
  })

  it('locks 30 min before kick-off (Thu 8:30pm)', () => {
    at('2026-06-18T19:30:00Z') // Thu 20:30 BST exactly
    expect(canGenerateTeams(THU)).toBe(false)
  })
})

describe('getVotingWindow', () => {
  it('opens 10pm match night and closes 9am next day (London)', () => {
    const { opens_at, closes_at } = getVotingWindow(THU)
    // Thu 22:00 BST = 21:00 UTC
    expect(opens_at).toBe('2026-06-18T21:00:00.000Z')
    // Fri 09:00 BST = 08:00 UTC
    expect(closes_at).toBe('2026-06-19T08:00:00.000Z')
  })
})

describe('getCountdownLabel', () => {
  it('says TONIGHT on match day', () => {
    at('2026-06-18T12:00:00Z') // Thu midday BST
    const { text, tonight } = getCountdownLabel(THU)
    expect(tonight).toBe(true)
    expect(text).toContain('TONIGHT')
  })

  it('says Tomorrow the day before', () => {
    at('2026-06-17T12:00:00Z') // Wed midday
    const { text, tonight } = getCountdownLabel(THU)
    expect(tonight).toBe(false)
    expect(text).toContain('Tomorrow')
  })

  it('counts days away earlier in the week', () => {
    at('2026-06-15T12:00:00Z') // Mon midday → 3 days away
    const { text } = getCountdownLabel(THU)
    expect(text).toBe('Thursday · 3 days away')
  })
})
